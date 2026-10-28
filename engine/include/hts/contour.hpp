// Key-invariant melody encoding.
//
// A melody is stored as the direction of each step between consecutive notes
// (its Parsons code: Up, Down, Same) plus the exact interval in semitones. The
// directions are what the trie indexes; the semitone sizes are used afterwards
// to rescore candidates. Neither depends on the key or octave the user hums in.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace hts {

enum class Step : std::uint8_t { Down = 0, Same = 1, Up = 2 };

constexpr int kStepCount = 3;

char stepChar(Step step);
bool stepFromChar(char c, Step& out);

struct Contour {
  std::vector<Step> steps;       // size = notes − 1
  std::vector<float> semitones;  // signed interval for each step
};

// Steps smaller than `sameThreshold` semitones count as Same. Library melodies
// are exact, so any threshold under 1 works for them; for hummed input 0.5–0.7
// absorbs intonation drift without hiding real semitone steps.
Contour encodeContour(const std::vector<float>& midi, float sameThreshold = 0.6f);

std::string toString(const std::vector<Step>& steps);

}  // namespace hts
