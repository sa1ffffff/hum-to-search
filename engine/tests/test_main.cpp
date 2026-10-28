// Native test suite for the engine. Build and run with `npm run test:engine`.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <random>
#include <set>
#include <string>
#include <vector>

#include "hts/contour.hpp"
#include "hts/engine.hpp"
#include "hts/notes.hpp"
#include "hts/pitch.hpp"
#include "hts/rbtree.hpp"
#include "hts/trie.hpp"

namespace {

struct LibrarySong {
  const char* title;
  const char* composer;
  std::vector<float> midi;
  std::vector<float> beats;
};

const std::vector<LibrarySong> kLibrary = {
#include "library.inc"
};

constexpr double kPi = 3.14159265358979323846;

int g_failures = 0;
int g_checks = 0;

#define CHECK(cond)                                                          \
  do {                                                                       \
    ++g_checks;                                                              \
    if (!(cond)) {                                                           \
      ++g_failures;                                                          \
      std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);          \
    }                                                                        \
  } while (0)

void run(const char* name, const std::function<void()>& test) {
  const int before = g_failures;
  test();
  std::printf("%s %s\n", g_failures == before ? "ok  " : "FAIL", name);
}

hts::HumSearchEngine makeEngine(hts::EngineConfig config = {}) {
  hts::HumSearchEngine engine(config);
  for (const auto& song : kLibrary) engine.addSong(song.title, song.composer, song.midi);
  return engine;
}

// A hum-like tone: fundamental plus decaying harmonics, with vibrato.
void synthesizeNote(std::vector<float>& out, float midi, double seconds, float sampleRate,
                    double& phase, float amplitude = 0.3f) {
  const auto count = static_cast<std::size_t>(seconds * sampleRate);
  const float hz = hts::midiToHz(midi);
  for (std::size_t i = 0; i < count; ++i) {
    const double t = static_cast<double>(i) / sampleRate;
    const double vibrato = 1.0 + 0.004 * std::sin(2.0 * kPi * 5.5 * t);
    phase += 2.0 * kPi * hz * vibrato / sampleRate;
    // Short attack and release so repeated notes re-articulate.
    const double edge = std::min({1.0, t / 0.02, (seconds - t) / 0.03});
    const double sample = std::sin(phase) + 0.5 * std::sin(2 * phase) + 0.25 * std::sin(3 * phase);
    out.push_back(static_cast<float>(amplitude * std::max(0.0, edge) * sample / 1.75));
  }
}

void synthesizeGap(std::vector<float>& out, double seconds, float sampleRate) {
  out.insert(out.end(), static_cast<std::size_t>(seconds * sampleRate), 0.0f);
}

}  // namespace

int main() {
  std::printf("library: %zu songs\n\n", kLibrary.size());

  run("rbtree: random inserts and erases keep every invariant", [] {
    hts::RedBlackTree<int> tree;
    std::set<int> reference;
    std::mt19937 rng(7);
    std::uniform_int_distribution<int> key(0, 999);
    for (int i = 0; i < 6000; ++i) {
      const int k = key(rng);
      if (rng() % 3 == 0) {
        CHECK(tree.erase(k) == (reference.erase(k) == 1));
      } else {
        CHECK(tree.insert(k) == reference.insert(k).second);
      }
      if (i % 50 == 0) CHECK(tree.validate() > 0 || tree.empty());
    }
    CHECK(tree.validate() > 0);
    CHECK(tree.size() == reference.size());
    std::vector<int> inOrder;
    tree.forEach([&](int k) { inOrder.push_back(k); return true; });
    CHECK(std::equal(inOrder.begin(), inOrder.end(), reference.begin(), reference.end()));
    const double bound = 2.0 * std::log2(static_cast<double>(tree.size()) + 1.0);
    CHECK(tree.height() <= bound);
  });

  run("rbtree: ascending inserts stay logarithmic", [] {
    hts::RedBlackTree<int> tree;
    for (int i = 0; i < 4096; ++i) tree.insert(i);
    CHECK(tree.validate() > 0);
    CHECK(tree.height() <= 2 * 13);
    CHECK(tree.counters().rotations > 0);
    for (int i = 0; i < 4096; i += 2) CHECK(tree.erase(i));
    CHECK(tree.validate() > 0);
    CHECK(tree.size() == 2048);
    CHECK(!tree.contains(0) && tree.contains(1));
  });

  run("rbtree: snapshot mirrors the tree", [] {
    hts::RedBlackTree<int> tree;
    for (int k : {5, 3, 8, 1, 4, 7, 9, 2, 6}) tree.insert(k);
    const auto nodes = tree.snapshot();
    CHECK(nodes.size() == 9);
    CHECK(!nodes[0].red);  // root is black
    for (const auto& n : nodes) {
      if (n.red) {
        if (n.left >= 0) CHECK(!nodes[static_cast<std::size_t>(n.left)].red);
        if (n.right >= 0) CHECK(!nodes[static_cast<std::size_t>(n.right)].red);
      }
    }
  });

  run("contour: directions are key invariant", [] {
    const auto a = hts::encodeContour({60, 62, 62, 59, 67});
    const auto b = hts::encodeContour({65.3f, 67.1f, 67.4f, 63.9f, 72.2f});
    CHECK(hts::toString(a.steps) == "USDU");
    CHECK(hts::toString(b.steps) == "USDU");
    CHECK(std::fabs(a.semitones[3] - 8.0f) < 1e-4f);
  });

  run("trie: exact phrases match at their offset with zero cost", [] {
    hts::MelodyTrie trie(24);
    const auto ode = hts::encodeContour(kLibrary[0].midi, 0.5f).steps;
    trie.insertSong(0, ode);
    CHECK(trie.nodeCount() > 1);
    std::vector<hts::Step> query(ode.begin() + 4, ode.begin() + 12);
    std::vector<hts::MelodyTrie::Match> matches;
    trie.search(query, 0, matches);
    const bool found = std::any_of(matches.begin(), matches.end(), [](const auto& m) {
      return m.song == 0 && m.offset == 4 && m.distance == 0;
    });
    CHECK(found);
  });

  run("trie: pruning keeps the search far below the trie size", [] {
    hts::MelodyTrie trie(24);
    for (std::size_t i = 0; i < kLibrary.size(); ++i) {
      trie.insertSong(static_cast<std::uint32_t>(i), hts::encodeContour(kLibrary[i].midi, 0.5f).steps);
    }
    const auto steps = hts::encodeContour(kLibrary[5].midi, 0.5f).steps;
    std::vector<hts::Step> query(steps.begin(), steps.begin() + 12);
    std::vector<hts::MelodyTrie::Match> matches;
    hts::MelodyTrie::SearchStats stats;
    std::vector<hts::MelodyTrie::Visit> trace;
    trie.search(query, 4, matches, &stats, &trace, 100000);
    std::printf("     trie %zu nodes, visited %zu, pruned %zu, matched %zu\n", trie.nodeCount(),
                stats.visited, stats.pruned, stats.matched);
    CHECK(stats.visited < trie.nodeCount() / 2);
    CHECK(trace.size() == stats.visited);
    CHECK(!matches.empty() && matches.front().distance == 0);
  });

  run("trie: one wrong step costs one substitution", [] {
    hts::MelodyTrie trie(24);
    trie.insertSong(0, {hts::Step::Up, hts::Step::Up, hts::Step::Down, hts::Step::Same});
    std::vector<hts::MelodyTrie::Match> matches;
    trie.search({hts::Step::Up, hts::Step::Same, hts::Step::Down, hts::Step::Same}, 1, matches);
    CHECK(!matches.empty() && matches.front().distance == 1);   // Up -> Same is a half error
    trie.search({hts::Step::Up, hts::Step::Down, hts::Step::Down, hts::Step::Same}, 1, matches);
    CHECK(matches.empty());                                      // Up -> Down costs 2
  });

  run("pitch: YIN finds the fundamental of harmonic tones", [] {
    hts::PitchDetector detector;
    const float sr = 44100.0f;
    for (float midi : {45.0f, 57.0f, 64.0f, 72.0f, 81.0f}) {
      std::vector<float> frame;
      double phase = 0.0;
      synthesizeNote(frame, midi, 0.1, sr, phase);
      const auto est = detector.detect(frame.data() + 1000, 2048, sr);
      CHECK(est.voiced);
      CHECK(std::fabs(hts::hzToMidi(est.hz) - midi) < 0.15f);
    }
    std::vector<float> silence(2048, 0.0f);
    CHECK(!detector.detect(silence.data(), silence.size(), sr).voiced);
  });

  run("segmenter: tones and a repeated note become separate notes", [] {
    const float sr = 22050.0f;
    std::vector<float> audio;
    double phase = 0.0;
    synthesizeNote(audio, 60, 0.35, sr, phase);
    synthesizeNote(audio, 64, 0.35, sr, phase);
    synthesizeGap(audio, 0.06, sr);
    synthesizeNote(audio, 64, 0.35, sr, phase);
    synthesizeNote(audio, 59, 0.35, sr, phase);
    synthesizeGap(audio, 0.2, sr);

    hts::PitchDetector detector;
    hts::NoteSegmenter segmenter;
    std::vector<hts::Note> notes;
    const std::size_t frame = 1024, hop = 256;
    for (std::size_t start = 0; start + frame <= audio.size(); start += hop) {
      const auto est = detector.detect(audio.data() + start, frame, sr);
      hts::FrameObservation obs{est.voiced, est.voiced ? hts::hzToMidi(est.hz) : 0.0f, est.rms,
                                1000.0 * static_cast<double>(start) / sr};
      hts::Note note;
      if (segmenter.push(obs, note)) notes.push_back(note);
    }
    hts::Note last;
    if (segmenter.flush(last)) notes.push_back(last);
    CHECK(notes.size() == 4);
    if (notes.size() == 4) {
      const float expected[] = {60, 64, 64, 59};
      for (int i = 0; i < 4; ++i) CHECK(std::fabs(notes[i].midi - expected[i]) < 0.3f);
    }
  });

  run("engine: transposed, detuned phrases find their song", [] {
    std::mt19937 rng(11);
    std::normal_distribution<float> detune(0.0f, 0.18f);
    int hits = 0, total = 0;
    for (std::size_t s = 0; s < kLibrary.size(); ++s) {
      auto engine = makeEngine();
      const auto& midi = kLibrary[s].midi;
      const std::size_t len = std::min<std::size_t>(11, midi.size());
      const std::size_t offset = (midi.size() - len) / 3;
      const float shift = static_cast<float>(static_cast<int>(rng() % 11) - 5);
      double t = 0.0;
      for (std::size_t i = offset; i < offset + len; ++i) {
        engine.pushNote(midi[i] + shift + detune(rng), t, 300.0);
        t += 320.0;
      }
      const auto& top = engine.outcome().top;
      ++total;
      if (!top.empty() && top.front().song == s) ++hits;
      else std::printf("     miss: %s\n", kLibrary[s].title);
      CHECK(engine.ranking().validate() > 0);
    }
    std::printf("     top-1 %d / %d\n", hits, total);
    CHECK(hits >= total * 9 / 10);
  });

  run("engine: a dropped note and a wrong note are tolerated", [] {
    int hits = 0, total = 0;
    for (std::size_t s = 0; s < kLibrary.size(); ++s) {
      auto engine = makeEngine();
      std::vector<float> phrase(kLibrary[s].midi.begin(),
                                kLibrary[s].midi.begin() + std::min<std::size_t>(14, kLibrary[s].midi.size()));
      phrase.erase(phrase.begin() + 5);   // missed note
      phrase[8] += 1.0f;                  // sharp note
      double t = 0.0;
      for (float m : phrase) {
        engine.pushNote(m - 3.0f, t, 250.0);
        t += 260.0;
      }
      ++total;
      const auto& top = engine.outcome().top;
      // Within the top three is what the leaderboard shows prominently.
      for (std::size_t i = 0; i < top.size() && i < 3; ++i) {
        if (top[i].song == s) { ++hits; break; }
      }
    }
    std::printf("     top-3 %d / %d\n", hits, total);
    CHECK(hits >= total * 8 / 10);
  });

  run("engine: leaderboard is ordered and confidence grows", [] {
    auto engine = makeEngine();
    const auto& midi = kLibrary[0].midi;
    float previous = -1.0f;
    for (std::size_t i = 0; i < 14; ++i) {
      engine.pushNote(midi[i] + 2.0f, 300.0 * i, 280.0);
      const auto& top = engine.outcome().top;
      for (std::size_t k = 1; k < top.size(); ++k) CHECK(top[k - 1].score >= top[k].score);
      if (i == 13) CHECK(engine.outcome().confidence >= previous);
      previous = engine.outcome().confidence;
    }
    CHECK(engine.outcome().top.front().song == 0);
    CHECK(engine.outcome().confidence > 0.5f);
    engine.resetQuery();
    CHECK(engine.outcome().top.empty() && engine.ranking().empty());
  });

  run("engine: synthesized hum, end to end through pitch detection", [] {
    const float sr = 22050.0f;
    int hits = 0;
    const std::size_t picks[] = {0, 1, 4, 9, 16, 30};
    for (std::size_t s : picks) {
      auto engine = makeEngine();
      std::vector<float> audio;
      double phase = 0.0;
      const auto& song = kLibrary[s];
      for (std::size_t i = 0; i < std::min<std::size_t>(12, song.midi.size()); ++i) {
        synthesizeNote(audio, song.midi[i] - 2.0f, 0.18 + 0.12 * song.beats[i], sr, phase);
      }
      synthesizeGap(audio, 0.2, sr);
      const std::size_t frame = 1024, hop = 256;
      for (std::size_t start = 0; start + frame <= audio.size(); start += hop) {
        engine.pushFrame(audio.data() + start, frame, sr, 1000.0 * static_cast<double>(start) / sr);
      }
      engine.endInput();
      const auto& top = engine.outcome().top;
      if (!top.empty() && top.front().song == s) ++hits;
      else std::printf("     miss: %s (%zu notes)\n", song.title, engine.notes().size());
    }
    std::printf("     top-1 %d / %zu\n", hits, std::size(picks));
    CHECK(hits >= 5);
  });

  std::printf("\n%d checks, %d failures\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
