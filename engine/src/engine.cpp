#include "hts/engine.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace hts {

HumSearchEngine::HumSearchEngine(EngineConfig config)
    : config_(config),
      pitch_(config.pitch),
      segmenter_(config.segmenter),
      trie_(config.trieDepth) {}

std::uint32_t HumSearchEngine::addSong(const std::string& title, const std::string& composer,
                                       const std::vector<float>& midi) {
  Song song;
  song.id = static_cast<std::uint32_t>(songs_.size());
  song.title = title;
  song.composer = composer;
  song.midi = midi;
  song.contour = encodeContour(midi, 0.5f);
  trie_.insertSong(song.id, song.contour.steps);
  songs_.push_back(std::move(song));
  return songs_.back().id;
}

void HumSearchEngine::setTolerance(float tolerance) {
  config_.tolerance = std::clamp(tolerance, 0.25f, 3.0f);
}

int HumSearchEngine::budgetFor(std::size_t steps) const {
  // Roughly one full error per four steps at tolerance 1, never less than one
  // "same/up" confusion, never so loose that everything matches.
  const float raw = 0.5f * static_cast<float>(steps) * config_.tolerance;
  return std::clamp(static_cast<int>(std::lround(raw)), 2, 14);
}

FrameReport HumSearchEngine::pushFrame(const float* samples, std::size_t count, float sampleRate,
                                       double timeMs) {
  FrameReport report;
  if (count == 0) return report;
  report.pitch = pitch_.detect(samples, count, sampleRate);
  if (report.pitch.voiced) report.midi = hzToMidi(report.pitch.hz);

  // Re-articulation dips are short; measure loudness over the newest quarter
  // of the frame so a 40 ms "da-da" gap is not averaged away by the window.
  const std::size_t tail = std::max<std::size_t>(1, count / 4);
  double energy = 0.0;
  for (std::size_t i = count - tail; i < count; ++i) energy += static_cast<double>(samples[i]) * samples[i];
  const auto recentRms = static_cast<float>(std::sqrt(energy / static_cast<double>(tail)));

  FrameObservation obs{report.pitch.voiced, report.midi, recentRms, timeMs};
  Note note;
  if (segmenter_.push(obs, note)) {
    notes_.push_back(note);
    report.noteCompleted = true;
    search();
    report.searched = true;
  }
  report.activeMidi = segmenter_.active() ? segmenter_.activeMidi() : 0.0f;
  return report;
}

bool HumSearchEngine::pushNote(float midi, double startMs, double durationMs) {
  notes_.push_back(Note{midi, startMs, durationMs});
  search();
  return true;
}

bool HumSearchEngine::endInput() {
  Note note;
  if (!segmenter_.flush(note)) return false;
  notes_.push_back(note);
  search();
  return true;
}

void HumSearchEngine::resetQuery() {
  segmenter_.reset();
  notes_.clear();
  ranking_.clear();
  ranked_.clear();
  const std::uint64_t version = outcome_.version + 1;
  outcome_ = SearchOutcome{};
  outcome_.version = version;
}

float HumSearchEngine::rescoreIntervals(const Song& song, std::size_t offset,
                                        const std::vector<float>& query) const {
  // Semitone-level alignment of the query against the song from `offset`.
  // Substitution cost grows with the interval error (capped at a fourth);
  // the song side may end anywhere, so unmatched trailing notes are free.
  const std::vector<float>& target = song.contour.semitones;
  const std::size_t m = query.size();
  const std::size_t n = std::min(target.size() - offset, m + 4);
  constexpr float kGap = 0.75f;
  constexpr float kCap = 4.0f;

  std::vector<float> prev(n + 1), cur(n + 1);
  for (std::size_t j = 0; j <= n; ++j) prev[j] = kGap * static_cast<float>(j);
  for (std::size_t i = 1; i <= m; ++i) {
    cur[0] = kGap * static_cast<float>(i);
    for (std::size_t j = 1; j <= n; ++j) {
      const float diff = std::min(std::fabs(query[i - 1] - target[offset + j - 1]), kCap) / kCap;
      cur[j] = std::min({prev[j - 1] + diff, prev[j] + kGap, cur[j - 1] + kGap});
    }
    std::swap(prev, cur);
  }
  const float cost = *std::min_element(prev.begin(), prev.end());
  return std::clamp(1.0f - cost / static_cast<float>(m), 0.0f, 1.0f);
}

void HumSearchEngine::search() {
  const auto started = std::chrono::steady_clock::now();
  SearchOutcome next;
  next.version = outcome_.version + 1;

  // Query: the most recent window of steps.
  const std::size_t window = config_.queryWindow + 1;
  std::vector<float> midi;
  const std::size_t first = notes_.size() > window ? notes_.size() - window : 0;
  for (std::size_t i = first; i < notes_.size(); ++i) midi.push_back(notes_[i].midi);
  const Contour contour = encodeContour(midi);
  next.query = contour.steps;
  next.querySemitones = contour.semitones;

  std::vector<Candidate> candidates;
  if (next.query.size() >= config_.minQuerySteps) {
    next.budget = budgetFor(next.query.size());
    trie_.search(next.query, next.budget, matches_, &next.trieStats, &next.trace, config_.traceLimit);

    const float m = static_cast<float>(next.query.size());
    std::unordered_map<std::uint32_t, Candidate> bestBySong;
    for (const auto& match : matches_) {
      Candidate c;
      c.song = match.song;
      c.distance = match.distance;
      c.offset = match.offset;
      c.length = match.length;
      c.contourScore = std::clamp(1.0f - static_cast<float>(match.distance) / (2.0f * m), 0.0f, 1.0f);
      c.intervalScore = rescoreIntervals(songs_[match.song], match.offset, next.querySemitones);
      c.score = 0.45f * c.contourScore + 0.55f * c.intervalScore;
      auto it = bestBySong.find(c.song);
      if (it == bestBySong.end() || c.score > it->second.score) bestBySong[c.song] = c;
    }
    candidates.reserve(bestBySong.size());
    for (auto& entry : bestBySong) candidates.push_back(entry.second);
  }

  const RbCounters before = ranking_.counters();
  updateRanking(candidates);
  const RbCounters& after = ranking_.counters();
  next.rankStats.rotations = static_cast<std::uint32_t>(after.rotations - before.rotations);
  next.rankStats.recolors = static_cast<std::uint32_t>(after.recolors - before.recolors);
  next.rankStats.inserts = static_cast<std::uint32_t>(after.inserts - before.inserts);
  next.rankStats.erases = static_cast<std::uint32_t>(after.erases - before.erases);
  next.rankStats.unchanged = static_cast<std::uint32_t>(candidates.size()) -
                             std::min<std::uint32_t>(next.rankStats.inserts,
                                                     static_cast<std::uint32_t>(candidates.size()));

  // Top k straight from the tree's in-order walk: O(log n + k).
  ranking_.forEach([&](const RankKey& key) {
    next.top.push_back(ranked_.at(key.song));
    return next.top.size() < config_.topK;
  });
  next.candidateCount = ranking_.size();

  if (!next.top.empty()) {
    const float s1 = next.top[0].score;
    const float s2 = next.top.size() > 1 ? next.top[1].score : 0.0f;
    const float separation = std::clamp((s1 - s2) / 0.2f, 0.0f, 1.0f);
    const float quality = std::clamp((s1 - 0.55f) / 0.35f, 0.0f, 1.0f);
    const float length = std::clamp((static_cast<float>(next.query.size()) - 2.0f) / 9.0f, 0.0f, 1.0f);
    next.confidence = length * (0.55f * separation + 0.45f * quality);
  }

  next.searchMicros = std::chrono::duration<double, std::micro>(
                          std::chrono::steady_clock::now() - started).count();
  outcome_ = std::move(next);
}

void HumSearchEngine::updateRanking(const std::vector<Candidate>& candidates) {
  std::unordered_map<std::uint32_t, const Candidate*> incoming;
  incoming.reserve(candidates.size());
  for (const Candidate& c : candidates) incoming[c.song] = &c;

  // Songs that no longer survive the trie search leave the leaderboard.
  for (auto it = ranked_.begin(); it != ranked_.end();) {
    if (incoming.find(it->first) == incoming.end()) {
      ranking_.erase(RankKey{it->second.score, it->first});
      it = ranked_.erase(it);
    } else {
      ++it;
    }
  }

  // Changed scores move: erase the old key, insert the new one, O(log n) each.
  for (const Candidate& c : candidates) {
    auto it = ranked_.find(c.song);
    if (it != ranked_.end()) {
      if (it->second.score == c.score) {
        it->second = c;
        continue;
      }
      ranking_.erase(RankKey{it->second.score, c.song});
    }
    ranking_.insert(RankKey{c.score, c.song});
    ranked_[c.song] = c;
  }
}

}  // namespace hts
