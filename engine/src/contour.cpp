#include "hts/contour.hpp"

#include <cmath>

namespace hts {

char stepChar(Step step) {
  switch (step) {
    case Step::Up: return 'U';
    case Step::Down: return 'D';
    case Step::Same: return 'S';
  }
  return '?';
}

bool stepFromChar(char c, Step& out) {
  switch (c) {
    case 'U': case 'u': out = Step::Up; return true;
    case 'D': case 'd': out = Step::Down; return true;
    case 'S': case 's': case 'R': case 'r': out = Step::Same; return true;
    default: return false;
  }
}

Contour encodeContour(const std::vector<float>& midi, float sameThreshold) {
  Contour contour;
  if (midi.size() < 2) return contour;
  contour.steps.reserve(midi.size() - 1);
  contour.semitones.reserve(midi.size() - 1);
  for (std::size_t i = 1; i < midi.size(); ++i) {
    const float delta = midi[i] - midi[i - 1];
    Step step = Step::Same;
    if (delta >= sameThreshold) step = Step::Up;
    else if (delta <= -sameThreshold) step = Step::Down;
    contour.steps.push_back(step);
    contour.semitones.push_back(delta);
  }
  return contour;
}

std::string toString(const std::vector<Step>& steps) {
  std::string s;
  s.reserve(steps.size());
  for (Step step : steps) s.push_back(stepChar(step));
  return s;
}

}  // namespace hts
