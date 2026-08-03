/**
 * Sound effects, as data.
 *
 * Every cue is a stack of layers, and every layer is either a pitched tone or
 * a burst of filtered noise. That vocabulary is deliberately small: two shapes
 * cover an axe on wood, a hammer on an anvil and a level-up fanfare, and a
 * small vocabulary is what keeps adding a sound a data edit rather than a new
 * function -- the same reason content lives in `data/`.
 *
 * Nothing here is loaded. It is synthesised at play time from oscillators and
 * a noise buffer, so there are no audio files to fetch, to license, to grow
 * the bundle, or to go missing inside a sandboxed itch.io iframe. This mirrors
 * `render/sprites.ts`, which draws the art from canvas primitives for exactly
 * the same reasons.
 *
 * Rough guide to writing one:
 *   - `at` staggers layers; a thud followed 40ms later by noise reads as an
 *     impact, while the same two together read as a single muddy blip.
 *   - dropping `freq` to `to` over a short `dur` is a hit; rising is a
 *     success. This is most of what makes a cue feel good or bad.
 *   - anything metallic wants a high, narrow noise layer over the tone.
 */

export type Layer =
  | {
      kind: 'tone';
      /** Starting frequency in Hz. */
      freq: number;
      /** Slide to this frequency across the layer's life. Omit to hold. */
      to?: number;
      dur: number;
      gain: number;
      wave?: OscillatorType;
      /** Delay before this layer starts, in seconds. */
      at?: number;
    }
  | {
      kind: 'noise';
      dur: number;
      gain: number;
      /** Bandpass centre. High and narrow reads as metal, low and wide as earth. */
      filter: number;
      q?: number;
      at?: number;
    };

export type CueId =
  | 'chop' | 'mine' | 'smelt' | 'smith' | 'fire' | 'cook' | 'eat'
  | 'hit' | 'hurt' | 'die' | 'pickup' | 'drop' | 'levelup' | 'quest'
  | 'click' | 'deny';

export const CUES: Readonly<Record<CueId, readonly Layer[]>> = {
  // Axe into a trunk: a dull low knock, then the splintering.
  chop: [
    { kind: 'tone', freq: 190, to: 90, dur: 0.11, gain: 0.28, wave: 'triangle' },
    { kind: 'noise', dur: 0.13, gain: 0.16, filter: 1100, q: 0.9, at: 0.02 }
  ],

  // Pick on stone. Higher and harder than wood, with grit after it.
  mine: [
    { kind: 'tone', freq: 420, to: 240, dur: 0.07, gain: 0.22, wave: 'square' },
    { kind: 'noise', dur: 0.16, gain: 0.13, filter: 2600, q: 1.4, at: 0.03 }
  ],

  // Ore going into the furnace: a soft roar rather than an impact.
  smelt: [
    { kind: 'noise', dur: 0.5, gain: 0.11, filter: 620, q: 0.6 },
    { kind: 'tone', freq: 110, to: 150, dur: 0.45, gain: 0.09, wave: 'sawtooth' }
  ],

  // Hammer on anvil. The ring is the point, so the tone outlasts the strike.
  smith: [
    { kind: 'tone', freq: 880, to: 760, dur: 0.34, gain: 0.2, wave: 'triangle' },
    { kind: 'tone', freq: 1760, to: 1600, dur: 0.26, gain: 0.09, wave: 'sine', at: 0.01 },
    { kind: 'noise', dur: 0.06, gain: 0.2, filter: 3800, q: 2.2 }
  ],

  fire: [
    { kind: 'noise', dur: 0.55, gain: 0.17, filter: 900, q: 0.5 },
    { kind: 'tone', freq: 320, to: 90, dur: 0.4, gain: 0.07, wave: 'sawtooth' }
  ],

  cook: [
    { kind: 'noise', dur: 0.42, gain: 0.1, filter: 3200, q: 0.8 }
  ],

  eat: [
    { kind: 'noise', dur: 0.1, gain: 0.12, filter: 1500, q: 1.1 },
    { kind: 'noise', dur: 0.09, gain: 0.1, filter: 1200, q: 1.1, at: 0.14 }
  ],

  hit: [
    { kind: 'tone', freq: 150, to: 60, dur: 0.1, gain: 0.26, wave: 'triangle' },
    { kind: 'noise', dur: 0.07, gain: 0.13, filter: 800, q: 0.8 }
  ],

  // The player taking damage, as opposed to dealing it: same shape, sourer.
  hurt: [
    { kind: 'tone', freq: 260, to: 110, dur: 0.18, gain: 0.24, wave: 'square' },
    { kind: 'noise', dur: 0.1, gain: 0.1, filter: 700, q: 0.7 }
  ],

  die: [
    { kind: 'tone', freq: 330, to: 70, dur: 0.75, gain: 0.26, wave: 'sawtooth' },
    { kind: 'tone', freq: 165, to: 50, dur: 0.8, gain: 0.16, wave: 'triangle', at: 0.05 }
  ],

  pickup: [
    { kind: 'tone', freq: 700, to: 1000, dur: 0.07, gain: 0.14, wave: 'square' }
  ],

  drop: [
    { kind: 'tone', freq: 500, to: 300, dur: 0.08, gain: 0.12, wave: 'square' }
  ],

  // Rising major triad. The one sound worth being unmistakable.
  levelup: [
    { kind: 'tone', freq: 523, dur: 0.13, gain: 0.2, wave: 'square' },
    { kind: 'tone', freq: 659, dur: 0.13, gain: 0.2, wave: 'square', at: 0.12 },
    { kind: 'tone', freq: 784, dur: 0.13, gain: 0.2, wave: 'square', at: 0.24 },
    { kind: 'tone', freq: 1047, dur: 0.34, gain: 0.22, wave: 'square', at: 0.36 }
  ],

  // Longer and fuller than a level-up: a quest ends far less often.
  quest: [
    { kind: 'tone', freq: 392, dur: 0.16, gain: 0.18, wave: 'triangle' },
    { kind: 'tone', freq: 523, dur: 0.16, gain: 0.18, wave: 'triangle', at: 0.15 },
    { kind: 'tone', freq: 659, dur: 0.16, gain: 0.18, wave: 'triangle', at: 0.3 },
    { kind: 'tone', freq: 784, dur: 0.5, gain: 0.2, wave: 'triangle', at: 0.45 },
    { kind: 'tone', freq: 1175, dur: 0.5, gain: 0.12, wave: 'sine', at: 0.45 }
  ],

  click: [
    { kind: 'tone', freq: 900, to: 700, dur: 0.035, gain: 0.07, wave: 'square' }
  ],

  // Refusal. A falling minor second is unpleasant on purpose.
  deny: [
    { kind: 'tone', freq: 340, to: 320, dur: 0.14, gain: 0.14, wave: 'square' }
  ]
};
