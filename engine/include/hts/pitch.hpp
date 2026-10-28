// Pitch detection for a single audio frame.
//
// Uses the YIN estimator (de Cheveigné & Kawahara, 2002), which is an
// autocorrelation method: it computes the squared-difference function
//     d(τ) = Σ_j (x_j − x_{j+τ})²
// (a rearranged autocorrelation), normalises it by its running mean, and picks
// the first lag whose normalised dip falls under a threshold. Picking the first
// dip, not the deepest one, is what keeps YIN from reporting octave-low pitches.
//
// Cost per frame: O(W · τ_max) where W is half the frame length.
#pragma once

#include <cstddef>
#include <vector>

namespace hts {

struct PitchConfig {
  float minHz = 70.0f;        // lowest pitch reported (a low male hum)
  float maxHz = 1100.0f;      // highest pitch reported (a high whistle)
  float threshold = 0.15f;    // YIN absolute threshold on the normalised difference
  float maxAperiodicity = 0.45f;  // above this the frame is treated as unvoiced
  float silenceRms = 0.008f;  // frames quieter than this are skipped outright
};

struct PitchEstimate {
  float hz = 0.0f;       // fundamental frequency, 0 when unvoiced
  float clarity = 0.0f;  // 1 − aperiodicity, in [0, 1]
  float rms = 0.0f;      // frame loudness
  bool voiced = false;
};

class PitchDetector {
 public:
  explicit PitchDetector(PitchConfig config = {});

  PitchEstimate detect(const float* samples, std::size_t count, float sampleRate);

  const PitchConfig& config() const { return config_; }

 private:
  PitchConfig config_;
  std::vector<float> diff_;  // scratch buffer reused across frames
};

// Fractional MIDI note number: A4 = 440 Hz = 69.
float hzToMidi(float hz);
float midiToHz(float midi);

}  // namespace hts
