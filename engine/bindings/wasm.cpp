// Embind surface for the browser. Everything returned is a plain JS object or
// a typed array copied out of WASM memory, so callers never hold views into a
// heap that can grow and detach them.
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <string>
#include <vector>

#include "hts/engine.hpp"

using emscripten::val;

namespace {

template <typename T>
val copyToTypedArray(const char* type, const std::vector<T>& data) {
  val view(emscripten::typed_memory_view(data.size(), data.data()));
  return val::global(type).new_(view);
}

std::vector<float> toFloatVector(const val& array) {
  return emscripten::convertJSArrayToNumberVector<float>(array);
}

class Engine {
 public:
  Engine() = default;

  int addSong(const std::string& title, const std::string& composer, const val& midi) {
    return static_cast<int>(engine_.addSong(title, composer, toFloatVector(midi)));
  }

  val pushFrame(const val& samples, float sampleRate, double timeMs) {
    frame_ = toFloatVector(samples);
    const hts::FrameReport r = engine_.pushFrame(frame_.data(), frame_.size(), sampleRate, timeMs);
    val out = val::object();
    out.set("hz", r.pitch.hz);
    out.set("clarity", r.pitch.clarity);
    out.set("rms", r.pitch.rms);
    out.set("voiced", r.pitch.voiced);
    out.set("midi", r.midi);
    out.set("activeMidi", r.activeMidi);
    out.set("noteCompleted", r.noteCompleted);
    out.set("searched", r.searched);
    return out;
  }

  bool pushNote(float midi, double startMs, double durationMs) {
    return engine_.pushNote(midi, startMs, durationMs);
  }

  bool endInput() { return engine_.endInput(); }
  void research() { engine_.search(); }
  void reset() { engine_.resetQuery(); }
  void setTolerance(float tolerance) { engine_.setTolerance(tolerance); }
  float tolerance() const { return engine_.tolerance(); }
  int budgetFor(int steps) const { return engine_.budgetFor(static_cast<std::size_t>(steps)); }

  val notes() const {
    val out = val::array();
    for (const hts::Note& n : engine_.notes()) {
      val note = val::object();
      note.set("midi", n.midi);
      note.set("startMs", n.startMs);
      note.set("durationMs", n.durationMs);
      out.call<void>("push", note);
    }
    return out;
  }

  val outcome() const {
    const hts::SearchOutcome& o = engine_.outcome();
    val out = val::object();
    out.set("version", static_cast<double>(o.version));
    out.set("query", hts::toString(o.query));
    out.set("querySemitones", copyToTypedArray("Float32Array", o.querySemitones));
    out.set("budget", o.budget);
    out.set("candidateCount", static_cast<double>(o.candidateCount));
    out.set("confidence", o.confidence);
    out.set("searchMicros", o.searchMicros);

    val top = val::array();
    for (const hts::Candidate& c : o.top) {
      val cand = val::object();
      cand.set("song", c.song);
      cand.set("score", c.score);
      cand.set("contourScore", c.contourScore);
      cand.set("intervalScore", c.intervalScore);
      cand.set("distance", c.distance);
      cand.set("offset", c.offset);
      cand.set("length", c.length);
      top.call<void>("push", cand);
    }
    out.set("top", top);

    val trie = val::object();
    trie.set("visited", static_cast<double>(o.trieStats.visited));
    trie.set("pruned", static_cast<double>(o.trieStats.pruned));
    trie.set("matched", static_cast<double>(o.trieStats.matched));
    out.set("trieStats", trie);

    val rank = val::object();
    rank.set("inserts", o.rankStats.inserts);
    rank.set("erases", o.rankStats.erases);
    rank.set("rotations", o.rankStats.rotations);
    rank.set("recolors", o.rankStats.recolors);
    rank.set("unchanged", o.rankStats.unchanged);
    out.set("rankStats", rank);

    // The trace as parallel typed arrays: compact and cheap to cross the boundary.
    std::vector<std::int32_t> node, parent;
    std::vector<std::uint8_t> step, depth, best, state;
    node.reserve(o.trace.size());
    for (const auto& v : o.trace) {
      node.push_back(v.node);
      parent.push_back(v.parent);
      step.push_back(static_cast<std::uint8_t>(v.step));
      depth.push_back(static_cast<std::uint8_t>(v.depth));
      best.push_back(v.best);
      state.push_back(static_cast<std::uint8_t>(v.state));
    }
    val trace = val::object();
    trace.set("node", copyToTypedArray("Int32Array", node));
    trace.set("parent", copyToTypedArray("Int32Array", parent));
    trace.set("step", copyToTypedArray("Uint8Array", step));
    trace.set("depth", copyToTypedArray("Uint8Array", depth));
    trace.set("best", copyToTypedArray("Uint8Array", best));
    trace.set("state", copyToTypedArray("Uint8Array", state));
    out.set("trace", trace);
    return out;
  }

  val rankingSnapshot() const {
    const auto& tree = engine_.ranking();
    val nodes = val::array();
    for (const auto& n : tree.snapshot()) {
      val node = val::object();
      node.set("song", n.key.song);
      node.set("score", n.key.score);
      node.set("red", n.red);
      node.set("left", n.left);
      node.set("right", n.right);
      nodes.call<void>("push", node);
    }
    val out = val::object();
    out.set("nodes", nodes);
    out.set("height", tree.height());
    out.set("blackHeight", tree.validate());
    out.set("size", static_cast<double>(tree.size()));
    return out;
  }

  val stats() const {
    const auto& trie = engine_.trie();
    val out = val::object();
    out.set("songs", static_cast<double>(engine_.songCount()));
    out.set("trieNodes", static_cast<double>(trie.nodeCount()));
    out.set("triePostings", static_cast<double>(trie.postingCount()));
    out.set("trieDepth", static_cast<double>(trie.maxDepth()));
    out.set("queryWindow", static_cast<double>(engine_.config().queryWindow));
    out.set("minQuerySteps", static_cast<double>(engine_.config().minQuerySteps));
    return out;
  }

  std::string songContour(int id) const {
    if (id < 0 || static_cast<std::size_t>(id) >= engine_.songCount()) return {};
    return hts::toString(engine_.song(static_cast<std::uint32_t>(id)).contour.steps);
  }

 private:
  hts::HumSearchEngine engine_;
  std::vector<float> frame_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(hum_to_search) {
  emscripten::class_<Engine>("Engine")
      .constructor<>()
      .function("addSong", &Engine::addSong)
      .function("pushFrame", &Engine::pushFrame)
      .function("pushNote", &Engine::pushNote)
      .function("endInput", &Engine::endInput)
      .function("research", &Engine::research)
      .function("reset", &Engine::reset)
      .function("setTolerance", &Engine::setTolerance)
      .function("tolerance", &Engine::tolerance)
      .function("budgetFor", &Engine::budgetFor)
      .function("notes", &Engine::notes)
      .function("outcome", &Engine::outcome)
      .function("rankingSnapshot", &Engine::rankingSnapshot)
      .function("stats", &Engine::stats)
      .function("songContour", &Engine::songContour);
}
