---
name: Hum-to-Search
description: Hum a tune and watch a trie and a red-black tree find the song, drawn as a player-piano roll being read.
colors:
  paper: "oklch(0.932 0.03 86)"
  paper-hi: "oklch(0.958 0.022 88)"
  paper-lo: "oklch(0.893 0.036 83)"
  paper-edge: "oklch(0.84 0.042 80)"
  rule: "oklch(0.77 0.04 76)"
  rule-strong: "oklch(0.62 0.04 70)"
  ink: "oklch(0.25 0.022 55)"
  ink-2: "oklch(0.4 0.03 60)"
  ink-3: "oklch(0.5 0.032 64)"
  hole: "oklch(0.22 0.02 50)"
  walnut: "oklch(0.285 0.03 48)"
  walnut-hi: "oklch(0.355 0.034 48)"
  walnut-lo: "oklch(0.235 0.026 48)"
  on-walnut: "oklch(0.94 0.026 86)"
  on-walnut-2: "oklch(0.8 0.032 80)"
  leader: "oklch(0.47 0.095 163)"
  leader-hi: "oklch(0.55 0.1 163)"
  leader-soft: "oklch(0.87 0.045 160)"
  vermilion: "oklch(0.555 0.17 36)"
  vermilion-soft: "oklch(0.88 0.05 40)"
  gold: "oklch(0.72 0.13 80)"
  gold-deep: "oklch(0.52 0.1 70)"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 2.3vw, 2.5rem)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 76"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 84"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 640
    lineHeight: 1.45
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 82"
  panel-label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 680
    lineHeight: 1.45
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 78"
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  body-sm:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  code:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'Cascadia Mono', monospace"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.45
rounded:
  sheet: "2px"
  slot: "3px"
  control: "6px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "20px"
  s-6: "24px"
  s-8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.paper-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.paper}"
  button-ghost-dark:
    backgroundColor: "transparent"
    textColor: "{colors.on-walnut}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-ghost-dark-hover:
    backgroundColor: "{colors.walnut-hi}"
  source-tab:
    backgroundColor: "transparent"
    textColor: "{colors.on-walnut-2}"
    padding: "0 16px"
    height: "44px"
  source-tab-selected:
    backgroundColor: "{colors.paper-lo}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.paper-hi}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "38px"
  step-slot:
    backgroundColor: "{colors.hole}"
    textColor: "{colors.paper-hi}"
    typography: "{typography.code}"
    rounded: "{rounded.slot}"
    width: "24px"
    height: "28px"
  rank-slot-lead:
    backgroundColor: "{colors.leader}"
    textColor: "{colors.paper-hi}"
    typography: "{typography.code}"
    rounded: "{rounded.slot}"
    size: "24px"
  meter-slot-on:
    backgroundColor: "{colors.gold}"
    rounded: "{rounded.sheet}"
    height: "18px"
  topbar:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.on-walnut}"
    padding: "0 24px"
    height: "60px"
---

# Design System: Hum-to-Search

## Overview

**Creative North Star: "The Player-Piano Roll"**

The hum is a punched music roll and the search is that roll being read. The page is manila roll paper held in a dark walnut roll box: a walnut rail across the top carries the name, the input-source tabs and the start control; everything below sits on paper. Data is drawn as punched slots: notes on the roll, the interval code under it, the leaderboard ranks, the confidence meter and the piano keys' pressed state all use the same small rectangular hole. The search structures are the interface, so the trie and red-black tree get canvas and SVG space equal to the result itself.

Density is instrument-panel, not marketing: a 4px spacing base, 13-16px text, hairline rules between areas, and no cards. Because the app is projected in a classroom, the type ramp steps up one notch above 1200px and status is never carried by color alone (red nodes are outlined, black nodes filled; pruned branches end in a torn tick; rank changes carry an arrow).

The shipped build rejects the dark neon audio dashboard with glowing waveform and card grid. Surfaces are flat paper; depth appears only where a physical sheet sits on the page or a drawer slides over it.

**Key Characteristics:**
- Manila paper ground, walnut shell rail, black punched holes.
- Three roll-leader inks, each with exactly one job: green follows, vermilion tears, gold measures confidence.
- One variable grotesque (Archivo) whose width axis condenses headings; mono only for interval code and numbers.
- Hairline rules and paper edges divide areas; no cards, no glass.
- Strong ease-out motion for state changes; everything collapses under reduced motion.

## Colors

Warm, low-chroma paper and walnut neutrals carry the whole interface; three saturated inks appear only where the search is doing something.

### Primary
- **Roll-Leader Green** (`leader`): the followed track. The current lead's rank slot and score bar, live and matched trie paths, the lead node's ring in the red-black tree, pressed black piano keys, and the focus ring. `leader-hi` is the focus color on walnut tabs; `leader-soft` fills pressed white keys and the current note on the roll.

### Secondary
- **Torn Vermilion** (`vermilion`): red-black red nodes (outlined, vermilion label) and torn, over-budget trie branches. `vermilion-soft` is the only alert background, with deep vermilion text.

### Tertiary
- **Confidence Gold** (`gold`): the lit slots of the confidence meter, and nothing else. `gold-deep` outlines lit slots once the match is locked in.

### Neutral
- **Manila Page** (`paper-lo`): the body ground and the selected source tab, so the tab reads as cut from the page.
- **Roll Sheet** (`paper-hi`): the roll and trie sheets, primary buttons, inputs and white keys; paler than the page so punched holes keep full contrast.
- **Roll Paper** (`paper`): the library drawer and hover fill for paper buttons.
- **Paper Edge** (`paper-edge`): sheet edges, unlit meter and level slots, empty score-bar tracks, selection.
- **Hairline** (`rule`) and **Strong Hairline** (`rule-strong`): area dividers, control borders, tree edges, meter threshold ticks, scrollbars.
- **Roll Ink** (`ink`), **Ink 2** (`ink-2`), **Ink 3** (`ink-3`): text at three strengths; `ink-2` for meta and hints, `ink-3` for axis labels, placeholders and unchanged rank markers.
- **Punched Hole** (`hole`): every punched slot, black red-black nodes, black keys, lit level-meter slots.
- **Walnut** (`walnut`, `walnut-hi`, `walnut-lo`): the top rail, its hover state and its bottom edge. **On Walnut** (`on-walnut`, `on-walnut-2`) is text on the rail.

### Named Rules
**The One Job Rule.** Each leader ink has a single meaning: green = followed, vermilion = red node or torn branch, gold = confidence. Never borrow one for decoration, emphasis or a different status.

**The Paper Sheet Rule.** Anything drawn on (roll, trie, white keys, inputs) sits on `paper-hi`, one step paler than the `paper-lo` page, so punched `hole` marks hit full contrast.

## Typography

**Display Font:** Archivo Variable, with its width axis (with system-ui, Segoe UI fallback)
**Body Font:** Archivo Variable (same family)
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace, Cascadia Mono fallback)

**Character:** A single workhorse grotesque does every job, condensed through `font-stretch` (76-90%) where a roll label would be narrow and tall. Mono is reserved for machine data: the interval code, pitch readouts, scores, counts and key labels. Body text uses tabular numerals throughout.

### Hierarchy
- **Display** (650, clamp(1.75rem, 2.3vw, 2.5rem), 1.1, width 76%): the locked-in song title only; the roll-leader label naming the tune.
- **Headline** (650, 1.4375rem, 1.1, width 84%): the confidence word before lock-in (listening, narrowing).
- **Title** (640, 1.1875rem, width 82%): the brand name on the rail; the drawer title uses the same size at 650 and width 84%.
- **Panel Label** (680, 0.8125rem, 0.06em tracking, uppercase, width 78%): the panel headings themselves (Roll, Trie search, Confidence, Leaderboard, Red-black tree). It is each section's only heading, ruled underneath, not a decoration above another headline.
- **Body** (400, 0.875rem, 1.45): default text. Hints cap at 62ch, empty-state copy at 44-52ch.
- **Body small** (0.8125rem): meta lines, legends, field labels (field label weight 560).
- **Code** (JetBrains Mono, 0.75rem, 650 in slots): interval steps, ranks, scores, proofs; song codes use 0.08em tracking.

Above 1200px the scale steps up (xs 0.8125, sm 0.875, base 1, md 1.0625rem) for projection.

### Named Rules
**The Mono Is Data Rule.** JetBrains Mono appears only on values the engine produced or consumes: intervals, notes, numbers, keyboard keys. Prose and labels stay in Archivo.

**The Width Axis Rule.** Headings get hierarchy from width (condensed) and weight (620-680), not from large size jumps; only the locked-in title is allowed past 1.5rem.

## Layout

A three-row app grid: walnut rail (min 60px), source bar (min 64px, hairline below), workspace. The workspace is a two-column grid, roll and trie on the left at 1.7fr, the rank column (confidence, leaderboard, red-black tree) at minmax(320px, 1fr), with a 32px column gap and 20/24/32px padding. Panels stack with 24px between them; each opens with a baseline-aligned head ruled by a hairline.

Spacing is a 4px base (4, 8, 12, 16, 20, 24, 32). Controls are 36px tall (28px small, 38px inputs, 44px source tabs).

Responsive behavior: at 1080px the workspace collapses to one column ordered roll, rank, trie, with the rank panels in a two-column sub-grid (tree spans both). At 980px the source tabs drop to their own row under the rail; at 720px they scroll edge to edge; at 480px start/stop buttons fill the width, tab icons hide, the roll shortens to 240px and the trie to 320px. Labels and the keyboard hints shed progressively at 1400px and 1180px.

## Elevation & Depth

Flat by default, tonal layering throughout. Depth appears only on physical objects: a paper sheet resting on the page, and the library drawer sliding over it. Shadows are warm (tinted from `ink`), never neutral grey.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 0 0 1px var(--paper-edge), 0 10px 22px -16px oklch(0.25 0.02 55 / 0.45)`): the roll and trie canvases; a paper edge plus a low, tight drop.
- **Drawer** (`box-shadow: -18px 0 40px -24px oklch(0.25 0.02 55 / 0.5)`): the library drawer's leading edge, over a `oklch(0.2 0.02 50 / 0.28)` backdrop.
- **Focus** (`box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--leader)`): every focus-visible state on paper; walnut tabs use an inset 2px `leader-hi` ring instead.
- **Slot outline** (`box-shadow: inset 0 0 0 1.5px var(--hole)` or `var(--rule-strong)`): unpunched slots (the S step, unranked rank boxes).

### Named Rules
**The Paper Sheet Lift Rule.** Only sheets (roll, trie) and the drawer cast shadows. Panels, rows, buttons and inputs stay flat and are separated by hairlines.

## Shapes

Small, mechanical corners. Sheets are nearly square (2px), punched slots slightly softened (3px), controls and the alert 6px. Piano keys round only their bottom corners (4px); source tabs round only their top corners (6px) so they read as tabs cut from the page. The recurring silhouette is the small vertical-or-horizontal rectangle of a punched hole: interval steps (24x28), rank boxes (24x24), meter slots (24 across, 18px tall, 3px gaps), level holes (6x14), and the logo's three climbing slots.

## Components

### Buttons
Quiet, paper-and-walnut, never filled with an accent.
- **Shape:** gently cornered (6px), 36px tall, 16px horizontal padding, weight 600, 18px stroke icon with 8px gap.
- **Primary:** roll-sheet paper (`paper-hi`) with `paper-edge` border and ink text, sitting on the walnut rail; hover settles to `paper`.
- **Stop:** transparent with an `on-walnut-2` border on the rail; hover `walnut-hi`.
- **Ghost dark:** transparent on walnut with a `walnut-hi` border (New search, Library).
- **Ghost:** transparent on paper with a `rule` border; hover `paper` fill and `rule-strong` border. Small (28px) and icon-only (36px square) variants.
- **Press / Disabled:** scale(0.97) on active over 120ms ease-out; disabled at 50% opacity. Hover only applies on fine pointers.

### Source Tabs
Tabs cut from the roll paper: 44px tall, top corners 6px, `on-walnut-2` text on walnut; the selected tab takes the `paper-lo` page color so it joins the page below. Hover on fine pointers lifts to `walnut-hi`.

### Inputs / Fields
- **Style:** `paper-hi` fill, 1px `rule` border, 6px corners, 36-38px tall; selects carry an inline ink chevron. Ranges use `accent-color: ink` with a mono readout.
- **Focus:** the paper-gapped leader-green ring.
- **Error:** an inline alert, `vermilion-soft` ground with deep vermilion text and an alert icon, never color alone.

### Navigation
The walnut top rail: mark (three punched slots, the top one leader green), condensed name, course line, source tabs, then actions pushed right. The library opens as a right-side drawer (min(440px, 100vw)) of `paper` sliding in over 260ms.

### Punched Slot (signature)
The single data mark. `hole`-black, 3px corners, mono 650 label in `paper-hi`. Interval steps punch in (scale 0.6 to 1 with fade, 260ms ease-out); an unchanged step (S) is an outlined, unpunched slot. Rank boxes are outlined slots; the lead's is filled leader green.

### Confidence Meter
24 slots that fill with gold left to right, staggered 12ms per slot over 220ms, with 1px `rule-strong` threshold ticks at narrowing and locked-in and a text scale beneath. When locked in, lit slots gain a `gold-deep` inset and the state block becomes a ruled leader label (2px ink rule above, strong hairline below) naming the tune at display size.

### Leaderboard Row
Three-row grid: rank slot, title (Archivo 620 at md) and score (mono), meta line with composer and a mono proof, then a 3px score bar. Rows are separated by hairlines; the lead's bar and rank slot are leader green, others `ink-2`. Movement shows as an up/down arrow plus color shift, and bars scale on `transform`.

### Red-Black Tree
SVG nodes: red nodes are `paper-hi` circles with a 2.25 `vermilion` stroke and vermilion label; black nodes are filled `hole`. The lead's node gets a 3px `leader` ring. Edges are 1.25 `rule-strong`. Nodes move with a 320ms ease-out transform.

### Piano Keys
A 64px board: white keys `paper-hi` with `rule-strong` borders and mono note names; black keys `hole`. Pressed state is `leader-soft` (white) or `leader` (black), 90ms.

## Do's and Don'ts

### Do:
- **Do** read every color from the CSS custom properties, including canvas drawing; the roll and trie canvases sample `--paper-hi`, `--leader`, `--vermilion` and the rest at runtime.
- **Do** keep each leader ink to its one job (green followed, vermilion red/torn, gold confidence).
- **Do** draw new data as punched slots on `paper-hi` sheets, with mono labels.
- **Do** divide areas with 1px `rule` hairlines and panel heads, not containers.
- **Do** use `cubic-bezier(0.23, 1, 0.32, 1)` at 140ms for control state changes and 220-320ms for data movement, and keep the reduced-motion collapse.
- **Do** pair every color-coded status with a second cue: outline vs fill, an arrow, a torn tick, or a text label.
- **Do** step type up one notch above 1200px for projection.

### Don't:
- **Don't** use the dark neon audio dashboard: no glowing waveform, no dark canvas, no card grid.
- **Don't** wrap panels in cards or frosted glass; only roll and trie sheets and the drawer get a shadow.
- **Don't** fill buttons with leader green, vermilion or gold; actions stay paper or walnut.
- **Don't** set prose, labels or headings in JetBrains Mono.
- **Don't** add a second sans or a display face; condense Archivo with its width axis instead.
