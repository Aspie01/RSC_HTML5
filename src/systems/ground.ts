// Items lying on the floor.
//
// Ground items despawn after a timer, like RuneScape drops. Stacking is by
// tile: several different items can share a tile and all be picked up.

export const GROUND_DESPAWN_TICKS = 300; // 300 ticks = 3 minutes

export interface GroundItem {
  readonly id: string;
  readonly qty: number;
  readonly x: number;
  readonly y: number;
  ticks: number;
  /** Small random offset so a pile of drops does not render as one item. */
  readonly jitterX: number;
  readonly jitterY: number;
}

export class GroundItems {
  readonly items: GroundItem[] = [];

  drop(id: string, qty: number, x: number, y: number): void {
    this.items.push({
      id,
      qty: qty || 1,
      x,
      y,
      ticks: GROUND_DESPAWN_TICKS,
      jitterX: (Math.random() - 0.5) * 18, // render-only
      jitterY: (Math.random() - 0.5) * 10 // render-only
    });
  }

  at(x: number, y: number): GroundItem[] {
    return this.items.filter((it) => it.x === x && it.y === y);
  }

  remove(item: GroundItem): void {
    const i = this.items.indexOf(item);
    if (i !== -1) this.items.splice(i, 1);
  }

  tick(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (--it.ticks <= 0) this.items.splice(i, 1);
    }
  }
}
