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

import type { SkillId } from '../types.ts';

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
  | { readonly type: 'inspect'; readonly x: number; readonly y: number }
  /**
   * Kill `count` of an NPC while this stage is the active one.
   *
   * The tally starts at zero when the stage begins and is thrown away when it
   * ends, so a player who has already killed a hundred goblins still has to
   * kill these ones. Counting retroactively would let a quest complete itself
   * the moment it is accepted, which is worse than asking for the walk.
   */
  | { readonly type: 'kill'; readonly npcId: string; readonly count: number };

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

  // Quest 10. Teaches the third Woodcutting tier and, through it, respawn:
  // ironbark almost never falls, and when it does it is gone for a very long
  // time, so a grove is worked by rotating between trees rather than camping
  // one. Tobin gives it because he gave the first Woodcutting quest, and the
  // shape of this one is his opinion of what has changed since.
  {
    id: 'quiet_grove',
    name: 'The Quiet Grove',
    requires: { quests: ['green_timber'], skills: { woodcutting: 20 } },
    blocked: [
      { who: 'npc', text: 'Not with that arm. Twenty levels of woodcutting before I send you at ironbark, and I will know if you have fudged it.' }
    ],
    reward: {
      points: 2,
      xp: { woodcutting: 500, firemaking: 150 },
      unlock: 'The grove is open. Ironbark takes an age to come back -- work them in turn.'
    },
    stages: [
      {
        journal: 'Tobin Reeve wants back into a grove that has grown over.',
        npc: 'tobin',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'There is a grove south of here. Ironbark, the whole stand of it, and I have not been able to get at it in six years.' },
          { who: 'player', text: 'Why not?' },
          { who: 'npc', text: 'Thorn grew across the path and I got old. Those two happened at about the same speed and only one of them was reversible.' },
          { who: 'npc', text: 'Ironbark is not oak. You will swing at one for a quarter of an hour and get nothing, and then it will give, and then it is finished for the rest of the day.' },
          { who: 'npc', text: 'So you work them in turn. Five trees, five in rotation, and you never wait on any of them. That is the whole trick and nobody believes it until they have stood there.' },
          { who: 'npc', text: 'Bring me fifteen oak logs. Not for the wood -- I want to see you can keep going back to a tree that has nothing left to give yet.' }
        ]
      },
      {
        journal: 'Bring Tobin Reeve 15 oak logs. Oaks do not always fall, which is the point.',
        npc: 'tobin',
        goal: { type: 'give', items: [{ id: 'oak_logs', qty: 15 }] },
        waiting: [
          { who: 'npc', text: 'Fifteen. An oak stands more often than it falls, so you will be walking between them. Get used to it.' }
        ],
        done: [
          { who: 'npc', text: 'Fifteen, and you did not stand there sulking at one stump for an hour. Good.' },
          { who: 'npc', text: 'The thorn is south, where the road runs out. Take an axe to it and the grove is yours -- I have no more use for it and it should not go to waste.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Ironbark burns half the night, mind. It is worth the wait on both counts.' }
    ]
  },

  // Quest 8. The first quest that expects a fight, and it teaches the thing
  // that actually keeps people alive in one: food. Gated on Cooking 10 rather
  // than on any combat level, because the lesson is that you bring supper.
  {
    id: 'first_blood',
    name: 'First Blood on the Ridge',
    requires: { quests: ['cold_hearth'], skills: { cooking: 10 } },
    blocked: [
      { who: 'npc', text: 'Not yet. Learn to cook something first -- I have buried enough people who could swing and not eat.' }
    ],
    reward: {
      points: 2,
      xp: { attack: 250, strength: 250, vitality: 200 },
      items: [{ id: 'bronze_kiteshield', qty: 1 }],
      unlock: 'Hesk will keep training you as long as you keep coming back fed.'
    },
    stages: [
      {
        journal: 'Hesk Ardley trains people to fight, and has opinions about how.',
        npc: 'hesk',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'You are carrying a sword and standing like someone who has never used one. That is not an insult, it is a diagnosis.' },
          { who: 'npc', text: 'Goblins west of here. Kill four. That is the easy half.' },
          { who: 'npc', text: 'The hard half is this: eat when you are hurt, not when you are nearly dead. Everyone learns that eventually and most of them learn it too late.' },
          { who: 'player', text: 'Four goblins.' },
          { who: 'npc', text: 'Four goblins, and come back with the food you did not need. If you come back empty I will know you ate it all, and we will have a different conversation.' }
        ]
      },
      {
        journal: 'Kill 4 goblins, west of the crossroads.',
        npc: 'hesk',
        goal: { type: 'kill', npcId: 'goblin', count: 4 },
        waiting: [
          { who: 'npc', text: 'West, past the quarry. Four of them, and eat while you are doing it -- that is the half people skip.' }
        ],
        done: [
          { who: 'player', text: 'Four. And I ate during, not after.' },
          { who: 'npc', text: 'So you say. Show me what you have left.' }
        ]
      },
      {
        journal: 'Bring Hesk Ardley 3 cooked chickens, to prove you did not need them all.',
        npc: 'hesk',
        goal: { type: 'give', items: [{ id: 'cooked_chicken', qty: 3 }] },
        waiting: [
          { who: 'npc', text: 'Three cooked chickens, still in your pack. If you have none left you fought it too close, and next time there will not be a next time.' }
        ],
        done: [
          { who: 'npc', text: 'Still standing, and still carrying supper. That is the correct order of those two things.' },
          { who: 'npc', text: 'Take the shield. It is not a good one, but it is between you and the next mistake.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Eat early. That is all I have ever had to teach anybody.' }
    ]
  },

  // Quest 9. Archery's introduction, and Crafting's second use. The debt in
  // the title is the feathers: everything the player has killed so far has
  // been dropping them, and this is the quest that says what they were for.
  {
    id: 'debt_of_feathers',
    name: 'A Debt of Feathers',
    requires: { quests: ['first_blood'] },
    blocked: [
      { who: 'npc', text: 'Talk to Hesk first. I am not arming somebody who has not been hit yet.' }
    ],
    reward: {
      points: 2,
      xp: { archery: 300, crafting: 150 },
      items: [{ id: 'shortbow', qty: 1 }],
      unlock: 'A bow of your own, and the knowledge to keep it fed.'
    },
    stages: [
      {
        journal: 'Hesk Ardley thinks you should learn to fight from further away.',
        npc: 'hesk',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'You have been swinging at things that swing back. There is another way, and it involves being somewhere else when they arrive.' },
          { who: 'npc', text: 'A bow. And before you ask -- no, I will not simply hand you arrows. An archer who cannot make arrows is a man with an expensive stick.' },
          { who: 'npc', text: 'You have been stepping over feathers since the first chicken you killed. Every one of those was an arrow you did not make.' },
          { who: 'npc', text: 'Cut shafts from logs, feather them, and cap them with bronze. Bring me sixteen bronze arrows and the bow is yours.' }
        ]
      },
      {
        journal: 'Fletch 16 bronze arrows and bring them to Hesk. Shafts from logs, feathers from birds, heads from a bronze bar.',
        npc: 'hesk',
        goal: { type: 'give', items: [{ id: 'bronze_arrow', qty: 16 }] },
        waiting: [
          { who: 'npc', text: 'Logs into shafts, then shafts and feathers and a bar of bronze. Right-click the logs, it is not a secret.' }
        ],
        done: [
          { who: 'npc', text: 'Sixteen, and straight. You will lose every one of them and that is what they are for.' },
          { who: 'npc', text: 'The bow. Keep arrows in the slot beside your shield, and keep making more -- the day you run dry is the day something walks up to you.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Still making your own? Good. Bought arrows have never once been cheaper.' }
    ]
  },

  // Quest 12. The Wardens arc opens, and the register turns: up to here every
  // strange thing has had a mundane reading available. This is where one stops
  // being available. The error in the title is not the cartographer's -- his
  // measurements are correct and the land is wrong, and he knows it.
  {
    id: 'cartographers_error',
    name: "The Cartographer's Error",
    requires: { quests: ['deepcut'] },
    blocked: [
      { who: 'npc', text: 'You have not been down the Cut. Come back when you have, because I will need you to believe me and you will not until then.' }
    ],
    reward: {
      points: 3,
      xp: { foraging: 300, crafting: 200 },
      items: [{ id: 'sallows_chart', qty: 1 }],
      unlock: 'The reeds are cut back. The Sallows are open, and they are lower than they were.'
    },
    stages: [
      {
        journal: 'Alder Finch has surveyed the same ground twice and got two answers.',
        npc: 'alder',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'Do not touch the chain. I have measured with it four hundred times and I need it to keep being the same chain.' },
          { who: 'npc', text: 'I surveyed this valley eleven years ago. I surveyed it again in the spring. The two do not agree.' },
          { who: 'player', text: 'Everyone makes mistakes.' },
          { who: 'npc', text: 'Yes. And a mistake is wrong once. Mine is wrong by the same amount every time, in the same direction, and the amount is getting larger.' },
          { who: 'npc', text: 'The ground east of here is four feet lower than it was. Not eroded -- lower. The trees are the same height and they are standing in water that has nowhere to come from.' },
          { who: 'npc', text: 'I cannot get in to measure it. The reed has closed the way and I am sixty-one. Cut it back for me and take the chain -- I want the far side measured before I have to write this down.' }
        ],
        gives: [{ id: 'survey_chain', qty: 1 }]
      },
      {
        journal: 'Cut back the reeds south-east of the grove, at the low end of the road.',
        npc: 'alder',
        goal: { type: 'inspect', x: 32, y: 44 },
        waiting: [
          { who: 'npc', text: 'East. Past where the grove path turns. You will hear it before you see it -- reed does not rustle when there is no wind, and that reed does.' }
        ],
        done: [
          { who: 'player', text: 'The reed is dead and standing. All of it, upright, and none of it rotted -- it died and did not fall down.' },
          { who: 'player', text: 'It comes apart in the hand like ash. Behind it the ground drops away, and there is standing water in the hollows.' },
          { who: 'player', text: 'The water is not moving. It is not draining anywhere and nothing is running into it. It is simply sitting in the low places, and the low places are new.' },
          { who: 'player', text: 'It is salt. Of course it is salt.' }
        ]
      },
      {
        journal: 'Measure the Sallows with the chain, then take the reading to Alder Finch.',
        npc: 'alder',
        goal: { type: 'give', items: [{ id: 'survey_chain', qty: 1 }] },
        waiting: [
          { who: 'npc', text: 'Take it across and bring it back. I do not need a number from you -- I need the chain to have been there.' }
        ],
        done: [
          { who: 'player', text: 'Four feet, near enough. Lower than your old survey, across the whole fen.' },
          { who: 'npc', text: 'Not four. Four and a half now. It was four in the spring.' },
          { who: 'player', text: 'Then it is still going.' },
          { who: 'npc', text: 'It is still going. Land does not do this. Land subsides where something beneath it has been taken away, and nothing has been taken from under that fen -- I have the sections, there is nothing under it but clay for ninety feet.' },
          { who: 'npc', text: 'So either my chain is wrong, or the valley is being drawn down, and I have told you what I think of my chain.' },
          { who: 'npc', text: 'Take the corrected chart. I have marked what I measured and what I measured before, and I have not written a conclusion on it because I do not have one and I will not invent one.' },
          { who: 'npc', text: 'Show it to Maren Ashfall. She has been keeping her own list, and I would rather two fools compared notes than one wrote a report.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Still going down. I measure it on Thursdays now, which is a thing I never expected to say.' }
    ]
  },

  // Quest 11. Introduces Crafting, and does it through glass because glass is
  // the one material that needs a skill the player already has: ash only comes
  // from fires that have burnt out, which is why the gate is Firemaking rather
  // than anything to do with Crafting itself. Nobody can make glass without
  // having burnt something first.
  {
    id: 'glass_and_ash',
    name: 'Glass and Ash',
    requires: { skills: { firemaking: 20 } },
    blocked: [
      { who: 'npc', text: 'Come back when you have kept a fire going longer than an afternoon. I can tell by the hands.' }
    ],
    reward: {
      points: 2,
      xp: { crafting: 250, firemaking: 100 },
      items: [{ id: 'coins', qty: 80 }],
      unlock: 'Sand and ash make glass, and glass makes anything that has to hold something.'
    },
    stages: [
      {
        journal: 'Sella Quist works glass on the shore, and has run out of the makings.',
        npc: 'sella',
        goal: { type: 'talk' },
        done: [
          { who: 'npc', text: 'Mind the bench, it is hotter than it looks and so is everything on it.' },
          { who: 'npc', text: 'You want to know what glass is. Everyone does, and nobody believes it: sand, and ash, and enough heat to make them stop being either.' },
          { who: 'player', text: 'That is all?' },
          { who: 'npc', text: 'That is all. The sand is under your feet and the ash is whatever you burned last night. The difficulty was never the ingredients.' },
          { who: 'npc', text: 'Bring me four sand and four ash. Scoop the sand off the banks along the shore; for the ash, burn something and come back once it has gone out.' }
        ]
      },
      {
        journal: 'Bring Sella Quist 4 sand and 4 ash. Ash is left behind when a fire burns out.',
        npc: 'sella',
        goal: { type: 'give', items: [{ id: 'sand', qty: 4 }, { id: 'ash', qty: 4 }] },
        waiting: [
          { who: 'npc', text: 'Sand from the banks, ash from a dead fire. A fire you are still standing over is no use to me -- let it finish.' }
        ],
        done: [
          { who: 'npc', text: 'Good. Now watch, because I will only be slow about it once.' },
          { who: 'npc', text: 'Both into the furnace together. It comes out as a lump that is still deciding what it wants to be, and while it is deciding you can make it into anything.' },
          { who: 'npc', text: 'Vials, mostly. Everything worth carrying in this world is a liquid and every liquid needs something to be carried in.' }
        ]
      },
      {
        journal: 'Melt sand and ash into molten glass at the furnace, then work it into a vial. Bring the vial to Sella.',
        npc: 'sella',
        goal: { type: 'give', items: [{ id: 'glass_vial', qty: 1 }] },
        waiting: [
          { who: 'npc', text: 'The furnace west of the crossroads. Sand and ash for the melt, then the melt again for the vial.' }
        ],
        done: [
          { who: 'npc', text: 'Hm. Thin at the shoulder and it will crack if you look at it in winter. But it holds, and it is yours, and the first one always is.' },
          { who: 'npc', text: 'Keep at it. There is more than vials in glass, and I will show you when there is more than sand in this village.' }
        ]
      }
    ],
    afterwards: [
      { who: 'npc', text: 'Sand, ash, heat. Still the only three things I know.' }
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
