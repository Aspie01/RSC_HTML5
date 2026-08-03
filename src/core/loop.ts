// The game loop -- the most important file in the project.
//
// RuneScape resolves ALL game logic on a fixed 600ms tick: movement, combat,
// respawns, eating. Rendering runs separately at monitor refresh rate and
// interpolates between the last tick and the next, which is why OSRS characters
// glide smoothly despite only ever moving once every 600ms.
//
// Keep logic in onTick and visuals in onRender. Never advance game state inside
// onRender -- that is how you get framerate-dependent combat, and it is the
// single most common way a project like this goes wrong.

export const TICK_MS = 600;

export type TickHandler = (tickCount: number) => void;
export type RenderHandler = (alpha: number, deltaMs: number) => void;

class GameLoop {
  readonly tickMs = TICK_MS;

  tickCount = 0;
  running = false;

  /** How far we are between the previous tick and the next, in [0, 1). */
  alpha = 0;

  private frameHandle = 0;

  start(onTick: TickHandler, onRender: RenderHandler): void {
    if (this.running) return;
    this.running = true;

    let accumulator = 0;
    let last = performance.now();

    const frame = (now: number): void => {
      if (!this.running) return;

      let delta = now - last;
      last = now;

      // If the tab was backgrounded, do not try to replay ten minutes of ticks
      // in one frame -- that locks the page. Cap the catch-up instead.
      if (delta > 1000) delta = 1000;

      accumulator += delta;

      while (accumulator >= TICK_MS) {
        accumulator -= TICK_MS;
        this.tickCount++;
        onTick(this.tickCount);
      }

      this.alpha = accumulator / TICK_MS;
      onRender(this.alpha, delta);

      this.frameHandle = requestAnimationFrame(frame);
    };

    this.frameHandle = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
  }
}

export const loop = new GameLoop();
