// A hum-like synthetic voice: a sawtooth through a low-pass filter (the closed
// mouth), with natural vibrato. Used for the demo hum and the on-screen keys.

import type { Song } from '../library/songs';
import { midiToHz } from '../library/notation';

export interface HumOptions {
  /** Semitones added to every note, so the hum is never in the library's key. */
  transpose: number;
  /** Multiplies the song's tempo. */
  tempoScale: number;
  /** 0 = exact, 1 = a careless hummer (pitch drift, rushed rhythm, a skipped note). */
  sloppiness: number;
  /** How many notes of the song to hum. */
  maxNotes: number;
  random?: () => number;
}

export interface ScheduledHum {
  durationSec: number;
  /** Notes actually hummed, after sloppiness, for display. */
  notes: { midi: number; startSec: number; durationSec: number }[];
  stop(): void;
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createVoice(ctx: BaseAudioContext, outputs: AudioNode[]) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 950;
  filter.Q.value = 0.8;
  const amp = ctx.createGain();
  amp.gain.value = 0;

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.4;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 14; // cents
  vibrato.connect(vibratoDepth).connect(osc.detune);

  osc.connect(filter).connect(amp);
  for (const out of outputs) amp.connect(out);

  const stop = (at: number) => {
    osc.stop(at);
    vibrato.stop(at);
  };
  const disconnect = () => {
    amp.disconnect();
    vibratoDepth.disconnect();
  };
  return { osc, amp, vibrato, stop, disconnect };
}

/** Schedules a hummed rendition of the start of `song`. */
export function scheduleHum(ctx: AudioContext, song: Song, outputs: AudioNode[], options: HumOptions): ScheduledHum {
  const random = options.random ?? Math.random;
  const voice = createVoice(ctx, outputs);
  const t0 = ctx.currentTime + 0.08;
  const beatSec = 60 / (song.tempo * options.tempoScale);
  const s = options.sloppiness;

  const notes: ScheduledHum['notes'] = [];
  let t = t0;
  const source = song.notes.slice(0, options.maxNotes);
  source.forEach((note, i) => {
    // A careless hummer skips the odd short note (never the first two).
    if (i > 1 && note.beats < 1 && random() < 0.07 * s) return;
    const midi = note.midi + options.transpose + gaussian(random) * 0.22 * s;
    const duration = Math.max(0.12, note.beats * beatSec * (1 + gaussian(random) * 0.12 * s));
    notes.push({ midi, startSec: t - t0, durationSec: duration });

    const attack = 0.025;
    const release = Math.min(0.06, duration * 0.3);
    voice.osc.frequency.setTargetAtTime(midiToHz(midi), t, 0.012);
    voice.amp.gain.setValueAtTime(0, t);
    voice.amp.gain.linearRampToValueAtTime(0.32, t + attack);
    voice.amp.gain.setValueAtTime(0.3, t + duration - release);
    voice.amp.gain.linearRampToValueAtTime(0, t + duration);
    t += duration + 0.03; // the breath between notes that re-articulates repeats
  });

  const first = notes[0];
  if (first) voice.osc.frequency.setValueAtTime(midiToHz(first.midi), t0);
  voice.osc.start(t0);
  voice.vibrato.start(t0);
  voice.stop(t + 0.1);
  voice.osc.onended = () => voice.disconnect();

  return {
    durationSec: t - t0,
    notes,
    stop() {
      const now = ctx.currentTime;
      voice.amp.gain.cancelScheduledValues(now);
      voice.amp.gain.setTargetAtTime(0, now, 0.015);
      try {
        voice.stop(now + 0.08);
      } catch {
        // already stopped
      }
    },
  };
}

/** A short hummed tone for the on-screen keys. */
export function playTone(ctx: AudioContext, midi: number, output: AudioNode, durationSec = 0.32): void {
  const voice = createVoice(ctx, [output]);
  const t = ctx.currentTime;
  voice.osc.frequency.value = midiToHz(midi);
  voice.amp.gain.setValueAtTime(0, t);
  voice.amp.gain.linearRampToValueAtTime(0.28, t + 0.02);
  voice.amp.gain.setTargetAtTime(0, t + durationSec * 0.6, 0.05);
  voice.osc.start(t);
  voice.vibrato.start(t);
  voice.stop(t + durationSec + 0.3);
  voice.osc.onended = () => voice.disconnect();
}
