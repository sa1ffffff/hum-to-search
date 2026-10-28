// Turns a stream of per-frame pitch estimates into discrete notes.
//
// A hum is continuous: pitch glides, wobbles with vibrato, and occasionally
// jumps an octave for one frame because the detector slipped. The segmenter
// groups frames into a note while they stay within a tolerance of the note's
// running median, and only starts a new note when a different pitch persists
// for several frames, when the voice stops, or when loudness dips and recovers
// (how a hummer re-articulates a repeated note: "da-da").
#pragma once

#include <cstddef>
#include <vector>

namespace hts {

struct Note {
  float midi = 0.0f;         // median fractional MIDI pitch of the note
  double startMs = 0.0;
  double durationMs = 0.0;
};

struct FrameObservation {
  bool voiced = false;
  float midi = 0.0f;
  float rms = 0.0f;
  double timeMs = 0.0;       // frame start on the input clock
};

struct SegmenterConfig {
  double minNoteMs = 70.0;        // shorter segments are treated as glitches
  float stableSemitones = 0.8f;   // frames within this of the note median join it
  int jumpConfirmFrames = 3;      // frames a new pitch must persist to start a note
  int silenceFrames = 3;          // unvoiced frames that end a note
  float dipRatio = 0.4f;          // loudness under ratio·peak marks a re-articulation dip
  float recoverRatio = 0.7f;      // loudness back above ratio·peak after a dip splits the note
};

class NoteSegmenter {
 public:
  explicit NoteSegmenter(SegmenterConfig config = {});

  // Feeds one frame. Returns true and fills `out` when a note was completed.
  bool push(const FrameObservation& frame, Note& out);

  // Closes the note in progress, if any (end of input).
  bool flush(Note& out);

  void reset();

  bool active() const { return !segment_.empty(); }
  float activeMidi() const;  // median pitch of the note in progress, or 0

 private:
  bool close(double endMs, Note& out);
  void begin(const FrameObservation& frame);

  SegmenterConfig config_;
  std::vector<float> segment_;   // pitches of the note in progress
  std::vector<float> pending_;   // pitches of a possible new note
  double segmentStart_ = 0.0;
  double pendingStart_ = 0.0;
  double lastVoicedMs_ = 0.0;
  double frameMs_ = 10.0;        // last observed hop, used to close notes cleanly
  double previousFrameMs_ = -1.0;
  float peakRms_ = 0.0f;
  bool dipped_ = false;
  int unvoicedRun_ = 0;
};

// Median of a small vector (copies; inputs are a few dozen values at most).
float median(std::vector<float> values);

}  // namespace hts
