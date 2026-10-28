import type { FrameReport, NativeEngine } from '../engine/types';

/** Window handed to the pitch detector, in samples at the analysis rate. */
export const FRAME_SIZE = 1024;

export interface AnalyzedFrame {
  report: FrameReport;
  /** Start of the analysed window on the session clock. */
  timeMs: number;
  /** The analysed window (reused buffer; copy if you keep it). */
  window: Float32Array;
}

/**
 * Accumulates captured audio into a sliding window and runs the engine's pitch
 * detector once per hop. Input above 32 kHz is decimated by 2 (pair average,
 * a mild low-pass) so YIN's O(W·τ) cost stays small; hummed fundamentals sit
 * far below the new Nyquist limit.
 */
export class FrameAnalyzer {
  readonly analysisRate: number;
  private readonly factor: number;
  private readonly window = new Float32Array(FRAME_SIZE);
  private filled = 0;
  private processed = 0;

  constructor(
    private readonly engine: NativeEngine,
    inputRate: number,
    private readonly startMs: number,
    private readonly onFrame: (frame: AnalyzedFrame) => void,
  ) {
    this.factor = inputRate > 32000 ? 2 : 1;
    this.analysisRate = inputRate / this.factor;
  }

  push(chunk: Float32Array): void {
    const hop = Math.floor(chunk.length / this.factor);
    const decimated = new Float32Array(hop);
    for (let i = 0; i < hop; i++) {
      let sum = 0;
      for (let k = 0; k < this.factor; k++) sum += chunk[i * this.factor + k] ?? 0;
      decimated[i] = sum / this.factor;
    }

    // Slide the window left by one hop and append the new samples.
    if (this.filled + hop > FRAME_SIZE) {
      const keep = FRAME_SIZE - hop;
      this.window.copyWithin(0, this.filled - keep, this.filled);
      this.filled = keep;
    }
    this.window.set(decimated, this.filled);
    this.filled += hop;
    this.processed += hop;
    if (this.filled < FRAME_SIZE) return;

    const timeMs = this.startMs + ((this.processed - FRAME_SIZE) / this.analysisRate) * 1000;
    const report = this.engine.pushFrame(this.window, this.analysisRate, timeMs);
    this.onFrame({ report, timeMs, window: this.window });
  }
}
