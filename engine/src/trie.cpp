#include "hts/trie.hpp"

#include <algorithm>
#include <unordered_map>

namespace hts {

MelodyTrie::MelodyTrie(std::size_t maxDepth, EditCosts costs)
    : maxDepth_(std::max<std::size_t>(1, maxDepth)), costs_(costs) {
  clear();
}

void MelodyTrie::clear() {
  nodes_.assign(1, TrieNode{});
  postingCount_ = 0;
}

void MelodyTrie::insertSong(std::uint32_t song, const std::vector<Step>& steps) {
  for (std::size_t offset = 0; offset < steps.size(); ++offset) {
    const std::size_t end = std::min(steps.size(), offset + maxDepth_);
    std::int32_t current = 0;
    for (std::size_t i = offset; i < end; ++i) {
      const auto slot = static_cast<std::size_t>(steps[i]);
      std::int32_t next = nodes_[static_cast<std::size_t>(current)].child[slot];
      if (next < 0) {
        TrieNode fresh;
        fresh.parent = current;
        fresh.depth = static_cast<std::uint16_t>(nodes_[static_cast<std::size_t>(current)].depth + 1);
        fresh.step = steps[i];
        next = static_cast<std::int32_t>(nodes_.size());
        nodes_.push_back(std::move(fresh));
        nodes_[static_cast<std::size_t>(current)].child[slot] = next;
      }
      nodes_[static_cast<std::size_t>(next)].postings.push_back(
          Posting{song, static_cast<std::uint16_t>(offset)});
      ++postingCount_;
      current = next;
    }
  }
}

struct MelodyTrie::SearchContext {
  const std::vector<Step>& query;
  int budget;
  std::vector<int> rows;  // one row of (m + 1) cells per depth level
  std::unordered_map<std::uint64_t, Match>& best;
  SearchStats& stats;
  std::vector<Visit>* trace;
  std::size_t traceLimit;
};

void MelodyTrie::search(const std::vector<Step>& query, int budget, std::vector<Match>& out,
                        SearchStats* statsOut, std::vector<Visit>* trace,
                        std::size_t traceLimit) const {
  out.clear();
  if (trace) trace->clear();
  SearchStats stats;
  if (query.empty()) {
    if (statsOut) *statsOut = stats;
    return;
  }

  const std::size_t width = query.size() + 1;
  std::unordered_map<std::uint64_t, Match> best;
  SearchContext ctx{query, budget, std::vector<int>(width * (maxDepth_ + 1)), best, stats, trace, traceLimit};

  // Root row: an empty path against the first j query steps costs j insertions.
  for (std::size_t j = 0; j < width; ++j) ctx.rows[j] = static_cast<int>(j) * costs_.insertion;

  for (std::int32_t child : nodes_[0].child) {
    if (child >= 0) descend(ctx, child, ctx.rows.data());
  }

  out.reserve(best.size());
  for (auto& entry : best) out.push_back(entry.second);
  std::sort(out.begin(), out.end(), [](const Match& a, const Match& b) {
    if (a.distance != b.distance) return a.distance < b.distance;
    if (a.song != b.song) return a.song < b.song;
    return a.offset < b.offset;
  });
  if (statsOut) *statsOut = stats;
}

void MelodyTrie::descend(SearchContext& ctx, std::int32_t nodeId, const int* parentRow) const {
  const TrieNode& node = nodes_[static_cast<std::size_t>(nodeId)];
  const std::size_t m = ctx.query.size();
  int* row = ctx.rows.data() + static_cast<std::size_t>(node.depth) * (m + 1);

  row[0] = parentRow[0] + costs_.deletion;
  int rowMin = row[0];
  for (std::size_t j = 1; j <= m; ++j) {
    const int replace = parentRow[j - 1] + costs_.substitute(node.step, ctx.query[j - 1]);
    const int remove = parentRow[j] + costs_.deletion;   // path step not in query
    const int insert = row[j - 1] + costs_.insertion;    // query step not in path
    row[j] = std::min({replace, remove, insert});
    rowMin = std::min(rowMin, row[j]);
  }

  ++ctx.stats.visited;
  const bool pruned = rowMin > ctx.budget;
  const bool matched = !pruned && row[m] <= ctx.budget;
  VisitState state = VisitState::Alive;
  if (pruned) {
    state = VisitState::Pruned;
    ++ctx.stats.pruned;
  } else if (matched) {
    state = VisitState::Matched;
    ++ctx.stats.matched;
  }

  if (ctx.trace && ctx.trace->size() < ctx.traceLimit) {
    ctx.trace->push_back(Visit{nodeId, node.parent, node.step, node.depth,
                               static_cast<std::uint8_t>(std::min(rowMin, 255)), state});
  }
  if (pruned) return;

  if (matched) {
    for (const Posting& p : node.postings) {
      const std::uint64_t key = (static_cast<std::uint64_t>(p.song) << 16) | p.offset;
      auto it = ctx.best.find(key);
      // Prefer the cheaper alignment; on a tie prefer the shorter one, which
      // leaves fewer unexplained song notes.
      if (it == ctx.best.end() || row[m] < it->second.distance ||
          (row[m] == it->second.distance && node.depth < it->second.length)) {
        ctx.best[key] = Match{p.song, p.offset, node.depth, row[m]};
      }
    }
  }

  if (node.depth >= maxDepth_) return;
  for (std::int32_t child : node.child) {
    if (child >= 0) descend(ctx, child, row);
  }
}

}  // namespace hts
