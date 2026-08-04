// Pointer input: one place that turns mice, fingers and styluses into the two
// gestures this game actually has.
//
// RuneScape's whole interaction model is two verbs: act on a thing, or ask a
// thing what you could do to it. On a mouse those are left-click and
// right-click. There is no right button on a phone, so the second verb has to
// come from somewhere -- here it is a long press, which is the convention every
// touch platform already teaches.
//
// Everything goes through Pointer Events rather than a mouse path plus a
// parallel touch path. Touch synthesises mouse events after a delay, so the two
// paths would double-fire on every tap and the bugs from that are the
// intermittent kind. One path, and `pointerType` decides the details.

/** How long a finger must rest before it counts as asking rather than acting. */
const LONG_PRESS_MS = 450;

/**
 * How far a finger may wander first, in CSS pixels.
 *
 * Fingers are not still. Too tight and nobody can ever open a menu; too loose
 * and a scroll gesture opens one by accident. Ten is the usual platform figure.
 */
const MOVE_TOLERANCE = 10;

export interface PointerHandlers {
  /** Left click, or a tap. Coordinates are relative to the element. */
  tap(x: number, y: number): void;
  /**
   * Right click, or a long press. Also given viewport coordinates, because
   * that is where a context menu has to be positioned.
   */
  menu(x: number, y: number, clientX: number, clientY: number): void;
  /** Mouse only -- a finger has no hover state to report. */
  hover?(x: number, y: number): void;
  /** Mouse leaving, or a touch gesture ending. */
  leave?(): void;
}

/** True once anything has touched the screen. Drives the one-time hint. */
let touchSeen = false;
export function hasUsedTouch(): boolean {
  return touchSeen;
}

/**
 * Callbacks for the first touch of the session.
 *
 * Long press is a convention, not an affordance -- there is nothing on screen
 * to suggest it, and a player who never discovers it can walk around and do
 * nothing else. So the game says it once, and only to people holding a device
 * where it is true. Registering interest is a callback rather than a poll
 * because the answer changes at most once and never changes back.
 */
const firstTouchListeners: Array<() => void> = [];

export function onFirstTouch(fn: () => void): void {
  if (touchSeen) { fn(); return; }
  firstTouchListeners.push(fn);
}

function noteTouch(): void {
  if (touchSeen) return;
  touchSeen = true;
  for (const fn of firstTouchListeners.splice(0)) fn();
}

export function bindPointer(el: HTMLElement, handlers: PointerHandlers): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  /**
   * Set when a long press has fired, and read by the pointerup that follows.
   *
   * Without it, lifting the finger after a long press would also tap, so every
   * menu would be opened and then immediately acted through -- you would chop
   * the tree you were asking about.
   */
  let handled = false;

  const cancel = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') noteTouch();

    handled = false;
    startX = e.clientX;
    startY = e.clientY;

    // A mouse knows its own mind: the right button is the menu, immediately.
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        handled = true;
        const { x, y } = local(e);
        handlers.menu(x, y, e.clientX, e.clientY);
      }
      return;
    }

    cancel();
    timer = setTimeout(() => {
      timer = null;
      handled = true;
      const { x, y } = local(e);
      handlers.menu(x, y, e.clientX, e.clientY);

      // A menu that opens under a fingertip is invisible until the finger
      // moves, so say so in the one channel a phone always has.
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const { x, y } = local(e);
      handlers.hover?.(x, y);
      return;
    }
    // A finger that has travelled is scrolling or dragging, not pressing.
    if (timer !== null &&
        (Math.abs(e.clientX - startX) > MOVE_TOLERANCE ||
         Math.abs(e.clientY - startY) > MOVE_TOLERANCE)) {
      cancel();
      handled = true;
    }
  });

  el.addEventListener('pointerup', (e) => {
    cancel();
    if (handled) { handled = false; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const { x, y } = local(e);
    handlers.tap(x, y);
    if (e.pointerType === 'touch') handlers.leave?.();
  });

  // The browser taking the gesture over -- a scroll starting, a call arriving.
  el.addEventListener('pointercancel', () => {
    cancel();
    handled = true;
    handlers.leave?.();
  });

  el.addEventListener('pointerleave', (e) => {
    cancel();
    if (e.pointerType === 'mouse') handlers.leave?.();
  });

  // Suppress the browser's own menu everywhere this is bound: on a mouse it
  // would cover ours, and on iOS a long press otherwise raises the callout and
  // the selection handles instead of the game's menu.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
