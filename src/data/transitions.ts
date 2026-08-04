// Places that move you somewhere else -- data only.
//
// The map is one flat 48x48 grid with no levels, so "down" has to be somewhere
// else on the same grid. A transition is the seam: stand on it, and you are
// standing somewhere that is meant to be underneath.
//
// This is not a teleport network and should not become one. Each entry is one
// end of a specific, hand-placed passage, and every passage has a matching
// entry going back -- a one-way door is how a player ends up somewhere they
// cannot leave with no idea why.

export interface TransitionDef {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  /** Quest that must be finished before it will carry anyone. */
  readonly quest?: string;
  /** Said on arrival. */
  readonly message: string;
  /** Said when the gate is not met -- the reason it will not take you. */
  readonly refused?: string;
}

export const transitions: readonly TransitionDef[] = [
  {
    from: { x: 47, y: 44 },
    to: { x: 8, y: 44 },
    quest: 'what_the_tide_kept',
    message: 'You go down, and keep going down, and the light stops following.',
    refused: 'Steps going down into black water. Not without a reason, and not alone.'
  },
  {
    from: { x: 8, y: 44 },
    to: { x: 47, y: 44 },
    message: 'You climb, and the water gets lighter, and then it is only a lake again.'
  }
];

/** The passage starting at this tile, if any. */
export function transitionAt(x: number, y: number): TransitionDef | undefined {
  return transitions.find((t) => t.from.x === x && t.from.y === y);
}
