# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

As proposed in the course proposal and confirmed: C++17 search engine (trie, red-black tree, pitch detection, matching) compiled to WebAssembly with Emscripten; React + TypeScript interface built with Vite; Web Audio API for microphone input. Engine is also unit-tested natively with g++.

## Users

Primary: the project team (Saifullah Waseem, Ammar Alam) demonstrating the system live for a Data Structures & Algorithms course, and the instructor (Professor Aimal Tariq Rextin) and classmates watching and grading. The audience is evaluating two things at once: does it find the song, and do the trie and red-black tree visibly do the work.

Secondary: anyone who opens the app and hums a tune.

## Product Purpose

Hum-to-Search identifies a song from an imperfect human hum: off-key, wrong octave, wrong tempo, missed notes. It encodes melodies as key-invariant interval strings, stores them in a trie, searches it with a bounded edit-distance budget, and keeps live candidates ranked in a red-black tree that re-ranks in O(log n) per score update. Success: a hummed phrase resolves to the right song in real time, and an observer can watch why.

## Positioning

The search structures are the interface. The trie lighting up and pruning as notes arrive, and the red-black leaderboard rebalancing, are the product's proof, not a debug panel.

## Operating Context

Live classroom demo on a laptop, often projected; a microphone in a room with some noise. Also a 30-second demo recording. Graders read the complexity report and the documented source of the trie and red-black tree.

## Capabilities and Constraints

- Pitch detection by autocorrelation; no machine learning.
- Key-invariant encoding by relative interval contour (up / down / same).
- Fuzzy trie traversal with an edit-distance budget; candidates scored and ranked in a red-black tree.
- Live waveform and pitch contour, trie exploration view, live leaderboard, confidence meter.
- Must work without a microphone too (a reliable demo path is required for grading and recording).

## Evidence on Hand

- Song library: public-domain melodies only (classical, folk, traditional), hand-transcribed. The user explicitly chose this over current chart songs; do not add copyrighted melodies.
- Course proposal: `Hum-to-Search_Proposal.docx` (course, instructor, team, timeline, deliverables).
- No user data, testimonials, or benchmarks exist; do not invent accuracy figures.

## Product Principles

1. Show the work: every ranking change should be traceable to a structure the viewer can see.
2. Tolerate the human: imperfect input is the normal case, not an error.
3. Real time or nothing: feedback arrives while the user is still humming.
4. Honest confidence: the meter reflects actual score separation, never theatre.

## Accessibility & Inclusion

Projected in a classroom: legible at distance, never color-only status (red/black nodes also differ by label/shape), keyboard operable, a non-microphone input path, reduced-motion respected.
