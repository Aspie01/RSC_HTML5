/**
 * The save format itself, and the text codec that lets a player carry it
 * between browsers by hand.
 *
 * `SaveData` and `SAVE_VERSION` live here rather than in `game.ts` because
 * both the storage layer and the import path need to reason about a save's
 * version without pulling in the whole game. Migration stays in `game.ts`:
 * converting an old save needs live skills, inventory and world objects to
 * write into, none of which belong in a serialisation module.
 */

/**
 * Bump when the save format changes in a way old data cannot survive
 * unaltered, and add a step to the migration in `game.ts`. Never silently
 * discard progress.
 *
 * 1 -> 2: skills renamed (hitpoints -> vitality, ranged -> archery), Prayer
 *         removed, and the experience curve recapped from 99 to 50.
 */
export const SAVE_VERSION = 2;

export interface SaveData {
  v: number;
  x: number;
  y: number;
  hp: number;
  xp: Record<string, number>;
  style: string;
  running: boolean;
  slots: unknown;
  equipment: unknown;
  quests?: unknown;
  /** Kill tallies for quest stages in progress. Absent means none counted. */
  questKills?: unknown;
  /**
   * The seeded generator's state. Carrying it is what makes a save replay
   * identically rather than merely resemble itself. Absent on saves written
   * before it existed, which simply get a fresh stream of luck.
   */
  rng?: unknown;
  /**
   * Lifetime counters for the statistics screen. Optional, and absent means
   * a returning player starts counting from zero rather than losing a save --
   * no version bump, since nothing in the simulation reads them.
   */
  stats?: unknown;
  /** Spellbook state. Absent means Vigil is unfinished, which is the default. */
  knowsSpells?: unknown;
  spell?: unknown;
  /**
   * Shop stock and restock timers. Optional, and absent means every shop is
   * full -- which is why adding shops needed no version bump: a save written
   * before they existed restores to exactly the state a new game starts in.
   */
  shops?: unknown;
}

/**
 * Marks an exported code as ours, so a player who finds one in a text file a
 * year later can tell what it is, and so pasting in something else entirely
 * fails with a useful message instead of a JSON syntax error.
 *
 * The trailing digit is the envelope's version, not the save's -- it changes
 * only if the encoding itself changes, which it has not.
 */
const CODE_PREFIX = 'RSCSAVE1:';

/** Encode a serialised save as a single line of text safe to paste anywhere. */
export function encodeSaveCode(raw: string): string {
  const bytes = new TextEncoder().encode(raw);

  // btoa() takes a binary string, so the UTF-8 bytes have to be walked across
  // one char code at a time. Chunked because spreading a large array into
  // String.fromCharCode blows the argument limit on big saves.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return CODE_PREFIX + btoa(binary);
}

/**
 * Decode a pasted save code back to its serialised form.
 *
 * Throws with a message meant for the player rather than the console: this is
 * the one persistence path they drive by hand, so every way it can fail needs
 * to say what to do about it.
 */
export function decodeSaveCode(code: string): string {
  // Copying out of a textarea picks up wrapping and stray whitespace, and
  // pasting through chat clients adds more. None of it is meaningful.
  let body = code.replace(/\s+/g, '');
  if (!body) throw new Error('No save code was entered.');

  const marked = /^RSCSAVE\d+:/.exec(body);
  if (marked) body = body.slice(marked[0].length);

  let raw: string;
  try {
    const binary = atob(body);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    raw = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('That does not look like a save code.');
  }

  const parsed = parseSave(raw);
  if (!parsed) throw new Error('That save code is damaged and cannot be read.');

  if (parsed.v > SAVE_VERSION) {
    throw new Error(
      'That save was made in a newer version of the game than this one.'
    );
  }

  return raw;
}

/**
 * Parse a serialised save, returning null rather than throwing if it is not
 * one. Used on both the storage and import paths so a corrupt save is judged
 * by the same standard wherever it came from.
 */
export function parseSave(raw: string): (Partial<SaveData> & { v: number }) | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  // A version is the one field with no sensible default: without it there is
  // no way to know which migrations a save still needs. Absent means 1, which
  // is what saves written before the field existed are.
  const record = value as Partial<SaveData>;
  const v = typeof record.v === 'number' && Number.isFinite(record.v) ? record.v : 1;

  return { ...record, v };
}
