#include "hts/pitch.hpp"

#include <algorithm>
#include <cmath>

namespace hts {

PitchDetector::PitchDetector(PitchConfig config) : config_(config) {}

PitchEstimate PitchDetector::detect(const float* x, std::size_t n, float sampleRate) {
  PitchEstimate out;
  if (n < 64 || sampleRate <= 0.0f) return out;

  double energy = 0.0;
  for (std::size_t i = 0; i < n; ++i) energy += static_cast<double>(x[i]) * x[i];
  out.rms = static_cast<float>(std::sqrt(energy / static_cast<double>(n)));
  if (out.rms < config_.silenceRms) return out;

  const std::size_t window = n / 2;
  const std::size_t tauMin = std::max<std::size_t>(2, static_cast<std::size_t>(sampleRate / config_.maxHz));
  const std::size_t tauMax = std::min(window - 1, static_cast<std::size_t>(sampleRate / config_.minHz));
  if (tauMin + 2 >= tauMax) return out;

  diff_.assign(tauMax + 1, 0.0f);

  // Step 1: difference function d(τ).
  for (std::size_t tau = 1; tau <= tauMax; ++tau) {
    float sum = 0.0f;
    for (std::size_t j = 0; j < window; ++j) {
      const float delta = x[j] - x[j + tau];
      sum += delta * delta;
    }
    diff_[tau] = sum;
  }

  // Step 2: cumulative mean normalised difference d'(τ), computed in place.
  diff_[0] = 1.0f;
  float running = 0.0f;
  for (std::size_t tau = 1; tau <= tauMax; ++tau) {
    running += diff_[tau];
    diff_[tau] = running > 0.0f ? diff_[tau] * static_cast<float>(tau) / running : 1.0f;
  }

  // Step 3: first dip under the threshold, then slide down to its local minimum.
  std::size_t best = 0;
  for (std::size_t tau = tauMin; tau <= tauMax; ++tau) {
    if (diff_[tau] < config_.threshold) {
      while (tau + 1 <= tauMax && diff_[tau + 1] < diff_[tau]) ++tau;
      best = tau;
      break;
    }
  }
  // No dip under the threshold: fall back to the global minimum, which still
  // gives a usable estimate for breathy hums if it is periodic enough.
  if (best == 0) {
    best = tauMin;
    for (std::size_t tau = tauMin + 1; tau <= tauMax; ++tau) {
      if (diff_[tau] < diff_[best]) best = tau;
    }
  }

  const float aperiodicity = diff_[best];
  out.clarity = std::clamp(1.0f - aperiodicity, 0.0f, 1.0f);
  if (aperiodicity > config_.maxAperiodicity) return out;

  // Step 4: parabolic interpolation around the chosen lag for sub-sample accuracy.
  float refined = static_cast<float>(best);
  if (best > 1 && best < tauMax) {
    const float s0 = diff_[best - 1];
    const float s1 = diff_[best];
    const float s2 = diff_[best + 1];
    const float denom = s0 + s2 - 2.0f * s1;
    if (std::fabs(denom) > 1e-9f) refined += 0.5f * (s0 - s2) / denom;
  }

  out.hz = sampleRate / refined;
  out.voiced = out.hz >= config_.minHz && out.hz <= config_.maxHz;
  if (!out.voiced) out.hz = 0.0f;
  return out;
}

float hzToMidi(float hz) { return 69.0f + 12.0f * std::log2(hz / 440.0f); }

float midiToHz(float midi) { return 440.0f * std::pow(2.0f, (midi - 69.0f) / 12.0f); }

}  // namespace hts
