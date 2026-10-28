# Hum-to-Search: design and complexity report

Data Structures & Algorithms course project. Instructor: Professor Aimal Tariq Rextin. Team: Saifullah Waseem, Ammar Alam.

## 1. Problem

A hummed query is imperfect. People sing off-key, in a different octave, at a different tempo, and they drop or add notes. The system has to find the song anyway, in real time, and show why. Two decisions make that tractable:

1. **Key-invariant encoding.** A melody is stored as the direction of each step between consecutive notes, U (up), D (down) or S (same), plus the exact size of each step in semitones. Transposing a melody changes neither. Tempo never enters the key at all.
2. **Tolerant search over a prefix tree.** All melodies live in one trie. The search walks it with an edit-distance budget, so a phrase that is a few edits away from a song still matches. Surviving candidates are ranked in a red-black tree that is updated, not rebuilt, as each note arrives.

## 2. Pipeline

```
microphone ─▶ YIN pitch detection ─▶ note segmentation ─▶ U/D/S contour
           ─▶ fuzzy trie search (edit budget) ─▶ semitone rescoring
           ─▶ red-black tree leaderboard ─▶ top 5 + confidence
```

Everything to the right of the microphone is C++17 (`engine/`), compiled to WebAssembly with Emscripten and called from a React + TypeScript interface.

Notation used below: *n* = songs in the library, *L* = notes per song, *S* = *n·L* total steps, *D* = trie depth limit (24), *m* = query length in steps (≤ 18), *V* = trie nodes visited by one search, *c* = candidates in the leaderboard, *W* = analysis window (1024 samples), *τ* = largest pitch lag considered.

## 3. Pitch detection (`pitch.cpp`)

YIN, an autocorrelation method. For each frame it computes the difference function d(τ) = Σ (x_j − x_{j+τ})², normalises it by its running mean, and takes the first lag whose normalised value falls below 0.15, refined by parabolic interpolation. Choosing the *first* dip under the threshold, not the deepest, avoids the octave-low errors plain autocorrelation makes.

| Operation | Time | Space |
|---|---|---|
| One frame | O(W·τ) | O(τ) |

Audio above 32 kHz is decimated by two first, so W = 1024 at about 24 kHz (a 43 ms window) and τ ≤ 340 for a 70 Hz floor. The browser runs about 90 frames a second.

## 4. Note segmentation (`notes.cpp`)

Frames join the current note while they stay within 0.8 semitones of its running median. A new note starts when a different pitch persists for three frames, when the voice stops for three frames, or when loudness dips under 40% of the note's peak and recovers (how a hummer re-articulates a repeated note). Segments shorter than 70 ms are dropped as glitches. Each frame costs O(k log k) for a median over at most 15 recent pitches, which is constant in practice.

## 5. Melody trie (`trie.hpp`, `trie.cpp`)

A query can start anywhere in a song, so every **suffix** of every song's step string is inserted, truncated to depth *D*. Each node keeps the list of (song, offset) postings whose suffix passes through it, and has at most three children (U, D, S).

**Fuzzy search.** A depth-first walk carries one row of the Levenshtein matrix per node. `row[j]` is the cheapest way to turn the node's path into the first *j* query steps. A child's row comes from its parent's in O(m):

```
row[0] = parent[0] + deletion
row[j] = min( parent[j−1] + substitute(step, query[j−1]),
              parent[j]   + deletion,
              row[j−1]    + insertion )
```

Costs are in half-units. Flattening a step to S, or reading an S as a step, costs 1. Reversing a direction (U↔D) costs 2, as does inserting or deleting a step. The budget at tolerance 1 is m/2 half-units rounded, clamped to 2…14, which is roughly one full error every four steps.

- **Match:** a node whose last cell `row[m]` is within budget. All its postings become candidates.
- **Prune:** a node whose *every* cell exceeds the budget. Extending the path only adds cost, so its subtree is skipped. This is what the interface shows as torn-off branches.

Shared prefixes are scored once for every song that shares them. That is the trie's advantage over aligning the query against each song separately.

| Operation | Time | Space |
|---|---|---|
| Build | O(S·D) | O(S·D) nodes and postings, worst case |
| Search | O(V·m) | O(D·m) for the rows, plus the match map |
| Exact lookup of a phrase of length *m* | O(m) | O(1) |

For the shipped library (47 songs, 1,118 steps) the trie has 8,183 nodes. A 12-step query with a budget of 4 visits about 1,100 of them (13%), and the native tests assert that a search stays under half the trie. A search takes under a millisecond in the browser.

## 6. Rescoring

The contour alone cannot tell "up a semitone" from "up an octave". Each trie match is realigned at semitone level from its offset with a small dynamic program: the substitution cost is the interval error capped at four semitones (scaled to 0…1), a gap costs 0.75, and the song side may end anywhere. That costs O(m²) per match. The final score is

score = 0.45 · (1 − distance / 2m) + 0.55 · (1 − intervalCost / m)

and the best (song, offset) pair per song is kept.

## 7. Red-black tree leaderboard (`rbtree.hpp`)

Candidates are keys (score, song id), ordered best-first. The tree follows CLRS chapter 13 with a shared black sentinel for every nil leaf. Its five invariants keep the height at most 2·log₂(c + 1).

On every note, for every candidate:

- a song whose score did not change stays where it is;
- a song whose score changed is **erased** at its old key and **inserted** at its new one;
- a song that no longer survives the trie search is erased.

The top 5 come from an in-order walk that stops after five keys. Nothing is ever re-sorted.

| Operation | Time | Rotations |
|---|---|---|
| Insert | O(log c) | ≤ 2 |
| Erase | O(log c) | ≤ 3 |
| Update (erase + insert) | O(log c) | ≤ 5 |
| Read top *k* | O(log c + k) | none |
| Full re-rank after a note | O(c log c) worst case, only for changed scores | |

A sorted array would also give the top *k* in O(k), but every score change would cost O(c) to shift elements, or O(c log c) to re-sort. The tree keeps every update logarithmic. The interface reports the rotations and recolourings each note caused.

The tree counts rotations and recolours and exposes `validate()`, which checks all five invariants and returns the black height. The native tests run 6,000 random inserts and erases against `std::set` and validate the tree throughout.

## 8. Confidence

confidence = clamp((m − 2)/9) · (0.55 · clamp((s₁ − s₂)/0.2) + 0.45 · clamp((s₁ − 0.55)/0.35))

where s₁ and s₂ are the top two scores. It rises with query length, with the gap between first and second place, and with the absolute quality of the leader. Two songs that share an opening keep it low, which is correct: the system cannot tell them apart yet.

## 9. Testing

- `npm run test:engine`: native g++ tests of the red-black tree (randomised against `std::set`, invariants, height bound), the contour, the trie (exact, fuzzy, pruning ratio), YIN accuracy on harmonic tones, segmentation of repeated notes, and accuracy over the whole library: transposed and detuned phrases (top-1), phrases with a dropped and a wrong note (top-3), and synthesized audio end to end through pitch detection.
- `npm run test:web`: the compiled WebAssembly module under Node (boundary shapes, ranking order, tree validity, pitch from raw frames), the note notation, and the trie view's layout.

Current results: 47/47 top-1 on transposed, detuned phrases; 47/47 top-3 with a dropped and a wrong note; 6/6 top-1 end to end from synthesized audio.

## 10. Limits

- The library holds opening phrases only. A hum from deep inside a song matches only if that part was transcribed.
- Contour search cannot separate songs that share a long opening contour. The confidence meter reflects this rather than hiding it.
- Rhythm is not used for ranking. Durations are stored and drawn, but hummed rhythm is too unreliable to weigh at this scale.
