/**
 * The synthesiser that plays `cues.ts`, plus the ambient bed.
 *
 * Owns every WebAudio object in the game. Two constraints shape it:
 *
 * 1. **No AudioContext before a user gesture.** Browsers create one in a
 *    `suspended` state otherwise, and Chrome logs a warning for every page
 *    that tries. The context is built by `unlock()`, called from the
 *    click-to-start overlay, which exists largely for this reason.
 * 2. **Audio must never be able to break the game.** Every entry point is
 *    guarded and silent on failure. A browser with WebAudio disabled, or an
 *    iframe that refuses audio, should cost the player sound and nothing else
 *    -- so no call here throws, and none returns a value worth checking.
 *
 * Not part of the simulation: `play()` is called for its side effect on the
 * speakers only, and nothing in the tick pipeline reads back from it.
 */

import { CUES, type CueId, type Layer } from './cues.ts';

/** Headroom under the master gain so stacked cues cannot clip. */
const MASTER_GAIN = 0.5;

const AMBIENT_GAIN = 0.055;

/**
 * Cues fired within this window collapse to one.
 *
 * Several systems can land on the same tick -- a hit that also levels a skill,
 * or two NPCs striking together -- and the same cue twice a millisecond apart
 * is a flanged mess rather than two sounds.
 */
const DEDUPE_MS = 45;

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambient: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  private muted = false;
  private readonly lastPlayed = new Map<CueId, number>();

  get available(): boolean { return this.ctx !== null; }
  get isMuted(): boolean { return this.muted; }

  /**
   * Build the audio graph. Must be called from inside a user gesture.
   *
   * Safe to call repeatedly: later calls only resume a context that the
   * browser suspended, which happens when a background tab is restored.
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;

        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(this.ctx);
      }

      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;

    // Ramped rather than set: an instant gain change on a running oscillator
    // is a click, which is louder than the sound being muted.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + 0.08);
  }

  play(id: CueId): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;

    const now = performance.now();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    this.lastPlayed.set(id, now);

    try {
      for (const layer of CUES[id]) this.playLayer(ctx, master, layer);
    } catch {
      // A cue that will not play is not worth a broken frame.
    }
  }

  private playLayer(ctx: AudioContext, master: GainNode, layer: Layer): void {
    const start = ctx.currentTime + (layer.at ?? 0);
    const end = start + layer.dur;

    const gain = ctx.createGain();
    gain.connect(master);

    // A short attack instead of an instant one: starting a gain at full
    // amplitude produces a click on top of every sound.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(layer.gain, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    if (layer.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.wave ?? 'sine';
      osc.frequency.setValueAtTime(layer.freq, start);
      if (layer.to !== undefined && layer.to !== layer.freq) {
        // Exponential, not linear: pitch is perceived logarithmically, so a
        // linear sweep sounds like it slows down as it falls.
        osc.frequency.exponentialRampToValueAtTime(Math.max(layer.to, 1), end);
      }
      osc.connect(gain);
      osc.start(start);
      osc.stop(end);
      return;
    }

    if (!this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    // Start at a random offset so repeated hits are not audibly identical.
    // Render-only jitter: nothing in the simulation can observe this.
    src.loopStart = 0;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = layer.filter;
    band.Q.value = layer.q ?? 1;

    src.connect(band);
    band.connect(gain);
    src.start(start, Math.random() * (this.noiseBuffer.duration - layer.dur - 0.01));
    src.stop(end);
  }

  /**
   * Start the ambient bed: filtered noise as wind, under a low drone.
   *
   * One looping buffer rather than a scheduled sequence, so it costs nothing
   * per tick and cannot drift out of sync with anything.
   */
  startAmbient(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambient || !this.noiseBuffer) return;

    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 340;
      low.Q.value = 0.4;

      // Slowly swell the filter so the wind rises and falls instead of sitting
      // as a flat hiss. 23 seconds is long enough not to read as a pattern.
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.frequency.value = 1 / 23;
      lfoDepth.gain.value = 150;
      lfo.connect(lfoDepth);
      lfoDepth.connect(low.frequency);
      lfo.start();

      src.connect(low);
      low.connect(gain);
      src.start();

      // Fade in over four seconds; arriving under a wall of noise is worse
      // than arriving in silence.
      gain.gain.linearRampToValueAtTime(AMBIENT_GAIN, ctx.currentTime + 4);

      this.ambient = { source: src, gain };
    } catch {
      this.ambient = null;
    }
  }

  /**
   * Four seconds of white noise, reused by every noise layer and the ambient
   * bed. Generating one buffer and reading it at different offsets and filters
   * is far cheaper than building noise per sound.
   */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

/**
 * One instance for the process. Audio hardware is a singleton in fact, and
 * threading a handle through every call site that wants a click would touch
 * far more of the game than the feature is worth.
 */
export const audio = new Audio();
