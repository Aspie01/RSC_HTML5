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
  | { readonly type: 'fire-near' }
  /**
   * Go and look at a specific thing in the world.
   *
   * Unlike the others, this stage does not end at an NPC -- it ends where the
   * thing is, and the `done` lines are the player thinking rather than someone
   * talking. That is what makes an investigation feel like one: the discovery
   * happens at the well, not in a report afterwards.
   */
  | { readonly type: 'inspect'; readonly x: number; readonly y: number };

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

  // Quest 7. The reward is a place, not an item: the only coal in the world is
  // behind this, which is what stops the lower mine being an optional detour.
  // Gated on Mining 10 because the quest asks for iron, and a player who
  // cannot mine iron would be sent somewhere they have no business being.
  {
    id: 'deepcut',
    name: 'Deepcut',
    requires: { quests: ['bent_nail'], skills: { mining: 10 } },
    blocked: [
      { who: 'npc', text: 'Not yet. Get some iron out of the quarry first -- ten levels of it, and then we will talk about going deeper.' }
    ],
    reward: {
      points: 2,
      xp: { mining: 400, smithing: 150 },
      unlock: 'The way into the Cut is open. Coal, and whatever else is down there.'
    },
    stages: [
      {
        journal: 'Garrow Blackfen needs coal, and the only coal is in a mine nobody uses.',
        npc: 'garrow',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'You want to make steel. Everyone wants to make steel. Steel wants coal, and there is no coal in this quarry -- there never was.' },
          { who: 'npc', text: 'The coal is in the Cut, south of here. Was. The roof came in eight years back and nobody has been down since.' },
          { who: 'player', text: 'Nobody dug it out?' },
          { who: 'npc', text: 'Nobody wanted to. Two men were down there when it went and only the fall came back up.' },
          { who: 'npc', text: 'Bring me six iron. If you can pull six iron out of that quarry you have the arms to move a fall, and I will stop worrying about sending you.' }
        ]
      },
      {
        journal: 'Bring Garrow Blackfen 6 iron ore.',
        npc: 'garrow',
        goal: { type: 'give', items: [{ id: 'iron_ore', qty: 6 }] },
        waiting: [
          { who: 'npc', text: 'Six. Iron, not tin -- I will know, and so will the furnace.' }
        ],
        done: [
          { who: 'npc', text: 'Good. That is not luck, that is technique.' },
          { who: 'npc', text: 'The mouth of the Cut is south-west, past the well. Go and look at the fall before you touch it. I want to know how it sits.' }
        ]
      },
      {
        journal: 'Examine the collapsed entrance to the Cut, south-west past the well.',
        npc: 'garrow',
        goal: { type: 'inspect', x: 7, y: 26 },
        waiting: [
          { who: 'npc', text: 'South-west, past the well. You will know it when the ground turns to stone under you.' }
        ],
        done: [
          { who: 'player', text: 'The fall is loose. Not packed the way eight years of settling would pack it -- it would come apart with a pick and an afternoon.' },
          { who: 'player', text: 'The stone at the edges is cut, not broken. Someone squared this off after it came down.' },
          { who: 'player', text: 'And the draught coming through the gaps is cold, and it smells of salt.' }
        ]
      },
      {
        journal: 'Tell Garrow Blackfen what the fall looks like.',
        npc: 'garrow',
        goal: { type: 'talk' },
        done: [
          { who: 'player', text: 'It is loose, and the edges were squared after the collapse. Somebody finished the job by hand.' },
          { who: 'npc', text: '...Say that again.' },
          { who: 'player', text: 'Someone closed it deliberately. And there is a draught through it that smells of salt.' },
          { who: 'npc', text: 'There is no salt in that hill. There is no salt for sixty miles.' },
          { who: 'npc', text: 'Take my second pick and open it. I would rather know than keep not knowing, and I am too old to be the one who finds out.' },
          { who: 'npc', text: 'Mind yourself down there. Things have had eight years to move in.' }
        ],
        gives: [{ id: 'bronze_pickaxe', qty: 1 }]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Salt, in that hill. I have thought about it every day since and I have got no further with it.' }
    ]
  },

  // Quest 5. The first thread of the flood, and the first quest that is not
  // about acquiring anything: the reward is knowing something is wrong.
  //
  // Nothing here explains itself. A well uphill of the river has gone salt,
  // the water at the pier is dropping, and the one explanation anyone offers
  // does not survive being looked at. Deliberately no payoff -- the register
  // of the whole flood thread is still open, and every line below reads the
  // same whichever way it is eventually settled.
  {
    id: 'salt_in_the_well',
    name: 'Salt in the Well',
    requires: { quests: ['cold_hearth'] },
    blocked: [
      { who: 'npc', text: 'Get my hearth lit first. I cannot think about anything else while I am cold.' }
    ],
    reward: {
      points: 2,
      xp: { fishing: 80 },
      items: [{ id: 'coins', qty: 40 }],
      unlock: 'Nobody upriver is answering. Maren thinks that is the interesting part.'
    },
    stages: [
      {
        journal: 'Maren Ashfall says the village well has turned. She wants someone to look.',
        npc: 'maren',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'Sit down a moment. You have been up and down this road all week and I want to ask you something that is going to sound foolish.' },
          { who: 'npc', text: 'The well has gone salt. Not brackish -- salt, like the sea, and we are nowhere near the sea.' },
          { who: 'player', text: 'Could something have got into it?' },
          { who: 'npc', text: 'That is what Halder said. A dead thing down the shaft, he said, and told everyone to stop drawing from it and go to the river instead.' },
          { who: 'npc', text: 'Only the well sits above the river. Whatever is in the water should be going down to it, not up from it.' },
          { who: 'npc', text: 'Go and look for yourself. I would rather be told I am imagining it than keep thinking about it alone.' }
        ]
      },
      {
        journal: 'Look into the village well, south-west of the crossroads.',
        npc: 'maren',
        goal: { type: 'inspect', x: 21, y: 27 },
        waiting: [
          { who: 'npc', text: 'South-west of the crossroads, past the rats. You will smell it before you reach it.' }
        ],
        // Spoken by the player, at the well. Everything is observation; none
        // of it is conclusion.
        done: [
          { who: 'player', text: 'The stones around the rim are furred white. It comes away on a finger and it is salt, not lime.' },
          { who: 'player', text: 'The water is a long way down. Further than a well this old should have to reach.' },
          { who: 'player', text: 'There is no dead thing down there. There is no smell of one at all -- only cold, and salt, and something faintly like weed.' },
          { who: 'player', text: 'Halder told them to drink from the river instead. He must have looked down here to say that. So he knows there is nothing in it.' }
        ]
      },
      {
        journal: 'Ask Iselle Marrow at the pier whether the lake has done anything strange.',
        npc: 'iselle',
        goal: { type: 'talk' },
        done: [
          { who: 'player', text: 'The village well has gone salt. You said the water here keeps dropping.' },
          { who: 'npc', text: 'Third time this season. I have been keeping a mark on the third post, which everybody finds very funny.' },
          { who: 'npc', text: 'It is not funny. It goes down, it comes back a little short, and it goes down again. Whatever is doing it is patient.' },
          { who: 'player', text: 'And salt in a well above the river?' },
          { who: 'npc', text: '...Then it is not the river doing it. Go and tell Maren that, and tell her I said she was right to ask.' }
        ]
      },
      {
        journal: 'Tell Maren Ashfall what you found.',
        npc: 'maren',
        goal: { type: 'talk' },
        done: [
          { who: 'player', text: 'There is nothing down the well. The rim is crusted with salt and the water has dropped, and Iselle says the lake has been doing the same all season.' },
          { who: 'npc', text: 'Then Halder was not wrong by accident. You do not send a village to the river without looking down the well first.' },
          { who: 'player', text: 'So why say it?' },
          { who: 'npc', text: 'Because the true answer would have frightened them, or because it would have frightened him. I have known him forty years and I could not tell you which.' },
          { who: 'npc', text: 'He went upriver the day after. Nobody has had word since, and nobody seems to think that is worth remarking on but me.' },
          { who: 'npc', text: 'Take this and keep it to yourself for now. If the water drops again I will want someone who already knows why I am asking.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Still no word from upriver. Still salt on the stones.' }
    ]
  },

  // Quest 6. Teaches what a thing is WORTH, which is the one lesson a shop
  // cannot teach by itself -- a price list means nothing until you have sold
  // something and watched the number move. No gate: coins are useful from the
  // first minute, and the merchant is also the safety net for a player who
  // has lost a tool, so nothing should stand between them and the cart.
  {
    id: 'a_weight_off',
    name: 'A Weight Off',
    reward: {
      points: 1,
      items: [{ id: 'coins', qty: 60 }],
      unlock: "Corbin's cart is open for business. He buys as well as sells."
    },
    stages: [
      {
        journal: 'Corbin Vayle is overloaded and looking for a way to lighten his cart.',
        npc: 'corbin',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'Do not help me push. The last one who offered put a wheel through a ditch and then wanted paying for it.' },
          { who: 'npc', text: 'The trouble is weight. I am carrying stock nobody out here wants, and every pound of it is a pound I am dragging uphill.' },
          { who: 'player', text: 'What would you rather be carrying?' },
          { who: 'npc', text: 'Coins. Coins weigh nothing and everyone wants them. That is the entire trade, and it took me thirty years to learn it.' },
          { who: 'npc', text: 'Bring me eight logs. I will pay you properly for them, and you will see what I mean about weight.' }
        ]
      },
      {
        journal: 'Bring Corbin Vayle 8 logs. He pays for what he takes.',
        npc: 'corbin',
        goal: { type: 'give', items: [{ id: 'logs', qty: 8 }] },
        waiting: [
          { who: 'npc', text: 'Eight. And do not go buying them off me and selling them back -- I price them so that loses you money, which is rather the point.' }
        ],
        done: [
          { who: 'npc', text: 'There. You are lighter, I am heavier, and we both think we got the better of it. That is commerce.' },
          { who: 'npc', text: 'Here is what they are worth, and a little over for the walk.' },
          { who: 'npc', text: 'Come to me when you need a tool. Losing an axe out here is not the disaster people make of it -- it is thirty coins.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Buying or selling? Either suits me.' }
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
