# Hum-to-Search

Hum a tune into your microphone and the app identifies the song. The search runs on a **trie** walked with an edit-distance budget. The candidates are ranked in a **red-black tree** that rebalances as every note arrives. Both structures are drawn live, so you can watch the search narrow down.

A Data Structures & Algorithms course project by Saifullah Waseem and Ammar Alam, for Professor Aimal Tariq Rextin.

- **Engine:** C++17 (`engine/`): YIN pitch detection, note segmentation, interval encoding, the trie, the red-black tree and ranking. Compiled to WebAssembly with Emscripten.
- **Interface:** React 18 + TypeScript + Vite. Uses the Web Audio API with an AudioWorklet for capture.
- **Library:** 47 public-domain melodies (`data/songs.json`), opening phrases transcribed by hand.

The design and complexity analysis is in [docs/REPORT.md](docs/REPORT.md).

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The compiled engine (`src/engine/generated/hts.{mjs,wasm}`) is committed, so Emscripten is only needed if you change the C++.

## Using the app

| Input | What it does |
|---|---|
| **Microphone** | Hum 6 to 12 notes. Any key, octave or tempo works. Leave a small gap between repeated notes. |
| **Demo hum** | A synthetic voice hums a song's opening in a random key and tempo. It goes through the same pitch detector as the microphone, so it is a reliable demo for a room without a quiet mic. *Sloppiness* adds pitch drift, uneven rhythm and the odd skipped note. |
| **Keys** | Play exact notes with the mouse or the keyboard row A–K (Z and X change octave). This skips pitch detection. |
| **Recording** | Analyse an audio file (the first 60 seconds) in real time. |

Shortcuts: **Space** starts or stops, **N** starts a new search, **L** opens the library.

*Tolerance* scales the edit budget. Strict means fewer false matches; loose forgives more mistakes.

What you see:

- **Roll:** the live waveform on the tracker bar, the raw pitch track, and each detected note punched as a slot. The U/D/S letters underneath are the search key.
- **Trie search:** the part of the trie this search visited. Green paths lead to a match. Grey paths are still within budget but have no match yet. Dashed vermilion stubs were pruned for going over budget. Branches torn away since the previous note fade out.
- **Leaderboard:** the top five candidates read in order from the red-black tree, with each song's movement since the last note.
- **Red-black tree:** the tree itself, keyed by score with the best on the left. Below it: height, black height, and the rotations and recolourings the last note caused.
- **Confidence:** rises with query length, with the lead's score, and with the gap between first and second place.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm test` | Native engine tests (g++) and web tests (Vitest, including the compiled WASM) |
| `npm run test:engine` | Native C++ tests only. Uses `$CXX` or `g++`. |
| `npm run test:web` | Vitest only |
| `npm run build:engine` | Recompile the C++ to WebAssembly. Looks for `em++` on `PATH`, under `$EMSDK`, or in `~/emsdk`. |
| `npm run lint` | ESLint |

To install Emscripten:

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk && cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
```

## Layout

```
engine/
  include/hts/   pitch.hpp, notes.hpp, contour.hpp, trie.hpp, rbtree.hpp, engine.hpp
  src/           implementations
  bindings/      wasm.cpp (Embind)
  tests/         test_main.cpp (native), library.inc (generated from data/songs.json)
data/songs.json  the song library
scripts/         engine build, native test runner, library generator
src/
  engine/        WASM loader and types; generated/ holds the Emscripten output
  audio/         capture worklet, frame analyser, synthetic hum voice
  session/       session controller: audio graph, engine and live state
  components/    roll, trie view, leaderboard, red-black tree, confidence, library
  styles/        design tokens and styles
docs/REPORT.md   design and complexity report
```

## Adding songs

Add an entry to `data/songs.json`. Notes are written as pitch name, octave and beats, for example `E4/1 D#5/0.5 Bb3/2`. Only add melodies that are in the public domain. Run `npm test` afterwards: the native tests check every song in the library for accuracy.

## Browser support

Current Chrome, Edge, Firefox and Safari. Microphone input needs HTTPS or localhost. The app is a static site: `npm run build` produces `dist/`, which any static host can serve. The `.wasm` file must be served as `application/wasm`.
