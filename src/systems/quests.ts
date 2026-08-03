// Quest progress.
//
// One number per quest, and everything else is derived:
//
//   0            not started
//   1..n         working on stages[stage - 1]
//   n + 1        finished
//
// Storing a stage index rather than a bag of booleans is what keeps quests
// linear by construction. There is no state a quest can be in that this number
// cannot express, and no way to be half way through two stages at once.

import type { QuestDef, QuestStage } from '../data/quests';
import { quests, getQuest } from '../data/quests';

export type QuestProgress = Record<string, number>;

export class Quests {
  /** Quest id -> stage index. Absent means never started. */
  stages: QuestProgress = {};

  stageOf(id: string): number {
    return this.stages[id] ?? 0;
  }

  isStarted(id: string): boolean {
    return this.stageOf(id) > 0;
  }

  isComplete(def: QuestDef): boolean {
    return this.stageOf(def.id) > def.stages.length;
  }

  /** The stage being worked on, or null when unstarted or finished. */
  activeStage(def: QuestDef): QuestStage | null {
    const stage = this.stageOf(def.id);
    if (stage < 1 || stage > def.stages.length) return null;
    return def.stages[stage - 1] ?? null;
  }

  setStage(id: string, stage: number): void {
    this.stages[id] = stage;
  }

  advance(def: QuestDef): void {
    this.stages[def.id] = this.stageOf(def.id) + 1;
  }

  points(): number {
    return quests.reduce(
      (n, q) => (this.isComplete(q) ? n + q.reward.points : n),
      0
    );
  }

  completedCount(): number {
    return quests.reduce((n, q) => (this.isComplete(q) ? n + 1 : n), 0);
  }

  /**
   * Load saved progress, keeping only quests that still exist and clamping
   * stage numbers into range. A quest removed or shortened between versions
   * must not leave a character stuck on a stage that is no longer there.
   */
  restore(saved: unknown): void {
    if (!saved || typeof saved !== 'object') return;

    for (const [id, value] of Object.entries(saved as Record<string, unknown>)) {
      const def = getQuest(id);
      if (!def || typeof value !== 'number' || !Number.isFinite(value)) continue;
      this.stages[id] = Math.max(0, Math.min(Math.floor(value), def.stages.length + 1));
    }
  }
}
