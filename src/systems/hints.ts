// One-time hints.
//
// The game used to explain itself in six chat lines before the player had
// clicked anything: how to walk, where three kinds of enemy live, how to chop
// and light and cook, and how smelting works. All of it true, none of it
// readable, and most of it about things half an hour away.
//
// A hint is cheap when it arrives at the moment it becomes true and expensive
// when it arrives before. So the greeting keeps only what you need in the first
// ten seconds, and everything else waits here until the player is holding the
// thing it is about.
//
// Shown hints ride in the save. A player forty hours in across twenty sessions
// should not be told again what a tinderbox is for.

export class Hints {
  private shown = new Set<string>();

  /**
   * True the first time this id is asked for, false forever after.
   *
   * Callers phrase it as a question -- `if (hints.due('firemaking')) ...` --
   * so the check and the marking cannot drift apart.
   */
  due(id: string): boolean {
    if (this.shown.has(id)) return false;
    this.shown.add(id);
    return true;
  }

  /** Suppress a hint without showing it, for something learnt another way. */
  suppress(id: string): void {
    this.shown.add(id);
  }

  snapshot(): string[] {
    return [...this.shown];
  }

  /**
   * Replace the shown set, rather than merge into it.
   *
   * Loading is not additive: importing a second character in the same session
   * would otherwise inherit whatever the first one had already been told, and
   * a fresh character would silently start with no hints at all.
   */
  restore(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.shown = new Set(data.filter((id): id is string => typeof id === 'string'));
  }

  /**
   * Mark everything as seen. Used when loading a character who already has
   * levels: somebody returning at Woodcutting 30 does not need telling that
   * trees can be chopped, and the save may predate hints existing at all.
   */
  suppressAll(ids: readonly string[]): void {
    for (const id of ids) this.shown.add(id);
  }
}

/** Every hint id, so a returning save can silence the lot in one call. */
export const HINT_IDS = [
  'firemaking', 'cooking', 'mining', 'smelting', 'combat', 'equip'
] as const;
