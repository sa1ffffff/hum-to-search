// The search engine: song library, live query, and ranking.
//
// Pipeline per incoming note:
//   notes ─▶ contour (steps + semitones) ─▶ fuzzy trie search ─▶ rescoring
//         ─▶ red-black tree leaderboard (erase old key, insert new key)
//
// Scores change every time the query grows. Each changed candidate costs one
// erase and one insert in the red-black tree, O(log n) each, and reading the
// top k is O(log n + k), so the leaderboard never needs a full re-sort.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include "hts/contour.hpp"
#include "hts/notes.hpp"
#include "hts/pitch.hpp"
#include "hts/rbtree.hpp"
#include "hts/trie.hpp"

namespace hts {

struct Song {
  std::uint32_t id = 0;
  std::string title;
  std::string composer;
  std::vector<float> midi;
  Contour contour;
};

struct EngineConfig {
  std::size_t trieDepth = 24;     // longest indexed phrase, in steps
  std::size_t queryWindow = 18;   // most recent steps used as the query
  std::size_t minQuerySteps = 3;  // below this the search does not run
  float tolerance = 1.0f;         // scales the edit budget; 0.5 strict … 2 loose
  std::size_t topK = 5;
  std::size_t traceLimit = 6000;  // trie nodes recorded for visualisation
  PitchConfig pitch;
  SegmenterConfig segmenter;
};

struct Candidate {
  std::uint32_t song = 0;
  float score = 0.0f;         // combined, in [0, 1]
  float contourScore = 0.0f;  // from the trie edit distance
  float intervalScore = 0.0f; // from semitone-level realignment
  int distance = 0;           // trie edit distance, half-units
  std::uint16_t offset = 0;   // where in the song the phrase matched
  std::uint16_t length = 0;   // song steps covered by the match
};

// Orders candidates best-first: higher score, then lower song id for stability.
struct RankKey {
  float score = 0.0f;
  std::uint32_t song = 0;
};

struct RankKeyLess {
  bool operator()(const RankKey& a, const RankKey& b) const {
    if (a.score != b.score) return a.score > b.score;
    return a.song < b.song;
  }
};

struct RankUpdateStats {
  std::uint32_t inserts = 0;
  std::uint32_t erases = 0;
  std::uint32_t rotations = 0;
  std::uint32_t recolors = 0;
  std::uint32_t unchanged = 0;
};

struct SearchOutcome {
  std::uint64_t version = 0;            // increments on every search
  std::vector<Step> query;
  std::vector<float> querySemitones;
  int budget = 0;                       // half-units
  std::vector<Candidate> top;
  std::size_t candidateCount = 0;       // songs currently in the red-black tree
  float confidence = 0.0f;
  MelodyTrie::SearchStats trieStats;
  std::vector<MelodyTrie::Visit> trace;
  RankUpdateStats rankStats;
  double searchMicros = 0.0;
};

struct FrameReport {
  PitchEstimate pitch;
  float midi = 0.0f;           // fractional MIDI of this frame, 0 if unvoiced
  float activeMidi = 0.0f;     // median of the note in progress, 0 if none
  bool noteCompleted = false;
  bool searched = false;
};

class HumSearchEngine {
 public:
  explicit HumSearchEngine(EngineConfig config = {});

  // Library. Songs are indexed immediately; ids are dense, starting at 0.
  std::uint32_t addSong(const std::string& title, const std::string& composer,
                        const std::vector<float>& midi);
  std::size_t songCount() const { return songs_.size(); }
  const Song& song(std::uint32_t id) const { return songs_[id]; }
  const MelodyTrie& trie() const { return trie_; }

  // Live input from audio frames (any hop size; timestamps on the input clock).
  FrameReport pushFrame(const float* samples, std::size_t count, float sampleRate, double timeMs);
  // Live input from exact notes (on-screen keyboard). Returns true if it searched.
  bool pushNote(float midi, double startMs, double durationMs);
  // Ends the current input: flushes the note in progress. Returns true if it searched.
  bool endInput();
  // Clears the query, the note history and the leaderboard.
  void resetQuery();

  void setTolerance(float tolerance);
  float tolerance() const { return config_.tolerance; }

  const std::vector<Note>& notes() const { return notes_; }
  const SearchOutcome& outcome() const { return outcome_; }
  const RedBlackTree<RankKey, RankKeyLess>& ranking() const { return ranking_; }
  const EngineConfig& config() const { return config_; }

  // Runs the search over the current notes. Called automatically per note.
  void search();

  // Edit budget, in half-units, for a query of `steps` steps.
  int budgetFor(std::size_t steps) const;

 private:
  float rescoreIntervals(const Song& song, std::size_t offset, const std::vector<float>& query) const;
  void updateRanking(const std::vector<Candidate>& candidates);

  EngineConfig config_;
  PitchDetector pitch_;
  NoteSegmenter segmenter_;
  MelodyTrie trie_;
  std::vector<Song> songs_;
  std::vector<Note> notes_;

  RedBlackTree<RankKey, RankKeyLess> ranking_;
  std::unordered_map<std::uint32_t, Candidate> ranked_;  // song -> its key's candidate

  SearchOutcome outcome_;
  std::vector<MelodyTrie::Match> matches_;  // scratch
};

}  // namespace hts
