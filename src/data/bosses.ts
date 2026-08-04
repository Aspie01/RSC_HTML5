// Bosses: an NPC whose stats change partway through the fight.
//
// This is deliberately the smallest thing that earns the word. A boss here is
// an ordinary NPC plus a list of phases, each with a health threshold, a line
// of speech, and stat overrides. Cross a threshold and the overrides layer
// over the definition and the line goes to the chat box. That is all of it.
//
// What it is NOT, on purpose: no scripted attacks, no adds, no arenas, no
// invulnerability windows, no mechanics the player must learn by dying. Every
// one of those is a system in its own right, and none of them is affordable
// against a combat model that resolves one swing per tick against one target.
// A fight that gets harder and says why is legible in a chat box; a fight with
// a rotation is not.
//
// The phase list is read top to bottom and the LAST matching threshold wins,
// so phases must be ordered from full health downwards.

export interface BossPhase {
  /**
   * Entered when health drops to or below this fraction of maximum.
   *
   * A fraction rather than a number so a phase survives the boss's hitpoints
   * being retuned, which happens more than once per boss.
   */
  readonly at: number;
  /** Said as the phase begins. One line -- a speech is not a mechanic. */
  readonly say: string;
  /** Stat overrides, layered over the NPC definition. Omitted means unchanged. */
  readonly attack?: number;
  readonly strength?: number;
  readonly defence?: number;
  readonly attackBonus?: number;
  readonly strengthBonus?: number;
  readonly defenceBonus?: number;
  /** Ticks between its attacks. Lower is faster. */
  readonly speed?: number;
}

export interface BossDef {
  readonly npcId: string;
  readonly phases: readonly BossPhase[];
}

export const bosses: readonly BossDef[] = [
  // The Ninth. Three phases, and the shape of them is the quest's argument:
  // it starts slow and armoured, gives up the armour to hit harder, and ends
  // fast and brittle. A player who brought food outlasts it; a player who
  // brought damage races it. Both work, which is the point of having two.
  {
    npcId: 'the_ninth',
    phases: [
      {
        at: 1.0,
        say: 'It does not look up. It has been counting, and you are not a number it has.',
        defence: 42, defenceBonus: 46, strength: 26, strengthBonus: 30, speed: 6
      },
      {
        at: 0.6,
        say: 'Something comes off it in sheets, and it moves like the weight is gone.',
        defence: 24, defenceBonus: 22, strength: 38, strengthBonus: 52, speed: 5
      },
      {
        at: 0.25,
        say: 'It says a name. It is not yours, and it is not going to say another.',
        defence: 12, defenceBonus: 6, strength: 44, strengthBonus: 64, speed: 3
      }
    ]
  },

  // The Last Warden. Four phases against the Ninth's three, and that is the
  // whole of what "multi-stage" buys: the fight is not harder at any single
  // moment, it just has one more moment in it than the last one did.
  //
  // The shape is the reverse of the Ninth's on purpose. This one opens fast
  // and unarmoured, slows down and armours up in the middle, and ends slow and
  // enormous. A player who learned "outlast the front, race the back" on the
  // Ninth and applies it here runs out of food in the wrong half -- which is
  // the argument for having a second boss at all.
  {
    npcId: 'the_last_warden',
    phases: [
      {
        at: 1.0,
        say: 'It stands up without hurrying, the way somebody does who has been expecting you for a very long time.',
        defence: 30, defenceBonus: 24, strength: 40, strengthBonus: 54, speed: 4
      },
      {
        at: 0.7,
        say: 'It stops giving ground. Whatever it is wearing under all that has stopped being ceremonial.',
        defence: 50, defenceBonus: 70, strength: 34, strengthBonus: 40, speed: 5
      },
      {
        at: 0.4,
        say: '"Nine," it says, as though correcting you. "There were nine of us."',
        defence: 38, defenceBonus: 44, strength: 48, strengthBonus: 70, speed: 4
      },
      {
        at: 0.15,
        say: 'It puts everything it has left into one arm, and stops defending itself at all.',
        defence: 8, defenceBonus: 0, strength: 62, strengthBonus: 96, speed: 6
      }
    ]
  }
];

export function getBoss(npcId: string): BossDef | undefined {
  return bosses.find((b) => b.npcId === npcId);
}
