// Melody trie with edit-distance-bounded (fuzzy) search.
//
// Every suffix of every song's step string is inserted, truncated to
// `maxDepth`, so a query can match a phrase that starts anywhere in a song,
// not only at its first note. Each node records the (song, offset) pairs whose
// suffix passes through it.
//
// Search walks the trie depth-first while carrying one row of the Levenshtein
// matrix per node: row[j] is the cheapest way to turn the node's path into the
// first j query steps. A child's row is computed from its parent's in O(m), so
// shared prefixes are scored once for every song that shares them. A branch is
// pruned as soon as every cell of its row exceeds the budget, because extending
// the path can only add cost. A node whose last cell is within budget matches.
//
//   build:   O(S · D) node visits for S total steps and depth limit D
//   search:  O(V · m) for V visited nodes and query length m; V is bounded by
//            the trie size but in practice is a small fraction thanks to pruning
//   memory:  O(S · D) for nodes and postings in the worst case
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "hts/contour.hpp"

namespace hts {

struct Posting {
  std::uint32_t song;
  std::uint16_t offset;  // index of the first step of the suffix in the song
};

struct TrieNode {
  std::array<std::int32_t, kStepCount> child{{-1, -1, -1}};
  std::int32_t parent = -1;
  std::uint16_t depth = 0;
  Step step = Step::Same;          // edge label from the parent; unused for the root
  std::vector<Posting> postings;   // suffixes that pass through this node
};

// Edit costs are kept in half-units so that confusing a step with "same" (a
// hummer flattening a small interval) is cheaper than reversing its direction.
struct EditCosts {
  int insertion = 2;
  int deletion = 2;
  int toSame = 1;     // Up/Down <-> Same
  int reversal = 2;   // Up <-> Down

  int substitute(Step a, Step b) const {
    if (a == b) return 0;
    if (a == Step::Same || b == Step::Same) return toSame;
    return reversal;
  }
};

class MelodyTrie {
 public:
  enum class VisitState : std::uint8_t { Alive = 0, Pruned = 1, Matched = 2 };

  struct Visit {
    std::int32_t node;
    std::int32_t parent;
    Step step;
    std::uint16_t depth;
    std::uint8_t best;       // min(row), clamped to 255
    VisitState state;
  };

  struct Match {
    std::uint32_t song;
    std::uint16_t offset;
    std::uint16_t length;    // steps of the song consumed by the alignment
    int distance;            // in half-units
  };

  struct SearchStats {
    std::size_t visited = 0;
    std::size_t pruned = 0;
    std::size_t matched = 0;
  };

  explicit MelodyTrie(std::size_t maxDepth = 24, EditCosts costs = {});

  void insertSong(std::uint32_t song, const std::vector<Step>& steps);
  void clear();

  // Collects the best match for every (song, offset) whose path is within
  // `budget` of the query. `trace`, when given, receives the visited nodes in
  // depth-first order (at most `traceLimit` of them) for visualisation.
  void search(const std::vector<Step>& query, int budget, std::vector<Match>& out,
              SearchStats* stats = nullptr, std::vector<Visit>* trace = nullptr,
              std::size_t traceLimit = 0) const;

  std::size_t nodeCount() const { return nodes_.size(); }
  std::size_t postingCount() const { return postingCount_; }
  std::size_t maxDepth() const { return maxDepth_; }
  const EditCosts& costs() const { return costs_; }
  const TrieNode& node(std::int32_t id) const { return nodes_[static_cast<std::size_t>(id)]; }

 private:
  struct SearchContext;
  void descend(SearchContext& ctx, std::int32_t nodeId, const int* parentRow) const;

  std::vector<TrieNode> nodes_;
  std::size_t maxDepth_;
  std::size_t postingCount_ = 0;
  EditCosts costs_;
};

}  // namespace hts
