// The conversation box.
//
// RuneScape Classic dialogue was a sequence of lines you clicked through, not
// a branching tree, and that is exactly what this plays back. Keeping it linear
// is a design decision rather than a limitation: branching dialogue multiplies
// the writing, the testing, and the number of states a quest can be in.
//
// The world keeps ticking underneath. Talking to someone has never been a
// reason for the chickens to stop moving.

import type { DialogueLine } from '../data/quests.ts';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

export class Dialogue {
  private readonly box = el<HTMLDivElement>('dialogue');
  private readonly nameEl = el<HTMLDivElement>('dialogue-name');
  private readonly textEl = el<HTMLDivElement>('dialogue-text');
  private readonly hintEl = el<HTMLDivElement>('dialogue-hint');

  private lines: readonly DialogueLine[] = [];
  private index = 0;
  private speaker = '';
  private onFinish: (() => void) | null = null;

  constructor() {
    this.box.addEventListener('click', () => this.next());

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        // Escape skips the rest rather than abandoning it half-said, so a
        // quest can never advance on some lines the player never saw.
        if (e.code === 'Escape') this.finish();
        else this.next();
      }
    });
  }

  isOpen(): boolean {
    return this.lines.length > 0;
  }

  /**
   * Play `lines` as `speaker`, then run `onFinish`.
   *
   * The callback is what advances the quest, so it fires once and only once,
   * after the last line has actually been read.
   */
  open(speaker: string, lines: readonly DialogueLine[], onFinish?: () => void): void {
    if (!lines.length) {
      onFinish?.();
      return;
    }

    this.speaker = speaker;
    this.lines = lines;
    this.index = 0;
    this.onFinish = onFinish ?? null;

    this.box.style.display = 'block';
    this.render();
  }

  private render(): void {
    const line = this.lines[this.index];
    if (!line) return;

    const isPlayer = line.who === 'player';
    this.nameEl.textContent = isPlayer ? 'You' : this.speaker;
    this.nameEl.classList.toggle('player', isPlayer);
    this.textEl.textContent = line.text;

    const last = this.index === this.lines.length - 1;
    this.hintEl.textContent = last ? 'Click to end' : 'Click to continue';
  }

  private next(): void {
    if (!this.isOpen()) return;

    this.index++;
    if (this.index >= this.lines.length) this.finish();
    else this.render();
  }

  private finish(): void {
    const done = this.onFinish;

    this.lines = [];
    this.index = 0;
    this.onFinish = null;
    this.box.style.display = 'none';

    done?.();
  }

  /**
   * Drop the conversation on the floor without running its callback.
   *
   * The opposite of finish(): used when the character being spoken to is no
   * longer the character who will receive the outcome, as after importing a
   * save. Firing onFinish there would advance a quest on someone who never
   * held the conversation.
   */
  abandon(): void {
    this.lines = [];
    this.index = 0;
    this.onFinish = null;
    this.box.style.display = 'none';
  }
}
