// Scenery that can be looked at closely, and what looking says.
//
// Membership of this table is what makes a thing clickable-to-inspect at all,
// so a quest that sends the player to look at something must add its kind here
// or the stage cannot be reached by clicking.
//
// It lives in `data/` rather than in `game.ts` specifically so the test suite
// can import it. When the list was inlined in the engine the test had to keep
// its own copy, which drifted immediately -- and the drift was not theoretical:
// two shipped quests had inspect stages on scenery nobody could click.

export const INSPECT_TEXT: Readonly<Record<string, string>> = {
  well: 'The village well. The water is a long way down, and further than it used to be.',
  thicket: 'Dead reed, standing upright. It died where it stood and never fell.',
  stone_box: 'A stone box, set in the pool. Placed, not dropped.',
  rubble: 'A fall of loose stone. The edges of it were squared by hand.',
  descent: 'Steps going down under the water. They do not stop where the light does.'
};

/** True if this scenery kind can be clicked to look at. */
export function inspectable(kind: string): boolean {
  return INSPECT_TEXT[kind] !== undefined;
}
