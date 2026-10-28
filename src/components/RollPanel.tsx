import { useEffect, useMemo, useRef } from 'react';
import { fitCanvas, readTokens, roundRect } from '../lib/canvas';
import { useAnimationFrame, useElementSize, useSession, useSnapshot } from '../lib/hooks';
import { centsOff, noteName } from '../library/notation';

const WINDOW_MS = 8000;
const RANGE = 20; // semitones visible
const TRACKER_H = 46;
const CODE_ROW_H = 26;
const PERF_SPACING = 14;

const TOKENS = ['paper', 'paper-hi', 'paper-lo', 'paper-edge', 'rule', 'rule-strong', 'ink', 'ink-2', 'ink-3', 'hole', 'leader', 'leader-soft'] as const;

export function RollPanel() {
  const session = useSession();
  const snap = useSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const centerRef = useRef(62);
  const lastCenter = useRef(Number.NaN);
  const notesRef = useRef(snap.notes);
  notesRef.current = snap.notes;
  const queryWindow = snap.stats?.queryWindow ?? 18;
  const colors = useMemo(() => readTokens(TOKENS), []);
  const monoFont = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--font-mono'), []);
  const drawnKey = useRef('');

  const hasData = snap.notes.length > 0 || session.isActive();

  useEffect(() => {
    if (!hasData && readoutRef.current) readoutRef.current.textContent = '';
  }, [hasData]);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = fitCanvas(canvas, size.width, size.height);
    if (!ctx) return;
    const W = size.width;
    const H = size.height;
    const now = session.nowMs();
    const live = session.live;
    const notes = notesRef.current;

    // While nothing is moving, the last frame is still correct.
    const key = `${W}x${H}:${now}:${notes.length}:${live.track.length}:${queryWindow}`;
    const active = session.isActive();
    if (!active && key === drawnKey.current && Math.abs(centerRef.current - lastCenter.current) < 0.01) return;
    drawnKey.current = key;
    lastCenter.current = centerRef.current;

    const nowX = W - 64;
    const left = 44;
    const xOf = (t: number) => nowX - ((now - t) / WINDOW_MS) * (nowX - left);
    const top = TRACKER_H + 12;
    const bottom = H - CODE_ROW_H - 8;

    // Follow the singer: ease the visible pitch range toward recent notes.
    const recent: number[] = [];
    for (let i = live.track.length - 1; i >= 0 && recent.length < 40; i--) {
      const p = live.track[i];
      if (p && !Number.isNaN(p.midi) && now - p.timeMs < WINDOW_MS) recent.push(p.midi);
    }
    for (const n of notes.slice(-8)) if (now - n.startMs < WINDOW_MS) recent.push(n.midi);
    if (recent.length) {
      recent.sort((a, b) => a - b);
      const target = recent[Math.floor(recent.length / 2)] ?? centerRef.current;
      centerRef.current += (target - centerRef.current) * 0.06;
    }
    const low = centerRef.current - RANGE / 2;
    const semitone = (bottom - top) / RANGE;
    const yOf = (midi: number) => bottom - (midi - low) * semitone;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors['paper-hi'];
    ctx.fillRect(0, 0, W, H);

    // Tracker bar: the live waveform as the roll passes over it.
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, W, TRACKER_H);
    ctx.fillStyle = colors['paper-edge'];
    ctx.fillRect(0, TRACKER_H - 1, W, 1);
    ctx.strokeStyle = session.isActive() ? colors.ink : colors['ink-3'];
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    const wave = live.waveform;
    const mid = TRACKER_H / 2 + 2;
    const gain = Math.min(14, 0.32 / Math.max(live.level, 0.02));
    for (let x = 0; x <= W; x += 2) {
      const sample = session.isActive() ? (wave[Math.floor((x / W) * (wave.length - 1))] ?? 0) : 0;
      const y = mid - Math.max(-1, Math.min(1, sample * gain)) * (TRACKER_H / 2 - 9);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sprocket perforations scroll with the roll.
    const travel = ((now / WINDOW_MS) * (nowX - left)) % PERF_SPACING;
    ctx.fillStyle = colors['paper-edge'];
    for (let x = -travel; x < W; x += PERF_SPACING) {
      ctx.beginPath();
      ctx.arc(x, H - 6, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Semitone rules; C is ruled stronger and labelled.
    ctx.font = `500 10px ${monoFont}`;
    ctx.textBaseline = 'middle';
    for (let m = Math.ceil(low); m <= low + RANGE; m++) {
      const y = Math.round(yOf(m)) + 0.5;
      const isC = ((m % 12) + 12) % 12 === 0;
      ctx.strokeStyle = isC ? colors.rule : colors['paper-lo'];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left - 6, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      if (isC) {
        ctx.fillStyle = colors['ink-3'];
        ctx.fillText(noteName(m), 8, y);
      }
    }

    // The reading line, where the roll meets the tracker bar.
    ctx.strokeStyle = colors['rule-strong'];
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(nowX + 0.5, TRACKER_H);
    ctx.lineTo(nowX + 0.5, H - CODE_ROW_H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 6, TRACKER_H, nowX - left + 10, H - TRACKER_H);
    ctx.clip();

    // Raw pitch track: one dot per analysed frame.
    for (const p of live.track) {
      if (Number.isNaN(p.midi)) continue;
      const x = xOf(p.timeMs);
      if (x < left - 6) continue;
      ctx.globalAlpha = 0.25 + 0.55 * p.clarity;
      ctx.fillStyle = colors['ink-2'];
      ctx.fillRect(x - 1, yOf(p.midi) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Completed notes, punched. Notes outside the query window are faded.
    const slotH = Math.max(6, semitone * 0.78);
    const firstInQuery = Math.max(0, notes.length - (queryWindow + 1));
    notes.forEach((note, i) => {
      const x0 = xOf(note.startMs);
      const x1 = xOf(note.startMs + note.durationMs);
      if (x1 < left - 6) return;
      ctx.globalAlpha = i < firstInQuery ? 0.3 : 1;
      ctx.fillStyle = colors.hole;
      roundRect(ctx, x0, yOf(note.midi) - slotH / 2, Math.max(4, x1 - x0 - 2), slotH, 3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // The note being hummed right now grows from its onset.
    if (live.activeMidi > 0 && session.isActive()) {
      const x0 = Math.max(left - 6, xOf(live.activeStartMs));
      ctx.strokeStyle = colors.leader;
      ctx.fillStyle = colors['leader-soft'];
      ctx.lineWidth = 1.5;
      roundRect(ctx, x0, yOf(live.activeMidi) - slotH / 2, Math.max(4, nowX - x0), slotH, 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Step code under each note boundary.
    ctx.font = `650 11px ${monoFont}`;
    ctx.textAlign = 'center';
    for (let i = 1; i < notes.length; i++) {
      const prev = notes[i - 1];
      const note = notes[i];
      if (!prev || !note) continue;
      const x = xOf(note.startMs);
      if (x < left || x > nowX) continue;
      const delta = note.midi - prev.midi;
      const step = delta >= 0.6 ? 'U' : delta <= -0.6 ? 'D' : 'S';
      ctx.fillStyle = i <= firstInQuery ? colors['ink-3'] : colors.ink;
      ctx.fillText(step, x, H - CODE_ROW_H / 2 - 4);
    }
    ctx.textAlign = 'start';

    // Header readout, written directly to avoid a React render per frame.
    const readout = readoutRef.current;
    if (readout) {
      const latest = live.activeMidi > 0 && session.isActive() ? live.activeMidi : notes.at(-1)?.midi;
      if (latest !== undefined) {
        const cents = centsOff(latest);
        readout.textContent = `${noteName(latest)} ${cents >= 0 ? '+' : '−'}${Math.abs(cents)}¢`;
      }
    }
  });

  return (
    <section className="panel area-roll" aria-labelledby="roll-title">
      <div className="panel-head">
        <h2 className="panel-title" id="roll-title">Roll</h2>
        <span className="panel-meta">
          <strong className="mono" ref={readoutRef} />
          {snap.notes.length > 0 && <> · {snap.notes.length} {snap.notes.length === 1 ? 'note' : 'notes'}</>}
        </span>
      </div>
      <div className="roll" ref={boxRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            snap.notes.length
              ? `Pitch roll with ${snap.notes.length} detected notes`
              : 'Pitch roll, empty until you hum or play notes'
          }
        />
        {!hasData && (
          <div className="canvas-empty">
            <div className="canvas-empty-copy">
              <p className="canvas-empty-title">Every note you hum is punched here</p>
              <p className="canvas-empty-body">
                Pitch runs bottom to top, time runs left to right. The letters underneath are the search key:
                U up, D down, S same.
              </p>
            </div>
          </div>
        )}
      </div>
      <QueryCode />
    </section>
  );
}

function QueryCode() {
  const snap = useSnapshot();
  const outcome = snap.outcome;
  const minSteps = snap.stats?.minQuerySteps ?? 3;
  const steps = outcome?.query ?? '';
  const needed = Math.max(0, minSteps + 1 - snap.notes.length);

  return (
    <div className="query" aria-live="polite">
      <span className="query-label">Search key</span>
      {steps.length > 0 ? (
        <span className="query-steps" aria-label={`Interval code ${steps.split('').join(' ')}`}>
          {steps.split('').map((step, i) => (
            // Keyed by absolute note position so only newly punched steps animate.
            <span key={snap.notes.length - steps.length + i} className="step" data-step={step}>
              {step}
            </span>
          ))}
        </span>
      ) : (
        <span className="query-empty">
          {snap.notes.length === 0
            ? 'No notes yet.'
            : `${needed} more ${needed === 1 ? 'note' : 'notes'} before the first search.`}
        </span>
      )}
      {outcome && outcome.budget > 0 && (
        <span className="query-budget">
          budget <strong className="mono">{(outcome.budget / 2).toFixed(1)}</strong> edits
        </span>
      )}
    </div>
  );
}
