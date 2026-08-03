// Quests -- pure data, including every line of dialogue.
//
// Quests are the tutorial system. Each one introduces a mechanic and then
// gives a reason to use it, which is why every quest here ends by handing over
// something the player could not have before.
//
// Structure is deliberately rigid, because branching quests are where scope
// death happens:
//   - one NPC per stage
//   - two to four stages
//   - no branches, one ending
//   - every quest unlocks something
//
// A stage says what the journal reads, who to see, what completes it, and what
// that NPC says both before and after it is done. That is the whole grammar --
// adding a quest never means touching engine code.

import type { SkillId } from '../types';

export interface QuestItem {
  readonly id: string;
  readonly qty: number;
}

export interface DialogueLine {
  readonly who: 'npc' | 'player';
  readonly text: string;
}

/**
 * What finishes a stage. Deliberately a closed set: a predicate would be a
 * function, and functions in the content layer are how content stops being
 * data. Grow this union when a quest genuinely needs something new.
 */
export type QuestGoal =
  | { readonly type: 'talk' }
  | { readonly type: 'give'; readonly items: readonly QuestItem[] }
  /** Light a fire on or beside this stage's NPC. */
  | { readonly type: 'fire-near' };

export interface QuestStage {
  /** Shown in the quest journal while this stage is the active one. */
  readonly journal: string;
  readonly npc: string;
  readonly goal: QuestGoal;
  /** Said when you talk with the goal unmet. Unused by `talk` stages. */
  readonly waiting?: readonly DialogueLine[];
  /** Said as the stage completes. */
  readonly done: readonly DialogueLine[];
  /**
   * Items handed over as this stage ends, before the next one begins.
   *
   * Distinct from the quest reward, which only arrives at the end. A stage
   * needs this whenever it hands out the means to do the NEXT stage: Low Tide
   * gives a rod and then asks for four sprats, and without granting the rod
   * here the quest asks for fish the player has no way to catch. Any stage
   * whose dialogue says "take this" wants a `gives`.
   */
  readonly gives?: readonly QuestItem[];
}

export interface QuestReward {
  readonly points: number;
  readonly xp?: Partial<Record<SkillId, number>>;
  readonly items?: readonly QuestItem[];
  /** One line describing what this quest opened up, shown on completion. */
  readonly unlock: string;
}

export interface QuestDef {
  readonly id: string;
  readonly name: string;
  readonly requires?: {
    readonly quests?: readonly string[];
    readonly skills?: Partial<Record<SkillId, number>>;
  };
  readonly stages: readonly QuestStage[];
  readonly reward: QuestReward;
  /** Said when the requirements are not met yet. */
  readonly blocked?: readonly DialogueLine[];
  /** Said by the final NPC once the quest is behind you. */
  readonly afterwards: readonly DialogueLine[];
}

// --------------------------------------------------------------------------

export const quests: readonly QuestDef[] = [
  {
    id: 'cold_hearth',
    name: 'Cold Hearth',
    reward: {
      points: 1,
      xp: { firemaking: 60, cooking: 60 },
      unlock: 'Maren keeps her fire lit. You can cook at the crossroads whenever you like.'
    },
    stages: [
      {
        journal: 'Maren Ashfall is sitting at the crossroads with no fire.',
        npc: 'maren',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: "You'll forgive me for not standing. I've been walking since the tide turned and my hands have gone past cold." },
          { who: 'npc', text: "There's nothing dry enough to burn this side of the water. Find me something that will catch and I'm in your debt." },
          { who: 'player', text: "I'll see what I can do." }
        ]
      },
      {
        journal: 'Chop a tree, then light a fire beside Maren.',
        npc: 'maren',
        goal: { type: 'fire-near' },
        waiting: [
          { who: 'npc', text: 'Any of the trees off the road will do. A tinderbox does the rest -- you should have one on you.' }
        ],
        done: [
          { who: 'npc', text: "Oh, that's better. That's a great deal better." },
          { who: 'npc', text: "I've not eaten since yesterday, mind. There are chickens penned north-west of here, if you've the stomach for it." }
        ]
      },
      {
        journal: 'Cook a chicken on the fire and give it to Maren.',
        npc: 'maren',
        goal: { type: 'give', items: [{ id: 'cooked_chicken', qty: 1 }] },
        waiting: [
          { who: 'npc', text: 'Raw is no good to me. Hold it over the flame until it stops being raw -- you will know when you have got it wrong.' }
        ],
        done: [
          { who: 'npc', text: 'Bless you. Sit a while; the fire is as much yours as mine now.' },
          { who: 'npc', text: "And it won't go out again. I'll see to that much." }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: "Still burning, you see. I keep my word about small things." }
    ]
  },

  {
    id: 'green_timber',
    name: 'Green Timber',
    reward: {
      points: 1,
      xp: { woodcutting: 120 },
      items: [{ id: 'woodsmans_axe', qty: 1 }],
      unlock: "Tobin's felling axe is yours. It bites harder than bronze."
    },
    stages: [
      {
        journal: 'Tobin Reeve has an order to fill and a bad back.',
        npc: 'tobin',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: "You've the look of someone with time on their hands. Good, because I have an order to fill and a back that has given up entirely." },
          { who: 'npc', text: 'Eight logs. Ordinary ones, nothing clever. Can you manage that?' },
          { who: 'player', text: 'Eight logs. I can manage that.' }
        ]
      },
      {
        journal: 'Bring Tobin Reeve 8 logs.',
        npc: 'tobin',
        goal: { type: 'give', items: [{ id: 'logs', qty: 8 }] },
        waiting: [
          { who: 'npc', text: 'Eight. Your pack holds thirty, so it is not the counting that troubles people, it is the carrying.' }
        ],
        done: [
          { who: 'npc', text: 'Straight, dry, and not one of them split. You have done this before.' },
          { who: 'npc', text: 'Here. My old felling axe -- better steel than whatever you have been swinging at them.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Mind the edge on that axe. I never did get round to blunting it.' }
    ]
  },

  // Quest 3 of the tutorial tier. No gate and no prerequisite: it has to be
  // completable by someone who walked east before they walked anywhere else.
  // The rod comes first and the catch second, so the reward is what makes the
  // skill possible rather than what decorates it.
  {
    id: 'low_tide',
    name: 'Low Tide',
    reward: {
      points: 1,
      xp: { fishing: 60, cooking: 40 },
      unlock: 'The pier is yours to fish. The shallows will keep you fed.'
    },
    stages: [
      {
        journal: 'Iselle Marrow is at the pier, watching water she does not trust.',
        npc: 'iselle',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'Careful on the boards, they are older than I am. Everyone comes down here eventually.' },
          { who: 'npc', text: 'Water is low again. Third time this season, and nobody upriver will say why.' },
          { who: 'player', text: 'Is that unusual?' },
          { who: 'npc', text: 'It is now. But you did not come for my worrying. You came because you are hungry, or you will be.' },
          { who: 'npc', text: 'Take my spare rod. Bring me back four sprats off the shallows and I will call us square.' }
        ],
        // The rod arrives HERE, not with the reward -- the next stage asks for
        // fish, and without it there would be no way to catch them.
        gives: [{ id: 'fishing_rod', qty: 1 }]
      },
      {
        journal: 'Catch 4 raw sprats from the shallows and bring them to Iselle.',
        npc: 'iselle',
        goal: { type: 'give', items: [{ id: 'raw_sprat', qty: 4 }] },
        waiting: [
          { who: 'npc', text: 'Stand where the rings are. If the water goes still, the shoal has moved on -- walk a few boards and try again.' }
        ],
        done: [
          { who: 'npc', text: 'Four, and not one of them chewed. You have the patience for it, which is most of the skill.' },
          { who: 'npc', text: 'Keep the rod. Cook them over a fire before you eat them, unless you enjoy being unwell.' },
          { who: 'npc', text: 'And if the water drops again -- you will tell someone, will you not? Somebody ought to be keeping count.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Still dropping. Slowly, but it is dropping.' }
    ]
  },

  {
    id: 'bent_nail',
    name: 'The Bent Nail',
    requires: { quests: ['cold_hearth'] },
    blocked: [
      { who: 'npc', text: "I'm no use to you today. Ask after me once you have done a good turn for someone in this Reach -- word travels, and I would rather hear it first." }
    ],
    reward: {
      points: 2,
      xp: { mining: 100, smithing: 150 },
      items: [{ id: 'smiths_hammer', qty: 1 }],
      unlock: "Garrow's hammer works the anvil faster than your own."
    },
    stages: [
      {
        journal: 'Garrow Blackfen has a commission he cannot fill.',
        npc: 'garrow',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: "Mind the anvil. It is the only thing in this smithy that still does what it is told." },
          { who: 'npc', text: 'I have a commission I cannot fill. No bronze, no time, and a hammer I have bent past straightening.' },
          { who: 'npc', text: 'Two bronze bars. The quarry is west of here -- copper and tin, one of each to the bar, and the furnace is stood right behind you.' },
          { who: 'player', text: 'Two bronze bars.' }
        ]
      },
      {
        journal: 'Bring Garrow Blackfen 2 bronze bars.',
        npc: 'garrow',
        goal: { type: 'give', items: [{ id: 'bronze_bar', qty: 2 }] },
        waiting: [
          { who: 'npc', text: 'Copper and tin, together in the furnace. You will want a pickaxe before you want anything else.' }
        ],
        done: [
          { who: 'npc', text: 'That is honest bronze. Now the part that actually matters.' },
          { who: 'npc', text: 'Take a bar to the anvil and make me a dagger. I want to watch you do it, not watch you carry one in.' }
        ]
      },
      {
        journal: 'Smith a bronze dagger and bring it to Garrow Blackfen.',
        npc: 'garrow',
        goal: { type: 'give', items: [{ id: 'bronze_dagger', qty: 1 }] },
        waiting: [
          { who: 'npc', text: 'One bar, the anvil behind you. It is the first thing anyone is taught and the last thing anyone masters.' }
        ],
        done: [
          { who: 'npc', text: 'There. Out of the ground and given an edge, start to finish, and none of it bought.' },
          { who: 'npc', text: 'This was my father\'s. A truer hammer than mine ever was -- you will work quicker with it than without.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'The anvil is there. I have never once charged anyone for the use of it.' }
    ]
  }
];

export function getQuest(id: string): QuestDef | undefined {
  return quests.find((q) => q.id === id);
}

/** Every quest that expects to be talked to at this NPC. */
export function questsForNpc(npcId: string): readonly QuestDef[] {
  return quests.filter((q) => q.stages.some((s) => s.npc === npcId));
}

export const TOTAL_QUEST_POINTS = quests.reduce((n, q) => n + q.reward.points, 0);
