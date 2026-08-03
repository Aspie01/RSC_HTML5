// Mutable state layered over the static map: depleted resource nodes and fires.
//
// The map itself stays immutable -- it describes where a tree IS, not whether
// that tree currently has logs on it. Keeping the two apart means the world can
// be regenerated or reloaded from a map editor without losing track of what the
// player has chopped down, and it keeps GameMap free of gameplay state.

export interface Fire {
  readonly x: number;
  readonly y: number;
  ticks: number;
  /** Set once at creation so the flame animation is not synchronised. */
  readonly phase: number;
  /** A fire somebody has undertaken to keep alight. It never burns down. */
  permanent: boolean;
}

export class WorldObjects {
  /** Tile index -> ticks remaining before the resource regrows. */
  private readonly depleted = new Map<number, number>();
  readonly fires: Fire[] = [];

  // ----------------------------------------------------------------------
  // Resource depletion
  // ----------------------------------------------------------------------
  isDepleted(tileIndex: number): boolean {
    return this.depleted.has(tileIndex);
  }

  deplete(tileIndex: number, ticks: number): void {
    this.depleted.set(tileIndex, ticks);
  }

  // ----------------------------------------------------------------------
  // Fires
  // ----------------------------------------------------------------------
  addFire(x: number, y: number, ticks: number, permanent = false): Fire {
    const fire: Fire = {
      x, y, ticks, permanent, phase: Math.random() * Math.PI * 2
    };
    this.fires.push(fire);
    return fire;
  }

  fireAt(x: number, y: number): Fire | null {
    return this.fires.find((f) => f.x === x && f.y === y) ?? null;
  }

  /** A fire on this tile or any of the eight neighbours -- close enough to cook on. */
  fireNear(x: number, y: number): Fire | null {
    return this.fires.find(
      (f) => Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1
    ) ?? null;
  }

  // ----------------------------------------------------------------------
  // Upkeep
  // ----------------------------------------------------------------------
  tick(): void {
    for (const [idx, remaining] of this.depleted) {
      if (remaining <= 1) this.depleted.delete(idx);
      else this.depleted.set(idx, remaining - 1);
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i]!;
      if (fire.permanent) continue;
      if (--fire.ticks <= 0) this.fires.splice(i, 1);
    }
  }
}
