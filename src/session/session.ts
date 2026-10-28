// Owns the audio graph, the engine and the live query. React reads a
// low-frequency snapshot (updated per note and per state change) through
// useSyncExternalStore; canvases read the high-frequency `live` data directly
// every animation frame, so 90 audio frames a second never re-render React.

import { FrameAnalyzer, type AnalyzedFrame } from '../audio/analyzer';
import captureWorkletUrl from '../audio/capture-worklet.js?url';
import { playTone, scheduleHum, type ScheduledHum } from '../audio/voice';
import { loadEngine } from '../engine/loadEngine';
import type { EngineNote, EngineStats, NativeEngine, RankingSnapshot, SearchOutcome } from '../engine/types';
import { SONGS } from '../library/songs';

export type Source = 'mic' | 'demo' | 'keys' | 'file';
export type Status = 'loading' | 'ready' | 'listening' | 'playing' | 'fatal';

export type InputErrorKind = 'denied' | 'no-device' | 'insecure' | 'unsupported' | 'decode' | 'unknown';

export interface InputError {
  kind: InputErrorKind;
  message: string;
}

export interface SessionSnapshot {
  status: Status;
  source: Source;
  fatalError: string | null;
  inputError: InputError | null;
  notes: EngineNote[];
  outcome: SearchOutcome | null;
  /** Leaderboard order before the latest search, to show who moved. */
  previousTop: number[];
  ranking: RankingSnapshot | null;
  stats: EngineStats | null;
  tolerance: number;
  demoSong: number | null;
  demoSloppiness: number;
  playingSong: number | null;
  fileName: string | null;
}

export interface PitchPoint {
  timeMs: number;
  midi: number; // NaN when unvoiced
  clarity: number;
}

const TRACK_SECONDS = 14;
const MAX_FILE_SECONDS = 60;

export class Session {
  /** High-frequency data for canvases. Mutated in place; never triggers React. */
  readonly live = {
    waveform: new Float32Array(1024),
    level: 0,
    track: [] as PitchPoint[],
    activeMidi: 0,
    activeStartMs: 0,
    /** Session clock reading while input is stopped; the roll holds still. */
    frozenAtMs: 0,
  };

  private snapshot: SessionSnapshot = {
    status: 'loading',
    source: 'demo',
    fatalError: null,
    inputError: null,
    notes: [],
    outcome: null,
    previousTop: [],
    ranking: null,
    stats: null,
    tolerance: 1,
    demoSong: null,
    demoSloppiness: 0.4,
    playingSong: null,
    fileName: null,
  };

  private listeners = new Set<() => void>();
  private engine: NativeEngine | null = null;
  private ctx: AudioContext | null = null;
  private capture: AudioWorkletNode | null = null;
  private output: GainNode | null = null;
  private analyzer: FrameAnalyzer | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private hum: ScheduledHum | null = null;
  private fileSource: AudioBufferSourceNode | null = null;
  private endTimer: number | null = null;
  private audioReady: Promise<AudioContext> | null = null;
  /** Bumped by every start and stop; a start that awaited past a newer one gives up. */
  private generation = 0;
  private disposed = false;

  constructor() {
    loadEngine(SONGS)
      .then((engine) => {
        if (this.disposed) {
          engine.delete();
          return;
        }
        this.engine = engine;
        this.update({ status: 'ready', stats: engine.stats(), tolerance: engine.tolerance() });
      })
      .catch((error: unknown) => {
        this.update({
          status: 'fatal',
          fatalError: error instanceof Error ? error.message : 'The search engine failed to load.',
        });
      });
  }

  // ── store protocol ────────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Current reading of the session clock (audio time, ms). */
  nowMs(): number {
    const active = this.snapshot.status === 'listening' || this.snapshot.status === 'playing';
    if (!active || !this.ctx) return this.live.frozenAtMs;
    return this.ctx.currentTime * 1000;
  }

  isActive(): boolean {
    return this.snapshot.status === 'listening' || this.snapshot.status === 'playing';
  }

  // ── settings ──────────────────────────────────────────────────────────────
  setSource(source: Source): void {
    if (source === this.snapshot.source) return;
    this.stop();
    this.update({ source, inputError: null });
  }

  setTolerance(tolerance: number): void {
    if (!this.engine) return;
    this.engine.setTolerance(tolerance);
    this.update({ tolerance: this.engine.tolerance() });
    // Re-rank the current query under the new budget.
    if (this.snapshot.notes.length > 0) {
      this.engine.research();
      this.rescore();
    }
  }

  setDemoSong(song: number | null): void {
    this.update({ demoSong: song });
  }

  setDemoSloppiness(value: number): void {
    this.update({ demoSloppiness: Math.min(1, Math.max(0, value)) });
  }

  // ── query lifecycle ───────────────────────────────────────────────────────
  /** Clears the query and the leaderboard. */
  reset(): void {
    this.stop();
    this.engine?.reset();
    this.live.track = [];
    this.live.activeMidi = 0;
    this.live.waveform.fill(0);
    this.live.level = 0;
    this.update({ notes: [], outcome: null, previousTop: [], ranking: this.engine?.rankingSnapshot() ?? null });
  }

  /** Stops whatever input is running and finishes the note in progress. */
  stop(): void {
    this.generation++;
    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    this.hum?.stop();
    this.hum = null;
    if (this.fileSource) {
      this.fileSource.onended = null;
      try {
        this.fileSource.stop();
      } catch {
        // not started or already ended
      }
      this.fileSource.disconnect();
      this.fileSource = null;
    }
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;

    const wasActive = this.isActive();
    if (wasActive) this.live.frozenAtMs = this.ctx ? this.ctx.currentTime * 1000 : 0;
    this.analyzer = null;
    this.live.activeMidi = 0;
    this.live.level = 0;
    if (wasActive && this.engine?.endInput()) this.rescore();
    if (wasActive) this.update({ status: 'ready', playingSong: null });
  }

  async startMicrophone(): Promise<void> {
    if (!this.engine || this.isActive()) return;
    const generation = ++this.generation;
    if (!window.isSecureContext) {
      this.update({ inputError: { kind: 'insecure', message: 'Microphone access needs HTTPS or localhost.' } });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.update({ inputError: { kind: 'unsupported', message: 'This browser does not expose a microphone.' } });
      return;
    }
    let stream: MediaStream;
    try {
      const ctx = await this.ensureAudio();
      stream = await navigator.mediaDevices.getUserMedia({
        // Voice processing is tuned for speech and smears sustained pitch.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (this.disposed || generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.resetQuery();
      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.capture!);
      this.beginCapture(ctx);
      this.update({ status: 'listening', inputError: null });
    } catch (error) {
      this.update({ inputError: describeMicError(error) });
    }
  }

  async playDemo(songIndex?: number): Promise<void> {
    if (!this.engine) return;
    this.stop();
    const generation = ++this.generation;
    const ctx = await this.startAudio(generation);
    if (!ctx) return;
    const pick = songIndex ?? this.snapshot.demoSong ?? Math.floor(Math.random() * SONGS.length);
    const song = SONGS[pick];
    if (!song) return;
    this.resetQuery();

    // Never hum in the library's key: shift by up to a fourth either way.
    let transpose = Math.round(Math.random() * 10) - 5;
    if (transpose === 0) transpose = 3;
    this.hum = scheduleHum(ctx, song, [this.output!, this.capture!], {
      transpose,
      tempoScale: 0.9 + Math.random() * 0.25,
      sloppiness: this.snapshot.demoSloppiness,
      maxNotes: 14,
    });
    this.beginCapture(ctx);
    this.update({ status: 'playing', playingSong: song.index, inputError: null });
    this.endTimer = window.setTimeout(() => this.stop(), (this.hum.durationSec + 0.45) * 1000);
  }

  async analyzeFile(file: File): Promise<void> {
    if (!this.engine) return;
    this.stop();
    const generation = ++this.generation;
    const ctx = await this.startAudio(generation);
    if (!ctx) return;
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      if (generation === this.generation) {
        this.update({
          inputError: { kind: 'decode', message: `"${file.name}" is not an audio format this browser can decode.` },
        });
      }
      return;
    }
    if (generation !== this.generation) return;
    this.resetQuery();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output!);
    source.connect(this.capture!);
    const seconds = Math.min(buffer.duration, MAX_FILE_SECONDS);
    source.start(ctx.currentTime + 0.05, 0, seconds);
    source.onended = () => this.stop();
    this.fileSource = source;
    this.beginCapture(ctx);
    this.update({ status: 'playing', fileName: file.name, inputError: null });
  }

  /** Exact note from the on-screen keys: bypasses pitch detection. */
  pressKey(midi: number): void {
    if (!this.engine) return;
    void this.startAudio(this.generation).then((ctx) => {
      if (!ctx) return;
      playTone(ctx, midi, this.output!);
      const now = ctx.currentTime * 1000;
      this.live.frozenAtMs = now + 400;
      this.live.track.push({ timeMs: now, midi, clarity: 1 });
      this.engine!.pushNote(midi, now, 320);
      this.rescore();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.engine?.delete();
    this.engine = null;
    void this.ctx?.close();
    this.ctx = null;
    this.listeners.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────
  /** ensureAudio for callers that report failure in the UI instead of throwing. */
  private async startAudio(generation: number): Promise<AudioContext | null> {
    try {
      const ctx = await this.ensureAudio();
      return generation === this.generation && !this.disposed ? ctx : null;
    } catch {
      this.update({
        inputError: { kind: 'unsupported', message: 'Audio could not start in this browser. Reload and try again.' },
      });
      return null;
    }
  }

  private async ensureAudio(): Promise<AudioContext> {
    // One shared promise, so overlapping first calls build a single graph.
    this.audioReady ??= this.createAudio().catch((error: unknown) => {
      this.audioReady = null;
      throw error;
    });
    const ctx = await this.audioReady;
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }

  private async createAudio(): Promise<AudioContext> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(captureWorkletUrl);
    const capture = new AudioWorkletNode(ctx, 'hts-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    // The worklet only renders while connected to the destination; keep it silent.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    capture.connect(sink).connect(ctx.destination);
    capture.port.onmessage = (event: MessageEvent<Float32Array>) => this.analyzer?.push(event.data);

    const output = ctx.createGain();
    output.gain.value = 0.9;
    output.connect(ctx.destination);

    this.ctx = ctx;
    this.capture = capture;
    this.output = output;
    return ctx;
  }

  private beginCapture(ctx: AudioContext): void {
    this.analyzer = new FrameAnalyzer(this.engine!, ctx.sampleRate, ctx.currentTime * 1000, (frame) =>
      this.onFrame(frame),
    );
  }

  private onFrame({ report, timeMs, window: frame }: AnalyzedFrame): void {
    this.live.waveform.set(frame);
    this.live.level = report.rms;
    this.live.track.push({ timeMs, midi: report.voiced ? report.midi : Number.NaN, clarity: report.clarity });
    const horizon = timeMs - TRACK_SECONDS * 1000;
    if (this.live.track.length > 2000 || (this.live.track[0]?.timeMs ?? horizon) < horizon) {
      const firstKept = this.live.track.findIndex((p) => p.timeMs >= horizon);
      this.live.track.splice(0, firstKept < 0 ? this.live.track.length : firstKept);
    }
    if (report.activeMidi > 0 && this.live.activeMidi === 0) this.live.activeStartMs = timeMs;
    this.live.activeMidi = report.activeMidi;
    if (report.searched) this.rescore();
  }

  private resetQuery(): void {
    this.engine?.reset();
    this.live.track = [];
    this.live.activeMidi = 0;
    this.update({ notes: [], outcome: null, previousTop: [], ranking: null, fileName: null });
  }

  private rescore(): void {
    if (!this.engine) return;
    const previousTop = this.snapshot.outcome?.top.map((c) => c.song) ?? [];
    this.update({
      notes: this.engine.notes(),
      outcome: this.engine.outcome(),
      previousTop,
      ranking: this.engine.rankingSnapshot(),
    });
  }
}

function describeMicError(error: unknown): InputError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'denied',
      message: 'Microphone access is blocked. Allow it from the address bar, or use Demo hum.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { kind: 'no-device', message: 'No microphone found. Plug one in, or use Demo hum or Keys.' };
  }
  if (name === 'NotReadableError') {
    return { kind: 'no-device', message: 'The microphone is busy in another app. Close it and try again.' };
  }
  return { kind: 'unknown', message: 'The microphone could not start. Try again, or use Demo hum.' };
}
