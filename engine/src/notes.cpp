#include "hts/notes.hpp"

#include <algorithm>
#include <cmath>

namespace hts {

float median(std::vector<float> values) {
  if (values.empty()) return 0.0f;
  const std::size_t mid = values.size() / 2;
  std::nth_element(values.begin(), values.begin() + static_cast<std::ptrdiff_t>(mid), values.end());
  float m = values[mid];
  if (values.size() % 2 == 0) {
    const float lower = *std::max_element(values.begin(), values.begin() + static_cast<std::ptrdiff_t>(mid));
    m = 0.5f * (m + lower);
  }
  return m;
}

NoteSegmenter::NoteSegmenter(SegmenterConfig config) : config_(config) {}

void NoteSegmenter::reset() {
  segment_.clear();
  pending_.clear();
  segmentStart_ = pendingStart_ = lastVoicedMs_ = 0.0;
  previousFrameMs_ = -1.0;
  peakRms_ = 0.0f;
  dipped_ = false;
  unvoicedRun_ = 0;
}

float NoteSegmenter::activeMidi() const {
  // Only the most recent frames matter for the live readout.
  const std::size_t take = std::min<std::size_t>(segment_.size(), 15);
  return median(std::vector<float>(segment_.end() - static_cast<std::ptrdiff_t>(take), segment_.end()));
}

void NoteSegmenter::begin(const FrameObservation& frame) {
  segment_.assign(1, frame.midi);
  segmentStart_ = frame.timeMs;
  peakRms_ = frame.rms;
  dipped_ = false;
}

bool NoteSegmenter::close(double endMs, Note& out) {
  const bool emitted = !segment_.empty() && endMs - segmentStart_ >= config_.minNoteMs;
  if (emitted) {
    out.midi = median(segment_);
    out.startMs = segmentStart_;
    out.durationMs = endMs - segmentStart_;
  }
  segment_.clear();
  peakRms_ = 0.0f;
  dipped_ = false;
  return emitted;
}

bool NoteSegmenter::push(const FrameObservation& frame, Note& out) {
  if (previousFrameMs_ >= 0.0 && frame.timeMs > previousFrameMs_) {
    frameMs_ = frame.timeMs - previousFrameMs_;
  }
  previousFrameMs_ = frame.timeMs;

  if (!frame.voiced) {
    pending_.clear();
    if (++unvoicedRun_ >= config_.silenceFrames && !segment_.empty()) {
      return close(lastVoicedMs_ + frameMs_, out);
    }
    return false;
  }

  unvoicedRun_ = 0;
  lastVoicedMs_ = frame.timeMs;

  if (segment_.empty()) {
    begin(frame);
    return false;
  }

  // Re-articulation: loudness falls well under the note's peak, then recovers.
  if (frame.rms < config_.dipRatio * peakRms_) {
    dipped_ = true;
  } else if (dipped_ && frame.rms > config_.recoverRatio * peakRms_) {
    const bool emitted = close(frame.timeMs, out);
    begin(frame);
    pending_.clear();
    return emitted;
  }

  const float center = activeMidi();
  if (std::fabs(frame.midi - center) <= config_.stableSemitones) {
    segment_.push_back(frame.midi);
    peakRms_ = std::max(peakRms_, frame.rms);
    pending_.clear();
    return false;
  }

  // A different pitch: hold it as pending until it persists long enough.
  if (pending_.empty() || std::fabs(frame.midi - median(pending_)) > config_.stableSemitones) {
    pending_.assign(1, frame.midi);
    pendingStart_ = frame.timeMs;
  } else {
    pending_.push_back(frame.midi);
  }

  if (static_cast<int>(pending_.size()) >= config_.jumpConfirmFrames) {
    const bool emitted = close(pendingStart_, out);
    segment_ = pending_;
    segmentStart_ = pendingStart_;
    peakRms_ = frame.rms;
    dipped_ = false;
    pending_.clear();
    return emitted;
  }
  return false;
}

bool NoteSegmenter::flush(Note& out) {
  pending_.clear();
  if (segment_.empty()) return false;
  return close(lastVoicedMs_ + frameMs_, out);
}

}  // namespace hts
