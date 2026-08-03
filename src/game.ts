// Game orchestration: world state, the tick pipeline, and input.
//
// TICK ORDER MATTERS, and it is the thing most likely to bite you later. The
// order below ensures that within a single tick:
//   1. intent resolves  (what does everyone want to do?)
//   2. movement happens (everyone commits to a tile)
//   3. combat resolves  (against the positions everyone just landed on)
//
// Resolve combat before movement and players hit things they already walked
// away from. Resolve intent after movement and targeting lags a tick behind,
// which makes combat feel sticky.

import type {
  EquipSlot, ItemStack, PlayerAction, Point, SkillId, StationKind, World
} from './types';
import type { GroundItem } from './systems/ground';
import { GameMap, generateMap } from './world/map';
import { GroundItems } from './systems/ground';
import { WorldObjects } from './systems/objects';
import { Player } from './entities/player';
import { Npc } from './entities/npc';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';
import { rollDrops } from './data/npcs';
import { getItem } from './data/items';
import {
  getGatherable, burnables, recipeFor,
  getBar, getSmithable, bars, smithablesFor,
  HAMMER_SPEED, SMITH_XP_PER_BAR
} from './data/resources';
import type { BarDef, SmithDef } from './data/resources';
import { rollGather, rollBurn } from './systems/skilling';
import { SKILL_LIST } from './systems/skills';
import { Quests } from './systems/quests';
import { getQuest, questsForNpc } from './data/quests';
import type { QuestDef, QuestItem, QuestStage } from './data/quests';
import { Dialogue } from './ui/dialogue';
import { INVENTORY_CAPACITY } from './systems/inventory';
import * as XP from './data/xp';
import * as pathfind from './world/pathfind';
import * as combat from './systems/combat';
import * as iso from './world/iso';
import { lerp, tileDist } from './core/util';
import { loop } from './core/loop';
import { audio } from './audio/audio';
import type { SaveStore } from './persist/storage';
import { SAVE_VERSION, type SaveData, encodeSaveCode, decodeSaveCode, parseSave } from './persist/save';

const AUTOSAVE_TICKS = 50; // every 30 seconds

/**
 * The right-click verb for each gathering skill. Data rather than a `switch`,
 * so adding Foraging is a row here and a row in `resources.ts`.
 */
const GATHER_VERBS: Readonly<Partial<Record<SkillId, string>>> = {
  woodcutting: 'Chop down',
  mining: 'Mine',
  fishing: 'Fish at'
};

/** Keys whose default action scrolls the page the game is embedded in. */
const SCROLL_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End'
]);

/**
 * True when the key is going into a text field, where those same keys mean
 * caret movement. Only the save-code textarea qualifies today, but suppressing
 * Home and End inside it would be maddening.
 */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}

/** Skills that changed id in version 2. */
const RENAMED_SKILLS: Readonly<Record<string, SkillId>> = {
  hitpoints: 'vitality',
  ranged: 'archery'
};

/**
 * Tools that did not exist in version 1.
 *
 * A returning player's saved inventory REPLACES the one the constructor deals
 * out, so without this they load in with no pickaxe and no hammer. Neither
 * drops from anything and neither can be bought, which would leave the entire
 * mining and smithing loop permanently unreachable on that save -- the one
 * thing a migration must never do.
 */
const V2_TOOLS: readonly string[] = ['bronze_pickaxe', 'hammer'];

/** Ticks between bars at a furnace, and between items at an anvil. */
const SMELT_TICKS = 3;
const SMITH_TICKS = 3;

export class Game implements World {
  readonly map: GameMap = generateMap();
  readonly ground = new GroundItems();
  readonly objects = new WorldObjects();
  readonly player: Player;
  readonly npcs: Npc[] = [];
  readonly quests = new Quests();

  private readonly renderer: Renderer;
  private readonly ui: UI;
  private readonly dialogue = new Dialogue();
  private readonly store: SaveStore;
  private autosaveCounter = 0;

  /**
   * The save arrives already read, rather than being fetched here.
   *
   * IndexedDB is asynchronous and a constructor cannot await, so the read has
   * to happen before the game exists. Doing it any other way means the world
   * boots at starting position and the player's real state lands on top of it
   * some frames later -- visible as a teleport, and a race with any input in
   * between.
   */
  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement,
              store: SaveStore, saved: string | null) {
    this.store = store;
    // Start on the crossroads at the centre of the map.
    this.player = new Player(24, 24);
    this.player.inventory.add('bronze_scimitar', 1);
    this.player.inventory.add('wooden_shield', 1);
    this.player.inventory.add('bronze_axe', 1);
    this.player.inventory.add('tinderbox', 1);
    this.player.inventory.add('bronze_pickaxe', 1);
    this.player.inventory.add('hammer', 1);
    this.player.inventory.add('cooked_chicken', 3);

    for (const spawn of this.map.spawns) {
      this.npcs.push(new Npc(spawn.npcId, spawn.x, spawn.y));
    }

    this.renderer = new Renderer(canvas, minimap);
    this.ui = new UI(this);

    if (saved !== null) this.load(saved);
    this.player.attackSpeed = this.player.inventory.attackSpeed();

    this.bindInput(canvas);
    this.greet();

    if (store.kind === 'memory') {
      this.ui.message(
        'This browser is blocking storage, so progress will NOT be saved.', 'bad'
      );
      this.ui.message(
        'Use the save button to copy a save code before you close the tab.', 'bad'
      );
    }
  }

  private greet(): void {
    this.ui.message('Welcome to the game.', 'sys');
    this.ui.message('Left-click the ground to walk, or an enemy to attack.', 'sys');
    this.ui.message('Chickens are north-west, goblins south-west, guards south-east.', 'sys');
    this.ui.message('Click a tree to chop it. Right-click logs to light a fire, ' +
                    'then click the fire to cook.', 'sys');
    this.ui.message('The quarry and smithy are due west: mine ore, smelt it at ' +
                    'the furnace, then hammer bars at the anvil.', 'sys');
    this.ui.message('Maren Ashfall is sitting just east of here and looks like ' +
                    'she wants a word. Click her to talk.', 'sys');
  }

  // ----------------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------------
  isOccupied(x: number, y: number, exclude?: unknown): boolean {
    if (this.player !== exclude && this.player.isAlive() &&
        this.player.x === x && this.player.y === y) {
      return true;
    }
    return this.npcs.some(
      (n) => n !== exclude && !n.dead && n.x === x && n.y === y
    );
  }

  /**
   * Hit-test against the DRAWN sprite rather than the tile, because sprites
   * stand well above their own tile and clicking the head should work.
   */
  private pickMob(screenX: number, screenY: number, alpha: number): Npc | null {
    let best: Npc | null = null;
    let bestDepth = -Infinity;

    for (const m of this.npcs) {
      if (m.dead) continue;

      const px = lerp(m.prevX, m.x, alpha);
      const py = lerp(m.prevY, m.y, alpha);
      const s = this.renderer.worldToScreen(px, py);
      const size = m.def.size;
      const halfW = 16 * size;

      if (screenX >= s.x - halfW && screenX <= s.x + halfW &&
          screenY >= s.y - 46 * size && screenY <= s.y + 6) {
        const depth = iso.depth(px, py);
        if (depth > bestDepth) { bestDepth = depth; best = m; }
      }
    }

    return best;
  }

  // ----------------------------------------------------------------------
  // Tick
  // ----------------------------------------------------------------------
  tick(): void {
    if (this.player.dead) {
      this.handlePlayerDeath();
      return;
    }

    // 1. Intent
    this.resolvePlayerAction();
    for (const npc of this.npcs) npc.think(this);

    // 2. Movement
    this.player.stepMovement(this);
    for (const npc of this.npcs) {
      if (!npc.dead) npc.stepMovement(this);
    }

    // 3. Combat
    this.resolveCombat(this.player);
    for (const npc of this.npcs) {
      if (!npc.dead) this.resolveCombat(npc);
    }

    // 4. Upkeep
    this.player.inCombatTicks++;
    for (const npc of this.npcs) npc.inCombatTicks++;
    this.ground.tick();
    this.objects.tick();
    this.player.regenTick();

    if (++this.autosaveCounter >= AUTOSAVE_TICKS) {
      this.autosaveCounter = 0;
      this.save();
    }
  }

  private resolvePlayerAction(): void {
    const p = this.player;
    const action = p.action;
    if (!action) return;

    if (action.type === 'attack') {
      const t = action.target;
      if (!t.isAlive()) { p.clearAction(); return; }

      p.target = t;

      if (p.distanceTo(t) <= 1) {
        p.clearPath();
        p.faceTowards(t.x, t.y);
      } else if (!p.path.length) {
        // The target moved; walk to it again.
        p.setPath(pathfind.findAdjacent(this.map, p.x, p.y, t.x, t.y));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }

    } else if (action.type === 'pickup') {
      const item = action.item;
      if (!this.ground.items.includes(item)) { p.clearAction(); return; }

      if (p.x === item.x && p.y === item.y) {
        this.pickUp(item);
        p.clearAction();
      } else if (!p.path.length) {
        p.setPath(pathfind.find(this.map, p.x, p.y, item.x, item.y));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }

    } else if (action.type === 'gather') {
      this.resolveGather(action.x, action.y);

    } else if (action.type === 'cook') {
      this.resolveCook(action.x, action.y);

    } else if (action.type === 'use-station') {
      this.resolveStation(action.x, action.y, action.station);

    } else if (action.type === 'smelt') {
      this.resolveSmelt(action.x, action.y, action.barId);

    } else if (action.type === 'smith') {
      this.resolveSmith(action.x, action.y, action.productId);

    } else {
      this.resolveTalk(action.target);
    }
  }

  /**
   * Walk into interaction range of a tile, pathing around whatever is in the
   * way. Returns true once the player is standing next to it; every skilling
   * action begins with this, so it is worth having in one place.
   *
   * The action is cleared and a message shown if the tile cannot be reached.
   */
  private approach(tx: number, ty: number): boolean {
    const p = this.player;

    if (tileDist(p.x, p.y, tx, ty) > 1) {
      if (!p.path.length) {
        p.setPath(pathfind.findAdjacent(this.map, p.x, p.y, tx, ty));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }
      return false;
    }

    p.clearPath();
    p.faceTowards(tx, ty);
    return true;
  }

  /**
   * One tick of gathering -- chopping, mining or fishing, which are the same
   * action with different data behind them.
   *
   * Like combat, this is an independent roll every tick rather than a progress
   * bar filling up, which is why a tree sometimes falls immediately and
   * sometimes takes ten seconds. Nothing below names a skill, a tool or an
   * item; everything specific comes from the `GatherDef`.
   */
  private resolveGather(tx: number, ty: number): void {
    const p = this.player;

    const scenery = this.map.sceneryAt(tx, ty);
    const def = scenery?.resource ? getGatherable(scenery.resource) : undefined;
    if (!def) { p.clearAction(); return; }

    const tileIndex = this.map.idx(tx, ty);
    if (this.objects.isDepleted(tileIndex)) {
      this.ui.message(def.depleted);
      p.clearAction();
      return;
    }

    if (def.tool && !this.hasToolTagged(def.tool)) {
      this.ui.message(def.noTool, 'bad');
      p.clearAction();
      return;
    }

    if (!this.approach(tx, ty)) return;

    const level = p.skills.level(def.skill);
    if (level < def.level) {
      const skill = SKILL_LIST.find((s) => s.id === def.skill)?.name ?? def.skill;
      this.ui.message(
        `You need a ${skill} level of ${def.level} to use this.`, 'bad'
      );
      p.clearAction();
      return;
    }

    if (!rollGather(def.low, def.high, level)) return; // missed; roll again next tick

    if (p.inventory.isFull()) {
      this.ui.message(def.full, 'bad');
      p.clearAction();
      return;
    }

    p.inventory.add(def.outputId, 1);
    audio.play(def.cue);
    this.announceXp(def.skill, def.xp);
    this.ui.message(
      def.success.replace('{item}', getItem(def.outputId)?.name.toLowerCase() ?? 'something')
    );
    this.ui.dirty = true;

    if (Math.random() < def.depleteChance) {
      this.objects.deplete(tileIndex, def.respawnTicks);
      p.clearAction();
    }
  }

  /** One tick of cooking on a fire. */
  private resolveCook(tx: number, ty: number): void {
    const p = this.player;

    const fire = this.objects.fireAt(tx, ty);
    if (!fire) {
      this.ui.message('The fire has gone out.');
      p.clearAction();
      return;
    }

    // Stand next to the fire (or on its tile) before cooking.
    if (!this.approach(tx, ty)) return;

    // Find the next raw item that has a recipe.
    const index = p.inventory.slots.findIndex(
      (s) => s !== null && recipeFor(s.id) !== undefined
    );
    if (index === -1) {
      p.clearAction();
      return;
    }

    const slot = p.inventory.slots[index]!;
    const recipe = recipeFor(slot.id)!;
    const level = p.skills.level('cooking');

    if (level < recipe.level) {
      this.ui.message(
        `You need a Cooking level of ${recipe.level} to cook this.`, 'bad'
      );
      p.clearAction();
      return;
    }

    p.inventory.removeSlot(index, 1);

    if (rollBurn(level, recipe.stopBurnLevel)) {
      p.inventory.add(recipe.burntId, 1);
      this.ui.message('You accidentally burn the food.', 'bad');
    } else {
      p.inventory.add(recipe.cookedId, 1);
      audio.play('cook');
      this.announceXp('cooking', recipe.xp);
      this.ui.message(`You cook the ${getItem(recipe.rawId)?.name.toLowerCase() ?? 'food'}.`);
    }

    this.ui.dirty = true;
  }

  /** Walk to a furnace or anvil, then hand over to its interface. */
  private resolveStation(tx: number, ty: number, station: StationKind): void {
    const p = this.player;

    if (this.map.sceneryAt(tx, ty)?.kind !== station) {
      p.clearAction();
      return;
    }

    if (!this.approach(tx, ty)) return;

    // Arriving is the whole action; the menu decides what happens next.
    p.clearAction();

    const at = this.renderer.canvasToClient(this.renderer.worldToScreen(tx, ty));
    if (station === 'furnace') this.openSmeltMenu(at, tx, ty);
    else this.openSmithMenu(at, tx, ty);
  }

  /** One item of smelting, repeating until the ore runs out. */
  private resolveSmelt(tx: number, ty: number, barId: string): void {
    const p = this.player;

    const bar = getBar(barId);
    if (!bar || this.map.sceneryAt(tx, ty)?.kind !== 'furnace') {
      p.clearAction();
      return;
    }

    if (!this.approach(tx, ty)) return;

    const level = p.skills.level('smithing');
    if (level < bar.level) {
      this.ui.message(
        `You need a Smithing level of ${bar.level} to smelt a ${bar.name.toLowerCase()}.`,
        'bad'
      );
      p.clearAction();
      return;
    }

    if (!this.hasIngredients(bar.ingredients)) {
      this.ui.message(
        `You need ${this.ingredientText(bar.ingredients)} to smelt a ${bar.name.toLowerCase()}.`
      );
      p.clearAction();
      return;
    }

    if (p.actionDelay > 0) { p.actionDelay--; return; }
    p.actionDelay = SMELT_TICKS;

    // The ore is consumed whether or not the pour succeeds. Taking at least
    // one item out first guarantees the bar has somewhere to go.
    for (const ing of bar.ingredients) this.consume(ing.id, ing.qty);

    if (Math.random() >= bar.successChance) {
      this.ui.message(
        'The ore is too impure and you fail to refine it.', 'bad'
      );
    } else {
      p.inventory.add(bar.id, 1);
      audio.play('smelt');
      this.announceXp('smithing', bar.xp);
      this.ui.message(`You retrieve a ${bar.name.toLowerCase()} from the furnace.`);
    }

    this.ui.dirty = true;
  }

  /** One item of smithing at an anvil, repeating until the bars run out. */
  private resolveSmith(tx: number, ty: number, productId: string): void {
    const p = this.player;

    const def = getSmithable(productId);
    const product = def ? getItem(def.id) : undefined;
    if (!def || !product || this.map.sceneryAt(tx, ty)?.kind !== 'anvil') {
      p.clearAction();
      return;
    }

    if (!this.hasToolTagged('hammer')) {
      this.ui.message('You need a hammer to work the metal with.', 'bad');
      p.clearAction();
      return;
    }

    if (!this.approach(tx, ty)) return;

    const level = p.skills.level('smithing');
    if (level < def.level) {
      this.ui.message(
        `You need a Smithing level of ${def.level} to make a ${product.name.toLowerCase()}.`,
        'bad'
      );
      p.clearAction();
      return;
    }

    if (p.inventory.count(def.barId) < def.bars) {
      const barName = getItem(def.barId)?.name.toLowerCase() ?? 'bars';
      this.ui.message(`You need ${def.bars} ${barName} to make that.`);
      p.clearAction();
      return;
    }

    if (p.actionDelay > 0) { p.actionDelay--; return; }
    p.actionDelay = this.smithTicks();

    this.consume(def.barId, def.bars);
    p.inventory.add(def.id, 1);
    audio.play('smith');
    this.announceXp('smithing', SMITH_XP_PER_BAR * def.bars);
    this.ui.message(`You hammer the metal into a ${product.name.toLowerCase()}.`);
    this.ui.dirty = true;
  }

  // ----------------------------------------------------------------------
  // Quests
  // ----------------------------------------------------------------------
  /**
   * Walk to an NPC and hold a conversation.
   *
   * All the quest logic hangs off this one entry point, because talking is the
   * only way a quest ever moves. Nothing advances on a timer or behind the
   * player's back -- if the journal changed, it is because somebody said so.
   */
  private resolveTalk(npc: Npc): void {
    const p = this.player;

    if (npc.dead || !npc.def.talkable) { p.clearAction(); return; }
    if (this.dialogue.isOpen()) return;

    if (p.distanceTo(npc) > 1) {
      if (!p.path.length) {
        p.setPath(pathfind.findAdjacent(this.map, p.x, p.y, npc.x, npc.y));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }
      return;
    }

    p.clearPath();
    p.faceTowards(npc.x, npc.y);
    npc.faceTowards(p.x, p.y);
    p.clearAction();

    this.converse(npc);
  }

  /** Pick what this NPC has to say right now, and say it. */
  private converse(npc: Npc): void {
    const id = npc.def.id;

    // A quest already under way at this NPC takes precedence over starting
    // another, so a character can never be mid-errand and be handed a second.
    for (const def of questsForNpc(id)) {
      const stage = this.quests.activeStage(def);
      if (stage && stage.npc === id) {
        this.playStage(npc, def, stage);
        return;
      }
    }

    for (const def of questsForNpc(id)) {
      if (this.quests.isStarted(def.id)) continue;
      if (def.stages[0]?.npc !== id) continue;

      if (!this.questRequirementsMet(def)) {
        this.dialogue.open(npc.name, def.blocked ?? [
          { who: 'npc', text: 'Not just now. Come back another time.' }
        ]);
        return;
      }

      this.quests.setStage(def.id, 1);
      const first = def.stages[0]!;
      this.playStage(npc, def, first);
      return;
    }

    // Nothing outstanding: say the after-the-fact line, or shrug.
    const finished = questsForNpc(id).find((d) => this.quests.isComplete(d));
    this.dialogue.open(npc.name, finished?.afterwards ?? [
      { who: 'npc', text: 'Good day to you.' }
    ]);
  }

  /**
   * Say the right half of a stage: the nudge if its goal is unmet, otherwise
   * the pay-off, and then move the quest on once the last line is read.
   */
  private playStage(npc: Npc, def: QuestDef, stage: QuestStage): void {
    if (!this.questGoalMet(npc, stage)) {
      this.dialogue.open(npc.name, stage.waiting ?? [
        { who: 'npc', text: 'Not yet. Come back when it is done.' }
      ]);
      return;
    }

    // Items change hands as the stage resolves, not as the dialogue ends --
    // otherwise a player could be shown the thanks and keep the goods by
    // walking away mid-sentence.
    if (stage.goal.type === 'give') {
      for (const need of stage.goal.items) this.consume(need.id, need.qty);
      this.ui.dirty = true;
    }

    this.quests.advance(def);

    this.dialogue.open(npc.name, stage.done, () => {
      this.onStageAdvanced(def, stage);
    });
  }

  /** Fires once the dialogue that completed a stage has been read to the end. */
  private onStageAdvanced(def: QuestDef, stage: QuestStage): void {
    // Maren undertakes to keep her fire alight, so it stops burning down.
    if (stage.goal.type === 'fire-near') {
      const fire = this.fireNearStageNpc(stage);
      if (fire) fire.permanent = true;
    }

    // Handed over before the next stage is set, so a stage that supplies the
    // tool for the one after it cannot leave the player unable to continue.
    for (const item of stage.gives ?? []) this.giveQuestItem(item);

    if (this.quests.isComplete(def)) this.completeQuest(def);
    this.ui.dirty = true;
  }

  private questGoalMet(npc: Npc, stage: QuestStage): boolean {
    const goal = stage.goal;

    if (goal.type === 'talk') return true;
    if (goal.type === 'give') {
      return goal.items.every((i) => this.player.inventory.count(i.id) >= i.qty);
    }
    return this.objects.fireNear(npc.x, npc.y) !== null;
  }

  private fireNearStageNpc(stage: QuestStage) {
    const npc = this.npcs.find((n) => n.def.id === stage.npc);
    return npc ? this.objects.fireNear(npc.x, npc.y) : null;
  }

  private questRequirementsMet(def: QuestDef): boolean {
    const req = def.requires;
    if (!req) return true;

    for (const id of req.quests ?? []) {
      const other = getQuest(id);
      if (!other || !this.quests.isComplete(other)) return false;
    }

    for (const [skill, level] of Object.entries(req.skills ?? {})) {
      if (this.player.skills.level(skill as SkillId) < (level ?? 0)) return false;
    }

    return true;
  }

  private completeQuest(def: QuestDef): void {
    const reward = def.reward;

    this.ui.message(`Quest complete: ${def.name}!`, 'levelup');
    this.ui.message(
      `You have ${this.quests.points()} quest point` +
      `${this.quests.points() === 1 ? '' : 's'}.`, 'good'
    );

    for (const [skill, amount] of Object.entries(reward.xp ?? {})) {
      if (amount) this.announceXp(skill as SkillId, amount);
    }

    for (const item of reward.items ?? []) this.giveQuestItem(item);

    this.ui.message(reward.unlock, 'good');
    audio.play('quest');
    this.ui.dirty = true;
  }

  /** A reward the player has no room for goes at their feet, never nowhere. */
  private giveQuestItem(item: QuestItem): void {
    const name = getItem(item.id)?.name ?? item.id;

    if (this.player.inventory.add(item.id, item.qty)) {
      this.ui.message(`You are given: ${name}.`, 'good');
    } else {
      this.ground.drop(item.id, item.qty, this.player.x, this.player.y);
      this.ui.message(
        `Your pack is full, so your ${name.toLowerCase()} is at your feet.`, 'bad'
      );
    }
  }

  /**
   * Reapply the world changes that finished quests are responsible for.
   *
   * Fires are not saved -- they are transient world state -- so Maren's would
   * be missing after a reload even though the quest that lit it is complete.
   * Anything a quest promised to leave behind has to be re-established here.
   */
  private restoreQuestUnlocks(): void {
    const coldHearth = getQuest('cold_hearth');
    if (!coldHearth || !this.quests.isComplete(coldHearth)) return;

    const maren = this.npcs.find((n) => n.def.id === 'maren');
    if (!maren || this.objects.fireNear(maren.x, maren.y)) return;

    const spot = this.freeTileBeside(maren.x, maren.y);
    if (spot) this.objects.addFire(spot.x, spot.y, 0, true);
  }

  private freeTileBeside(x: number, y: number): Point | null {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const tx = x + dx;
      const ty = y + dy;
      if (this.map.isWalkable(tx, ty) && !this.objects.fireAt(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
    return null;
  }

  // ----------------------------------------------------------------------
  // Crafting helpers
  // ----------------------------------------------------------------------
  /** Anvil pace, set by the best hammer to hand. */
  private smithTicks(): number {
    let ticks = SMITH_TICKS;
    for (const [id, speed] of Object.entries(HAMMER_SPEED)) {
      if (this.carries(id)) ticks = Math.min(ticks, speed);
    }
    return ticks;
  }

  /** True if this exact item is carried or worn. */
  private carries(id: string): boolean {
    const inv = this.player.inventory;
    return inv.count(id) > 0 ||
      Object.values(inv.equipment).some((eq) => eq?.id === id);
  }

  /**
   * True if anything carried or worn has this tag.
   *
   * Tools are matched this way rather than by id so the engine never names an
   * item: a steel axe added to `items.ts` tomorrow chops trees the moment it
   * has the `axe` tag, with no change here.
   */
  private hasToolTagged(tag: string): boolean {
    const inv = this.player.inventory;
    const tagged = (id: string | undefined): boolean =>
      id !== undefined && (getItem(id)?.tags.includes(tag) ?? false);

    return inv.slots.some((s) => tagged(s?.id)) ||
      Object.values(inv.equipment).some((eq) => tagged(eq?.id));
  }

  private hasIngredients(list: readonly { id: string; qty: number }[]): boolean {
    return list.every((i) => this.player.inventory.count(i.id) >= i.qty);
  }

  /** Remove `qty` of an item, spanning slots for non-stackables. */
  private consume(id: string, qty: number): void {
    const inv = this.player.inventory;
    let left = qty;

    for (let i = 0; i < inv.slots.length && left > 0; i++) {
      const slot = inv.slots[i];
      if (!slot || slot.id !== id) continue;
      const taken = inv.removeSlot(i, left);
      left -= taken?.qty ?? 0;
    }
  }

  private ingredientText(list: readonly { id: string; qty: number }[]): string {
    return list
      .map((i) => `${i.qty} ${getItem(i.id)?.name.toLowerCase() ?? i.id}`)
      .join(' and ');
  }

  // ----------------------------------------------------------------------
  // Station interfaces
  // ----------------------------------------------------------------------
  private openSmeltMenu(at: Point, tx: number, ty: number): void {
    const p = this.player;

    const opts = bars.map((bar: BarDef) => ({
      verb: 'Smelt',
      noun: `${bar.name} (${this.ingredientText(bar.ingredients)})`,
      action: () => {
        p.clearPath();
        p.setAction({ type: 'smelt', x: tx, y: ty, barId: bar.id });
      }
    }));

    this.ui.openMenu(at.x, at.y, 'Smelting', opts);
  }

  /**
   * The anvil offers whatever the bars in your inventory can become. Holding
   * more than one metal asks which first, rather than listing eighteen items.
   */
  private openSmithMenu(at: Point, tx: number, ty: number): void {
    const held = bars.filter((b) => this.player.inventory.count(b.id) > 0);

    if (!held.length) {
      this.ui.message('You need a bar of metal to work with.');
      return;
    }

    if (held.length === 1) {
      this.openSmithProductMenu(at, tx, ty, held[0]!);
      return;
    }

    this.ui.openMenu(at.x, at.y, 'Smithing', held.map((bar) => ({
      verb: 'Work',
      noun: bar.name,
      action: () => this.openSmithProductMenu(at, tx, ty, bar)
    })));
  }

  private openSmithProductMenu(at: Point, tx: number, ty: number, bar: BarDef): void {
    const p = this.player;

    const opts = smithablesFor(bar.id).map((def: SmithDef) => {
      const name = getItem(def.id)?.name ?? def.id;
      const locked = p.skills.level('smithing') < def.level;

      return {
        verb: 'Smith',
        noun: locked
          ? `${name} (requires level ${def.level})`
          : `${name} (${def.bars} ${def.bars === 1 ? 'bar' : 'bars'})`,
        action: () => {
          p.clearPath();
          p.setAction({ type: 'smith', x: tx, y: ty, productId: def.id });
        }
      };
    });

    this.ui.openMenu(at.x, at.y, bar.name, opts);
  }

  /** Award experience and announce any level-ups in the chat log. */
  private announceXp(skill: SkillId, amount: number): void {
    if (this.player.skills.addXp(skill, amount) > 0) {
      audio.play('levelup');
      this.ui.message(
        `Congratulations, you just advanced a ${skill} level! ` +
        `You are now level ${this.player.skills.level(skill)}.`,
        'levelup'
      );
      this.ui.dirty = true;
    }
  }

  /** Firemaking: light logs from the inventory, creating a fire underfoot. */
  lightLogs(index: number): void {
    const p = this.player;
    const slot = p.inventory.slots[index];
    if (!slot) return;

    const burnable = burnables[slot.id];
    if (!burnable) return;

    if (p.inventory.count('tinderbox') === 0) {
      this.ui.message('You need a tinderbox to light a fire.', 'bad');
      return;
    }

    const level = p.skills.level('firemaking');
    if (level < burnable.level) {
      this.ui.message(
        `You need a Firemaking level of ${burnable.level} to light these logs.`, 'bad'
      );
      return;
    }

    if (this.objects.fireAt(p.x, p.y)) {
      this.ui.message('There is already a fire here.');
      return;
    }

    p.clearAction();
    p.clearPath();
    p.inventory.removeSlot(index, 1);
    this.objects.addFire(p.x, p.y, burnable.burnTicks);
    audio.play('fire');
    this.announceXp('firemaking', burnable.xp);
    this.ui.message('The fire catches and the logs begin to burn.', 'good');
    this.ui.dirty = true;
  }

  private resolveCombat(mob: Player | Npc): void {
    if (mob.attackCooldown > 0) mob.attackCooldown--;

    const target = mob.target;
    if (!target || !target.isAlive()) {
      mob.target = null;
      return;
    }

    if (mob.distanceTo(target) > 1) return;
    if (mob.attackCooldown > 0) return;

    mob.faceTowards(target.x, target.y);
    mob.attackCooldown = mob.attackSpeed;
    mob.inCombatTicks = 0;

    const result = combat.resolve(mob, target);
    target.addHitsplat(result.damage);
    target.damage(result.damage);

    // Two cues, because who is being hit is the thing a player needs to hear
    // without looking. A miss is a zero-damage hit and stays silent.
    if (result.damage > 0) audio.play(target instanceof Player ? 'hurt' : 'hit');

    if (mob instanceof Player) {
      const levelUps = combat.awardXp(mob, result.damage);
      for (const skill of levelUps) {
        this.ui.message(
          `Congratulations, you just advanced a ${skill} level! ` +
          `You are now level ${mob.skills.level(skill)}.`,
          'levelup'
        );
      }
      if (levelUps.length) this.ui.dirty = true;

    } else if (target instanceof Player && !target.target && target.isAlive()) {
      // Auto-retaliate: getting hit while idle makes you fight back.
      target.target = mob;
      target.setAction({ type: 'attack', target: mob });
    }

    if (!target.isAlive()) {
      if (target instanceof Npc) this.killNpc(target, mob);
      else target.dead = true;
    }
  }

  private killNpc(npc: Npc, killer: Player | Npc): void {
    for (const drop of rollDrops(npc.def)) {
      this.ground.drop(drop.id, drop.qty, npc.x, npc.y);
    }

    if (killer instanceof Player) {
      this.ui.message(`You defeat the ${npc.name}.`, 'good');
      killer.clearAction();
    }

    npc.die();

    // Nobody should keep swinging at a corpse.
    if (this.player.target === npc) this.player.target = null;
    for (const other of this.npcs) {
      if (other.target === npc) other.target = null;
    }
  }

  private handlePlayerDeath(): void {
    const p = this.player;
    audio.play('die');
    audio.play('die');
    this.ui.message('Oh dear, you are dead!', 'bad');

    // Drop everything except equipment -- a light version of RuneScape's death
    // mechanic. Swap in the keep-3-items rule when you are ready.
    let dropped = 0;
    for (let i = 0; i < p.inventory.slots.length; i++) {
      const slot = p.inventory.slots[i];
      if (!slot) continue;
      this.ground.drop(slot.id, slot.qty, p.x, p.y);
      p.inventory.slots[i] = null;
      dropped++;
    }
    if (dropped) this.ui.message('Your items were dropped where you died.', 'bad');

    for (const npc of this.npcs) {
      if (npc.target === p) npc.target = null;
    }

    p.respawn();
    this.ui.dirty = true;
  }

  private pickUp(item: GroundItem): void {
    const def = getItem(item.id);
    if (!def) return;

    if (!this.player.inventory.add(item.id, item.qty)) {
      this.ui.message("You don't have enough inventory space.", 'bad');
      return;
    }

    this.ground.remove(item);
    audio.play('pickup');
    const prefix = def.stackable && item.qty > 1 ? `${item.qty} x ` : '';
    this.ui.message(`You pick up ${prefix}${def.name}.`);
    this.ui.dirty = true;
  }

  // ----------------------------------------------------------------------
  // Item actions, called from the UI
  // ----------------------------------------------------------------------
  defaultItemAction(index: number): void {
    const slot = this.player.inventory.slots[index];
    if (!slot) return;

    const def = getItem(slot.id);
    if (!def) return;

    if (def.slot) this.equipItem(index);
    else if (def.heals > 0) this.eatItem(index);
    else this.ui.message(def.examine);
  }

  equipItem(index: number): void {
    // Read the slot before equipping; afterwards the item has moved.
    const stack = this.player.inventory.slots[index];
    const worn = stack ? getItem(stack.id)?.slot !== 'weapon' : false;

    const result = this.player.inventory.equip(index);
    if (!result.ok) return;

    this.player.attackSpeed = this.player.inventory.attackSpeed();
    this.ui.message(`You ${worn ? 'wear' : 'wield'} the ${result.name}.`);
    this.ui.dirty = true;
  }

  unequipItem(slotName: EquipSlot): void {
    const result = this.player.inventory.unequip(slotName);

    if (!result.ok) {
      if (result.reason === 'inventory-full') {
        this.ui.message("You don't have enough inventory space.", 'bad');
      }
      return;
    }

    this.player.attackSpeed = this.player.inventory.attackSpeed();
    this.ui.message(`You remove the ${result.name}.`);
    this.ui.dirty = true;
  }

  eatItem(index: number): void {
    const slot = this.player.inventory.slots[index];
    if (!slot) return;

    const def = getItem(slot.id);
    if (!def) return;

    if (!def.heals) { this.ui.message(def.examine); return; }

    if (this.player.hp >= this.player.maxHp) {
      this.ui.message('You have no need to eat that right now.');
      return;
    }

    this.player.inventory.removeSlot(index, 1);
    this.player.heal(def.heals);
    audio.play('eat');
    this.ui.message(`You eat the ${def.name}. It heals some health.`);
    this.ui.dirty = true;
  }

  dropItem(index: number): void {
    const taken = this.player.inventory.removeSlot(index);
    if (!taken) return;

    this.ground.drop(taken.id, taken.qty, this.player.x, this.player.y);
    audio.play('drop');
    this.ui.message(`You drop the ${getItem(taken.id)?.name ?? taken.id}.`);
    this.ui.dirty = true;
  }

  // ----------------------------------------------------------------------
  // Input
  // ----------------------------------------------------------------------
  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      this.renderer.hoverTile = this.renderer.screenToWorldTile(x, y);
      this.renderer.hoverMob = this.pickMob(x, y, loop.alpha);
      canvas.style.cursor = this.renderer.hoverMob ? 'pointer' : 'default';
    });

    canvas.addEventListener('mouseleave', () => {
      this.renderer.hoverTile = null;
      this.renderer.hoverMob = null;
    });

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      this.handleClick(e.clientX - r.left, e.clientY - r.top);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      this.handleRightClick(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
    });

    window.addEventListener('keydown', (e) => {
      // Swallow anything that scrolls the host page. On itch.io the game runs
      // in an iframe partway down a listing, so an arrow key or Page Down
      // scrolls the shop out from under it -- the game appears to vanish
      // mid-fight. Done before the dialogue check because it holds whether or
      // not the key means anything to the game.
      if (SCROLL_KEYS.has(e.code) && !isTyping(e.target)) e.preventDefault();

      if (this.dialogue.isOpen()) return;

      if (e.code === 'Space') {
        this.player.running = !this.player.running;
        this.ui.message(`Run mode ${this.player.running ? 'enabled' : 'disabled'}.`);
      } else if (e.key >= '1' && e.key <= '5') {
        const tabs = ['inventory', 'equipment', 'skills', 'combat', 'quests'] as const;
        const tab = tabs[Number(e.key) - 1];
        if (tab) this.ui.setTab(tab);
      }
    });

    window.addEventListener('resize', () => this.renderer.resize());
  }

  private handleClick(sx: number, sy: number): void {
    const p = this.player;
    if (p.dead || this.dialogue.isOpen()) return;

    const mob = this.pickMob(sx, sy, loop.alpha);
    if (mob) {
      p.clearPath();

      if (mob.def.talkable) {
        p.setAction({ type: 'talk', target: mob });
        this.renderer.setClickMarker(mob.x, mob.y, 'move');
      } else if (mob.def.attackable) {
        p.setAction({ type: 'attack', target: mob });
        p.target = mob;
        this.renderer.setClickMarker(mob.x, mob.y, 'attack');
        this.ui.message(`You attack the ${mob.name}.`);
      }
      return;
    }

    const tile = this.renderer.screenToWorldTile(sx, sy);
    if (!this.map.inBounds(tile.x, tile.y)) return;

    // A lit fire is a cooking station.
    if (this.objects.fireAt(tile.x, tile.y)) {
      p.clearPath();
      p.setAction({ type: 'cook', x: tile.x, y: tile.y });
      this.renderer.setClickMarker(tile.x, tile.y, 'move');
      return;
    }

    // Interactive scenery: trees, ore veins, and the smithy stations.
    const scenery = this.map.sceneryAt(tile.x, tile.y);
    const spent = this.objects.isDepleted(this.map.idx(tile.x, tile.y));

    // Anything with a resource is gathered the same way, whatever it looks like.
    if (scenery?.resource && !spent) {
      p.clearPath();
      p.setAction({ type: 'gather', x: tile.x, y: tile.y });
      this.renderer.setClickMarker(tile.x, tile.y, 'move');
      return;
    }

    if (scenery?.kind === 'furnace' || scenery?.kind === 'anvil') {
      p.clearPath();
      p.setAction({ type: 'use-station', x: tile.x, y: tile.y, station: scenery.kind });
      this.renderer.setClickMarker(tile.x, tile.y, 'move');
      return;
    }

    // Ground items take priority over plain walking.
    const items = this.ground.at(tile.x, tile.y);
    const top = items[items.length - 1];
    if (top) {
      p.clearAction();
      p.setAction({ type: 'pickup', item: top });
      p.setPath(pathfind.find(this.map, p.x, p.y, tile.x, tile.y));
      this.renderer.setClickMarker(tile.x, tile.y, 'move');
      return;
    }

    if (!this.map.isWalkable(tile.x, tile.y)) {
      // Clicking a wall walks as close as possible, like RuneScape does.
      const near = pathfind.findAdjacent(this.map, p.x, p.y, tile.x, tile.y);
      if (near.length) {
        p.clearAction();
        p.setPath(near);
        this.renderer.setClickMarker(tile.x, tile.y, 'move');
      }
      return;
    }

    p.clearAction();
    p.setPath(pathfind.find(this.map, p.x, p.y, tile.x, tile.y));
    this.renderer.setClickMarker(tile.x, tile.y, 'move');
  }

  private handleRightClick(sx: number, sy: number, clientX: number, clientY: number): void {
    const p = this.player;
    if (this.dialogue.isOpen()) return;
    const opts: { verb: string; noun: string; action: () => void }[] = [];

    const mob = this.pickMob(sx, sy, loop.alpha);
    if (mob) {
      if (mob.def.talkable) {
        opts.push({
          verb: 'Talk to',
          noun: mob.name,
          action: () => {
            p.clearPath();
            p.setAction({ type: 'talk', target: mob });
            this.renderer.setClickMarker(mob.x, mob.y, 'move');
          }
        });
      }

      if (mob.def.attackable) {
        opts.push({
          verb: 'Attack',
          noun: mob.displayName,
          action: () => {
            p.clearPath();
            const action: PlayerAction = { type: 'attack', target: mob };
            p.setAction(action);
            p.target = mob;
            this.renderer.setClickMarker(mob.x, mob.y, 'attack');
          }
        });
      }

      opts.push({
        verb: 'Examine',
        noun: mob.name,
        action: () => {
          if (!mob.def.attackable) {
            this.ui.message(`${mob.name}. They look like they have something to say.`);
            return;
          }
          const acc = combat.previewAccuracy(p, mob);
          this.ui.message(
            `It's a ${mob.name.toLowerCase()}. Combat level ${mob.def.level}, ` +
            `${mob.maxHp} health. Your accuracy: ${Math.round(acc * 100)}%.`
          );
        }
      });
    }

    const tile = this.renderer.screenToWorldTile(sx, sy);
    if (this.map.inBounds(tile.x, tile.y)) {
      if (this.objects.fireAt(tile.x, tile.y)) {
        opts.push({
          verb: 'Cook on', noun: 'Fire',
          action: () => {
            p.clearPath();
            p.setAction({ type: 'cook', x: tile.x, y: tile.y });
          }
        });
      }

      const scenery = this.map.sceneryAt(tile.x, tile.y);
      if (scenery?.resource) {
        const def = getGatherable(scenery.resource);
        const spent = this.objects.isDepleted(this.map.idx(tile.x, tile.y));

        if (def) {
          // The verb belongs to the resource, not to the engine, so a new
          // gathering skill does not need a new arm here.
          const verb = GATHER_VERBS[def.skill] ?? 'Use';
          const skill = SKILL_LIST.find((s) => s.id === def.skill)?.name ?? def.skill;

          if (!spent) {
            opts.push({
              verb, noun: def.name,
              action: () => {
                p.clearPath();
                p.setAction({ type: 'gather', x: tile.x, y: tile.y });
              }
            });
          }
          opts.push({
            verb: 'Examine', noun: def.name,
            action: () => {
              this.ui.message(spent
                ? def.depleted
                : `${def.name}. Requires ${skill} ${def.level}.`);
            }
          });
        }
      }

      if (scenery?.kind === 'furnace' || scenery?.kind === 'anvil') {
        const station = scenery.kind;
        opts.push({
          verb: station === 'furnace' ? 'Smelt at' : 'Smith at',
          noun: station === 'furnace' ? 'Furnace' : 'Anvil',
          action: () => {
            p.clearPath();
            p.setAction({ type: 'use-station', x: tile.x, y: tile.y, station });
          }
        });
        opts.push({
          verb: 'Examine',
          noun: station === 'furnace' ? 'Furnace' : 'Anvil',
          action: () => {
            this.ui.message(station === 'furnace'
              ? 'A furnace hot enough to smelt ore into bars.'
              : 'A sturdy anvil. Bring bars and a hammer.');
          }
        });
      }

      for (const it of this.ground.at(tile.x, tile.y)) {
        const def = getItem(it.id);
        if (!def) continue;
        opts.push({
          verb: 'Take',
          noun: def.name,
          action: () => {
            p.clearAction();
            p.setAction({ type: 'pickup', item: it });
            p.setPath(pathfind.find(this.map, p.x, p.y, it.x, it.y));
          }
        });
      }

      if (this.map.isWalkable(tile.x, tile.y)) {
        opts.push({
          verb: 'Walk here',
          noun: '',
          action: () => {
            p.clearAction();
            p.setPath(pathfind.find(this.map, p.x, p.y, tile.x, tile.y));
            this.renderer.setClickMarker(tile.x, tile.y, 'move');
          }
        });
      }
    }

    if (opts.length) this.ui.openMenu(clientX, clientY, 'Choose Option', opts);
  }

  // ----------------------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------------------
  /** Serialise the live state. Shared by autosave and by manual export. */
  private serialise(): string {
    const p = this.player;
    const data: SaveData = {
      v: SAVE_VERSION,
      x: p.x, y: p.y,
      hp: p.hp,
      xp: p.skills.xp,
      style: p.attackStyle,
      running: p.running,
      slots: p.inventory.slots,
      equipment: p.inventory.equipment,
      quests: this.quests.stages
    };
    return JSON.stringify(data);
  }

  /**
   * Write the current state out.
   *
   * Deliberately not async, and deliberately not awaited: this is called from
   * the tick loop, which is synchronous and must stay that way. The snapshot
   * is taken synchronously so it cannot tear against a later tick, and only
   * the write itself is left to settle on its own.
   */
  save(): void {
    let raw: string;
    try {
      raw = this.serialise();
    } catch (err) {
      console.warn('Save failed:', err);
      return;
    }

    void this.store.write(raw).catch((err: unknown) => {
      // Private browsing, a revoked permission, or a full quota. Not worth
      // interrupting play over -- the export button remains the way out.
      console.warn('Save failed:', err);
    });
  }

  load(raw: string): void {
    try {
      const data = parseSave(raw);
      if (!data) throw new Error('not a save');

      const p = this.player;

      const xp = this.migrateXp(data.xp ?? {}, data.v);

      // Merge rather than replace. A save written before a skill existed has
      // no key for it, and assigning the object wholesale would leave that
      // skill permanently unable to gain experience (addXp ignores unknown
      // ids). Merging keeps old saves working every time a skill is added.
      for (const s of SKILL_LIST) {
        const value = xp[s.id];
        if (typeof value === 'number' && Number.isFinite(value)) {
          p.skills.xp[s.id] = value;
        }
      }

      this.quests.restore(data.quests);
      this.restoreQuestUnlocks();

      if (data.slots) p.inventory.slots = this.migrateSlots(data.slots);
      if (data.equipment) p.inventory.equipment = data.equipment as typeof p.inventory.equipment;
      if (data.style) p.attackStyle = data.style as typeof p.attackStyle;
      if (typeof data.running === 'boolean') p.running = data.running;

      p.maxHp = p.skills.level('vitality');
      p.hp = Math.min(data.hp ?? p.maxHp, p.maxHp);

      if (typeof data.x === 'number' && typeof data.y === 'number' &&
          this.map.isWalkable(data.x, data.y)) {
        p.x = p.prevX = data.x;
        p.y = p.prevY = data.y;
      }

      this.ui.message('Welcome back. Your progress was restored.', 'sys');

      if (data.v < SAVE_VERSION) {
        this.ui.message(
          'Your save was made in an older version and has been converted.', 'sys'
        );
        this.grantNewTools();
        this.save();
      }
    } catch (err) {
      console.warn('Save file was corrupt, starting fresh:', err);
    }
  }

  /**
   * Bring a saved experience table up to the current version.
   *
   * The hard part is the curve change. A stored total is meaningless without
   * the curve it was earned on -- 13,363 experience was level 30 under the old
   * 99-cap table and would silently become something else under the new one.
   * So the conversion goes through LEVELS, which are what the player actually
   * earned, and re-derives the total from the current table.
   */
  private migrateXp(
    saved: Record<string, number>, version: number
  ): Record<string, number> {
    if (version >= SAVE_VERSION) return saved;

    const out: Record<string, number> = {};

    for (const [oldId, value] of Object.entries(saved)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      // Prayer has no successor skill; its experience is dropped.
      const id = RENAMED_SKILLS[oldId] ?? oldId;
      if (!SKILL_LIST.some((s) => s.id === id)) continue;

      const level = Math.min(XP.legacyLevelFor(value), XP.MAX_LEVEL);
      out[id] = XP.forLevel(level);
    }

    return out;
  }

  /**
   * Hand a migrated character the tools its save predates, so that loading an
   * old game is never worse than starting a new one.
   *
   * There is always room for them: a version-1 inventory held at most 28
   * items and capacity is now 30, so migrateSlots() leaves two free slots at
   * minimum. The ground-drop fallback covers hand-edited saves, not anything
   * the game itself can produce.
   */
  private grantNewTools(): void {
    const p = this.player;
    const granted: string[] = [];

    for (const id of V2_TOOLS) {
      if (this.carries(id)) continue;

      const name = getItem(id)?.name ?? id;

      if (p.inventory.add(id, 1)) {
        granted.push(name);
      } else {
        this.ground.drop(id, 1, p.x, p.y);
        this.ui.message(
          `Your pack is full, so your ${name.toLowerCase()} is at your feet.`, 'bad'
        );
      }
    }

    if (granted.length) {
      this.ui.message(`You have been given: ${granted.join(' and ')}.`, 'good');
      this.ui.dirty = true;
    }
  }

  /**
   * Fit a saved inventory to the current capacity. Without this, a save made
   * when the inventory was smaller leaves trailing holes that read as
   * `undefined` rather than `null` -- and `firstFree()` looks for `null`, so
   * every one of those slots would be invisible and unusable.
   */
  private migrateSlots(saved: unknown): (ItemStack | null)[] {
    const list = Array.isArray(saved) ? (saved as (ItemStack | null)[]) : [];
    return Array.from(
      { length: INVENTORY_CAPACITY },
      (_, i) => list[i] ?? null
    );
  }

  async reset(): Promise<void> {
    await this.store.clear();
    location.reload();
  }

  // ----------------------------------------------------------------------
  // Manual export / import
  // ----------------------------------------------------------------------

  /**
   * A save code the player can copy somewhere safe.
   *
   * This is the escape hatch for every storage failure at once: blocked
   * cookies, private browsing, an itch.io iframe that partitions the origin,
   * or simply moving to another machine. It reads live state rather than
   * whatever is on disk, so a code is never staler than the moment it was
   * asked for.
   */
  exportSave(): string {
    return encodeSaveCode(this.serialise());
  }

  /**
   * Take a pasted save code, replacing the current character with it.
   *
   * Committed to storage before the reload rather than applied in place:
   * loading a save over a running world would have to unwind every piece of
   * live state -- current action, path, combat target, open dialogue -- and
   * booting from scratch is the same code path a returning player already
   * takes, so it is the one that stays tested.
   *
   * Throws with a player-readable message if the code is not usable.
   */
  async importSave(code: string): Promise<void> {
    const raw = decodeSaveCode(code);
    await this.store.write(raw);

    // On the memory tier that write does not outlive the page, so reloading
    // would boot from an empty store and throw the import away -- silently
    // failing in exactly the situation import exists to rescue. Those players
    // get the in-place path instead.
    if (this.store.kind === 'memory') {
      this.applyInPlace(raw);
      return;
    }

    location.reload();
  }

  /**
   * Swap the running character for a saved one without a page reload.
   *
   * Only used when storage cannot survive a refresh. Everything cleared here
   * refers to the character being replaced: an action mid-swing, a path to
   * somewhere the new character never was, and anything already fighting the
   * old one. This mirrors respawn()'s reset for the same reason.
   */
  private applyInPlace(raw: string): void {
    const p = this.player;

    p.clearPath();
    p.clearAction();
    p.attackCooldown = 0;
    p.hitsplats.length = 0;
    for (const npc of this.npcs) {
      if (npc.target === p) npc.target = null;
    }
    this.dialogue.abandon();

    this.load(raw);

    p.maxHp = p.skills.level('vitality');
    p.hp = Math.min(p.hp, p.maxHp);
    p.attackSpeed = p.inventory.attackSpeed();
    this.ui.dirty = true;
  }

  // ----------------------------------------------------------------------
  // Boot
  // ----------------------------------------------------------------------
  start(): void {
    this.renderer.resize();

    loop.start(
      () => this.tick(),
      (alpha, dt) => {
        this.renderer.render(this, alpha, dt);
        this.ui.update();
      }
    );
  }
}
