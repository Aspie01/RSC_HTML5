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
} from './types.ts';
import type { GroundItem } from './systems/ground.ts';
import { GameMap, generateMap, CUT_ENTRANCE, GROVE_ENTRANCE, SALLOWS_ENTRANCE, ROAD_ENTRANCE, INTERIOR_FLOOR, VAULT_SEAL, VAULT_FLOOR } from './world/map.ts';
import { GroundItems } from './systems/ground.ts';
import { WorldObjects } from './systems/objects.ts';
import { Player } from './entities/player.ts';
import { Npc } from './entities/npc.ts';
import { Renderer } from './render/renderer.ts';
import { UI } from './ui/ui.ts';
import { rollDrops } from './data/npcs.ts';
import { getItem } from './data/items.ts';
import {
  getGatherable, burnables, recipeFor,
  getBar, getSmithable, bars, smithablesFor,
  HAMMER_SPEED, SMITH_XP_PER_BAR
} from './data/resources.ts';
import type { BarDef, SmithDef, FletchDef } from './data/resources.ts';
import { rollGather, rollBurn } from './systems/skilling.ts';
import { SKILL_LIST } from './systems/skills.ts';
import { Quests } from './systems/quests.ts';
import { Stats } from './systems/stats.ts';
import { Shops } from './systems/shop.ts';
import type { TradeResult } from './systems/shop.ts';
import { shopForNpc } from './data/shops.ts';
import type { ShopDef } from './data/shops.ts';
import { getQuest, questsForNpc, quests } from './data/quests.ts';
import { combinationFor } from './data/combinations.ts';
import { INSPECT_TEXT, inspectable } from './data/inspect.ts';
import { transitionAt } from './data/transitions.ts';
import type { TransitionDef } from './data/transitions.ts';
import type { QuestDef, QuestItem, QuestStage } from './data/quests.ts';
import { Dialogue } from './ui/dialogue.ts';
import { INVENTORY_CAPACITY } from './systems/inventory.ts';
import * as XP from './data/xp.ts';
import * as pathfind from './world/pathfind.ts';
import * as combat from './systems/combat.ts';
import * as iso from './world/iso.ts';
import { lerp, tileDist, withArticle, plural } from './core/util.ts';
import { loop } from './core/loop.ts';
import { rng } from './core/rng.ts';
import { audio } from './audio/audio.ts';
import type { SaveStore } from './persist/storage.ts';
import { SAVE_VERSION, type SaveData, encodeSaveCode, decodeSaveCode, parseSave } from './persist/save.ts';

const AUTOSAVE_TICKS = 50; // every 30 seconds

/**
 * Ticks to wait for somebody to step out of the way before rerouting.
 *
 * Long enough that two people crossing in a doorway sort themselves out
 * without either recalculating, short enough that walking into a stationary
 * NPC costs about a second rather than the rest of the session.
 */
const BLOCKED_GRACE_TICKS = 3;

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
/**
 * Which counter each gathering skill bumps.
 *
 * A map rather than a switch, because there is one gather resolver for all
 * four skills and a switch there would be the thing rule 3 forbids: engine
 * code that has to be edited when a skill is added.
 */
const GATHER_STAT: Partial<Record<SkillId, string>> = {
  woodcutting: 'felled',
  mining: 'mined',
  fishing: 'caught',
  foraging: 'foraged'
};

const SMELT_TICKS = 3;
const SMITH_TICKS = 3;

export class Game implements World {
  readonly map: GameMap = generateMap();
  readonly ground = new GroundItems();
  readonly objects = new WorldObjects();
  readonly player: Player;
  readonly npcs: Npc[] = [];
  readonly quests = new Quests();
  readonly shops = new Shops();
  readonly stats = new Stats();

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

    this.stats.ticks++;

    // 1. Intent
    this.resolvePlayerAction();
    for (const npc of this.npcs) npc.think(this);

    // 2. Movement
    // Counted as tiles, not as ticks-in-which-you-moved: running covers two
    // tiles in one tick, so the naive version under-reports by half exactly
    // when the player is doing the most walking.
    const wasAt = { x: this.player.x, y: this.player.y };
    this.player.stepMovement(this);
    const moved = tileDist(wasAt.x, wasAt.y, this.player.x, this.player.y);
    if (moved > 0) this.stats.bump('steps', moved);
    this.unstickPlayer();
    this.applyHazard();
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
    // A dead fire leaves ash, which is half of what glass is made from. This
    // is Firemaking's outbound arrow into Crafting: burning logs stops being
    // only a means to cook and becomes a source of a material.
    for (const spot of this.objects.tick()) {
      this.ground.drop('ash', 1, spot.x, spot.y);
    }
    this.shops.tick();
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

      // Stop as soon as the weapon can reach, not when the tile is adjacent.
      // With a bow that is seven tiles out, which is the entire advantage the
      // skill buys: the right to start the fight before it starts on you.
      if (p.distanceTo(t) <= p.attackRange()) {
        p.clearPath();
        p.faceTowards(t.x, t.y);
      } else if (!p.path.length) {
        // The target moved; walk to it again.
        p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, t.x, t.y, this.occupiedByMob, true));
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
        p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, item.x, item.y, this.occupiedByMob, false));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }

    } else if (action.type === 'gather') {
      this.resolveGather(action.x, action.y);

    } else if (action.type === 'cook') {
      this.resolveCook(action.x, action.y);

    } else if (action.type === 'inspect') {
      this.resolveInspect(action.x, action.y);

    } else if (action.type === 'use-station') {
      this.resolveStation(action.x, action.y, action.station);

    } else if (action.type === 'smelt') {
      this.resolveSmelt(action.x, action.y, action.barId);

    } else if (action.type === 'smith') {
      this.resolveSmith(action.x, action.y, action.productId);

    } else if (action.type === 'talk') {
      this.resolveTalk(action.target);

    } else {
      // Exhaustiveness. This used to be a bare `else` that assumed anything
      // unmatched was a talk and read `.target` off it, which meant a new
      // action variant with no branch here failed as a crash inside
      // resolveTalk rather than as a compile error. Now it does not compile.
      const unreachable: never = action;
      void unreachable;
    }
  }

  /**
   * Bleed health for standing somewhere that hurts.
   *
   * Applied after movement, so a tile crossed in a single tick still costs --
   * the road is priced by how far you walk through it, not by where you stop.
   * Dying here is a real outcome: it is why the quest that opens it says to
   * bring food, and why it is the last thing in the phase.
   */
  private applyHazard(): void {
    const p = this.player;
    if (p.dead) return;

    const hazard = this.map.terrainInfo(p.x, p.y).hazard;
    if (!hazard) { this.hazardWarned = false; return; }

    if (!this.hazardWarned) {
      this.ui.message('The water is bitterly cold. You cannot stay in it long.', 'bad');
      this.hazardWarned = true;
    }

    p.addHitsplat(hazard);
    p.damage(hazard);
    audio.play('hurt');

    if (!p.isAlive()) this.handlePlayerDeath();
    this.ui.dirty = true;
  }

  /** So the cold-water warning is said once per wade, not once per tick. */
  private hazardWarned = false;

  /** Tiles that are walkable but currently have somebody standing on them. */
  private readonly occupiedByMob = (x: number, y: number): boolean =>
    this.isOccupied(x, y, this.player);

  /**
   * Recover from a path the player cannot walk.
   *
   * Waiting a tick or two for someone to step aside is right; waiting forever
   * is not, and a quest giver never moves. After a short grace period the
   * route is recomputed around whoever is in the way, and if there genuinely
   * is no way through the player is told rather than left standing there with
   * a valid path and no explanation.
   */
  private unstickPlayer(): void {
    const p = this.player;
    if (p.blockedTicks < BLOCKED_GRACE_TICKS || !p.path.length) return;

    const goal = p.path[p.path.length - 1]!;
    const route = pathfind.findAvoiding(
      this.map, p.x, p.y, goal.x, goal.y, this.occupiedByMob, false
    );

    p.blockedTicks = 0;

    // A route that still runs through the blocker is no better than the one we
    // already had, so treat matching length as failure and stop.
    if (route.length && route.length !== p.path.length) {
      p.setPath(route);
      return;
    }

    p.clearPath();
    p.clearAction();
    this.ui.message("You can't get past.");
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
        p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, tx, ty, this.occupiedByMob, true));
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
    this.stats.bump(GATHER_STAT[def.skill] ?? 'gathered');
    this.announceXp(def.skill, def.xp);
    this.ui.message(
      def.success.replace('{item}', getItem(def.outputId)?.name.toLowerCase() ?? 'something')
    );

    // The gem. Rolled after the output is in the pack, so a full inventory
    // costs you the gem rather than the ore -- losing the thing you were
    // working for would read as a bug.
    if (def.bonus && rng.chance(def.bonus.chance)) {
      const gem = getItem(def.bonus.id);
      if (gem && p.inventory.add(def.bonus.id, 1)) {
        audio.play('levelup');
        // "You find: Drowned opal." rather than an article -- the same shape
        // quest gifts use, and it dodges a/an entirely.
        this.ui.message(`You find: ${gem.name}.`, 'levelup');
        this.stats.bump('gems');
      }
    }

    this.ui.dirty = true;

    if (rng.chance(def.depleteChance)) {
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
      this.stats.bump('burnt');
      this.ui.message('You accidentally burn the food.', 'bad');
    } else {
      p.inventory.add(recipe.cookedId, 1);
      this.stats.bump('cooked');
      audio.play('cook');
      this.announceXp('cooking', recipe.xp);
      this.ui.message(`You cook the ${getItem(recipe.rawId)?.name.toLowerCase() ?? 'food'}.`);
    }

    this.ui.dirty = true;
  }

  /**
   * Look closely at something, and let any quest waiting on it move.
   *
   * The discovery happens here rather than in a report to an NPC afterwards,
   * which is what separates investigating from fetching. The lines are the
   * player's own, so the dialogue opens with no speaker.
   */
  private resolveInspect(tx: number, ty: number): void {
    const p = this.player;

    const scenery = this.map.sceneryAt(tx, ty);
    if (!scenery) { p.clearAction(); return; }
    if (!this.approach(tx, ty)) return;

    p.clearAction();
    if (this.dialogue.isOpen()) return;

    for (const def of quests) {
      const stage = this.quests.activeStage(def);
      if (stage?.goal.type !== 'inspect') continue;
      if (stage.goal.x !== tx || stage.goal.y !== ty) continue;

      this.dialogue.open('', stage.done, () => {
        this.quests.advance(def);
        this.onStageAdvanced(def, stage);
      });
      return;
    }

    // A passage is checked after quests, so a stage that fires at the top of a
    // stair still gets to speak before the stair takes the player away.
    const passage = transitionAt(tx, ty);
    if (passage) { this.usePassage(passage); return; }

    this.ui.message(INSPECT_TEXT[scenery.kind] ?? 'You see nothing unusual.');
  }

  /**
   * Take a passage to somewhere else on the grid.
   *
   * The map has no levels, so "down" is a seam rather than a floor. Everything
   * mid-flight is dropped for the same reason an imported save clears it: a
   * path, a target or a queued action all refer to a place the player is no
   * longer standing in.
   */
  private usePassage(passage: TransitionDef): void {
    const p = this.player;

    if (passage.quest) {
      const q = getQuest(passage.quest);
      if (!q || !this.quests.isComplete(q)) {
        this.ui.message(passage.refused ?? 'You cannot go that way yet.');
        return;
      }
    }

    p.clearPath();
    p.clearAction();
    p.target = null;
    for (const npc of this.npcs) {
      if (npc.target === p) npc.target = null;
    }

    p.x = p.prevX = passage.to.x;
    p.y = p.prevY = passage.to.y;

    // The warning belongs to the wade, and the player has just left it.
    this.hazardWarned = false;

    audio.play('fire');
    this.ui.message(passage.message, 'sys');
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

    // The menu already filters these out; the resolver checks again because an
    // action can outlive the menu that created it.
    const bar = getBar(barId);
    if (!bar || !this.recipeKnown(bar) || this.map.sceneryAt(tx, ty)?.kind !== 'furnace') {
      p.clearAction();
      return;
    }

    if (!this.approach(tx, ty)) return;

    const level = p.skills.level(bar.skill);
    if (level < bar.level) {
      const skill = SKILL_LIST.find((s) => s.id === bar.skill)?.name ?? bar.skill;
      this.ui.message(
        `You need a ${skill} level of ${bar.level} to make a ${bar.name.toLowerCase()}.`,
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

    if (!rng.chance(bar.successChance)) {
      this.ui.message(
        'The ore is too impure and you fail to refine it.', 'bad'
      );
    } else {
      p.inventory.add(bar.id, 1);
      this.stats.bump('smelted');
      audio.play('smelt');
      this.announceXp(bar.skill, bar.xp);
      this.ui.message(`You retrieve a ${bar.name.toLowerCase()} from the furnace.`);
    }

    this.ui.dirty = true;
  }

  /** One item of smithing at an anvil, repeating until the bars run out. */
  private resolveSmith(tx: number, ty: number, productId: string): void {
    const p = this.player;

    const def = getSmithable(productId);
    const product = def ? getItem(def.id) : undefined;
    if (!def || !product || !this.recipeKnown(def) ||
        this.map.sceneryAt(tx, ty)?.kind !== 'anvil') {
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
    this.stats.bump('smithed');
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
        p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, npc.x, npc.y, this.occupiedByMob, true));
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

    // A shopkeeper with nothing left to say opens the shop instead. Checked
    // after quests so a merchant can still be a quest giver, and the errand
    // always comes before the counter.
    const shop = shopForNpc(id);
    if (shop) {
      const finished = questsForNpc(id).find((d) => this.quests.isComplete(d));
      this.dialogue.open(npc.name, finished?.afterwards ?? [
        { who: 'npc', text: 'Have a look. Everything on the cart is for sale.' }
      ], () => this.openShop(shop));
      return;
    }

    // Nothing outstanding: say the after-the-fact line, or shrug.
    const finished = questsForNpc(id).find((d) => this.quests.isComplete(d));
    this.dialogue.open(npc.name, finished?.afterwards ?? [
      { who: 'npc', text: 'Good day to you.' }
    ]);
  }

  // ----------------------------------------------------------------------
  // Shops
  // ----------------------------------------------------------------------

  /**
   * Set by the shop window at boot. The game announces that a shop should be
   * shown; it does not know what showing one involves, which is what keeps the
   * trading rules testable without a DOM.
   */
  onShopOpen: ((shop: ShopDef) => void) | null = null;

  private openShop(shop: ShopDef): void {
    this.onShopOpen?.(shop);
  }

  buyFromShop(shop: ShopDef, itemId: string): TradeResult {
    const result = this.shops.buy(shop, itemId, this.player.inventory);
    if (result.ok) {
      audio.play('pickup');
      this.ui.dirty = true;
    } else {
      audio.play('deny');
    }
    return result;
  }

  sellToShop(shop: ShopDef, itemId: string): TradeResult {
    const result = this.shops.sell(shop, itemId, this.player.inventory);
    if (result.ok) {
      audio.play('drop');
      this.ui.dirty = true;
    } else {
      audio.play('deny');
    }
    return result;
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

    // The reeds come down when they are cut, not when the report is filed:
    // the stage after this one sends the player into the fen to measure it,
    // and it has to be walkable by then.
    if (def.id === 'cartographers_error' && stage.goal.type === 'inspect') {
      this.openTheSallows();
    }

    // Same shape at the road head: the reeds come down when they are cut, and
    // the stage straight after asks the player to walk the causeway. Matched on
    // the tile as well as the type, because this quest has two inspect stages
    // and only the first one is a gate.
    if (def.id === 'sunken_road' && stage.goal.type === 'inspect' &&
        stage.goal.x === ROAD_ENTRANCE.x && stage.goal.y === ROAD_ENTRANCE.y) {
      this.openTheRoad();
    }

    // The Ninth is called before the stage that asks you to kill it, not
    // after -- a kill goal against something that does not exist yet is a
    // quest that cannot be finished.
    if (def.id === 'nine_names' && this.quests.stageOf(def.id) >= 4) {
      this.summonTheNinth();
    }

    // The fall moves when Maren says it may, which is the stage before the
    // kill -- the same reason as the Ninth. A kill goal against something
    // still behind a wall is a quest that cannot be finished.
    if (def.id === 'the_last_warden' && this.quests.stageOf(def.id) >= 4) {
      this.openTheVault();
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
    // An inspect stage never ends at an NPC, so talking to one can only ever
    // produce the nudge. It is the looking that advances it.
    if (goal.type === 'inspect') return false;
    if (goal.type === 'kill') {
      const def = quests.find((q) => this.quests.activeStage(q) === stage);
      return def ? this.quests.killsFor(def.id) >= goal.count : false;
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

    if (req.anySkills) {
      const { count, level } = req.anySkills;
      const at = SKILL_LIST.filter((s) => this.player.skills.level(s.id) >= level).length;
      if (at < count) return false;
    }

    if (req.points !== undefined && this.quests.points() < req.points) return false;

    return true;
  }

  private completeQuest(def: QuestDef): void {
    const reward = def.reward;

    // Deepcut's reward is a place, so it has to change the world rather than
    // the inventory. Kept beside the quest that earns it, and mirrored in
    // restoreQuestUnlocks so a reload does not bury it again.
    if (def.id === 'deepcut') this.openTheCut();
    if (def.id === 'quiet_grove') this.openTheGrove();
    // Vigil is the only source of the book; there is no other way to learn one.
    if (def.id === 'vigil') this.learnSpells();


    // Wayfarer reveals a tab that did not exist a moment ago, so the strip is
    // rebuilt on any completion rather than only that one -- a tab appearing
    // is a property of the quest data, not of one hardcoded id.
    this.ui.refreshTabs();

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
    // The Cut stays open once it has been opened. The map is regenerated from
    // seed on every load, so anything a quest changed about the world has to
    // be re-applied here or it silently seals itself again.
    const deepcut = getQuest('deepcut');
    if (deepcut && this.quests.isComplete(deepcut)) this.openTheCut();

    const grove = getQuest('quiet_grove');
    if (grove && this.quests.isComplete(grove)) this.openTheGrove();

    // Keyed to the stage, not to completion. The reeds come down partway
    // through, and the stage after that sends the player into the fen --
    // waiting for completion here would re-seal it under someone standing
    // in it.
    if (this.quests.stageOf('cartographers_error') >= 3) this.openTheSallows();
    if (this.quests.stageOf('sunken_road') >= 3) this.openTheRoad();

    // Same reasoning: the Ninth is summoned partway through Nine Names, and
    // the stage after that is killing it. It stays once it has been called.
    if (this.quests.stageOf('nine_names') >= 4) this.summonTheNinth();
    if (this.quests.stageOf('the_last_warden') >= 4) this.openTheVault();

    const vigil = getQuest('vigil');
    if (vigil && this.quests.isComplete(vigil)) this.player.knowsSpells = true;

    const coldHearth = getQuest('cold_hearth');
    if (!coldHearth || !this.quests.isComplete(coldHearth)) return;

    const maren = this.npcs.find((n) => n.def.id === 'maren');
    if (!maren || this.objects.fireNear(maren.x, maren.y)) return;

    const spot = this.freeTileBeside(maren.x, maren.y);
    if (spot) this.objects.addFire(spot.x, spot.y, 0, true);
  }

  /** Clear the fall that buries the way into the lower mine. */
  private openTheCut(): void {
    this.map.scenery[this.map.idx(CUT_ENTRANCE.x, CUT_ENTRANCE.y)] = null;
  }

  /** Open the spellbook, and default to the one spell anybody can cast. */
  private learnSpells(): void {
    this.player.knowsSpells = true;
    this.player.selectedSpell ??= 'ember_spark';
    this.ui.dirty = true;
  }

  /** Cut the reed at the head of the causeway. */
  private openTheRoad(): void {
    this.map.scenery[this.map.idx(ROAD_ENTRANCE.x, ROAD_ENTRANCE.y)] = null;
  }

  /** Cut back the dead reed across the fen path. */
  private openTheSallows(): void {
    this.map.scenery[this.map.idx(SALLOWS_ENTRANCE.x, SALLOWS_ENTRANCE.y)] = null;
  }

  /** Cut back the thicket across the grove path. */
  private openTheGrove(): void {
    this.map.scenery[this.map.idx(GROVE_ENTRANCE.x, GROVE_ENTRANCE.y)] = null;
  }

  /**
   * Put the Ninth on the interior floor.
   *
   * It is not in the map's spawn table because the interior is walkable from
   * the moment Q17 opens the stair, and a level-76 boss standing in a room
   * the player is sent to explore would kill them for going the wrong way.
   * It appears when Nine Names says it does, and stays afterwards -- it
   * respawns, and its ore is the tier-5 supply.
   */
  private summonTheNinth(): void {
    if (this.npcs.some((n) => n.def.id === 'the_ninth')) return;
    this.npcs.push(new Npc('the_ninth', INTERIOR_FLOOR.x, INTERIOR_FLOOR.y));
  }

  /**
   * Move the fall at the west end, and put what was behind it behind it.
   *
   * One tile of the wall comes out, which is enough to walk through and not
   * enough to make the vault feel opened. The Warden is placed at the same
   * moment rather than earlier: the room is dry and reachable the instant the
   * stone moves, and an empty vault would answer the quest's question before
   * the quest does.
   */
  private openTheVault(): void {
    this.map.scenery[this.map.idx(VAULT_SEAL.x, VAULT_SEAL.y)] = null;
    if (this.npcs.some((n) => n.def.id === 'the_last_warden')) return;
    this.npcs.push(new Npc('the_last_warden', VAULT_FLOOR.x, VAULT_FLOOR.y));
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

  /**
   * Fletch one batch. Needs no station and no tick loop -- it is instant, the
   * way lighting a fire is, because a repeating action for something with a
   * fixed input cost would only add waiting.
   */
  fletch(def: FletchDef): void {
    const p = this.player;

    const level = p.skills.level('crafting');
    if (level < def.level) {
      this.ui.message(
        `You need a Crafting level of ${def.level} to make ${def.name.toLowerCase()}.`, 'bad'
      );
      return;
    }

    if (!this.hasIngredients(def.inputs)) {
      this.ui.message(`You need ${this.ingredientText(def.inputs)}.`);
      return;
    }

    // Consumed first so the outputs have somewhere to go: eight shafts out of
    // one log would otherwise need a free slot the log is still sitting in.
    for (const input of def.inputs) this.consume(input.id, input.qty);

    if (!p.inventory.add(def.outputId, def.outputQty)) {
      // Put it back rather than destroying the materials.
      for (const input of def.inputs) p.inventory.add(input.id, input.qty);
      this.ui.message('Your inventory is too full.', 'bad');
      return;
    }

    audio.play('smith');
    this.announceXp('crafting', def.xp);
    this.ui.message(`You make ${def.outputQty} ${def.name.toLowerCase()}.`);
    this.ui.dirty = true;
  }

  /**
   * Use one inventory item on another.
   *
   * Returns false when the pair means nothing, so the interface can say so
   * without this method knowing what a message looks like. Both slots are read
   * before anything is consumed, because removing the first would shift the
   * second's index out from under us.
   */
  combineItems(firstIndex: number, secondIndex: number): boolean {
    const p = this.player;
    if (firstIndex === secondIndex) return false;

    const a = p.inventory.slots[firstIndex];
    const b = p.inventory.slots[secondIndex];
    if (!a || !b) return false;

    const recipe = combinationFor(a.id, b.id);
    if (!recipe) return false;

    // Untaught methods stay silent rather than refusing: a message here would
    // confirm the two items go together, which is the whole of the secret.
    if (!this.recipeKnown(recipe)) return false;

    if (recipe.skill && recipe.level) {
      if (p.skills.level(recipe.skill) < recipe.level) {
        this.ui.message(recipe.tooLow ?? 'You are not skilled enough for that.', 'bad');
        return true;   // handled: the pair was right, the player was not
      }
    }

    this.consume(a.id, 1);
    this.consume(b.id, 1);

    if (!p.inventory.add(recipe.output, recipe.outputQty)) {
      // Cannot happen from a two-for-one, but a future many-for-many could.
      p.inventory.add(a.id, 1);
      p.inventory.add(b.id, 1);
      this.ui.message('Your inventory is too full.', 'bad');
      return true;
    }

    audio.play('smith');
    if (recipe.skill && recipe.xp) this.announceXp(recipe.skill, recipe.xp);
    this.ui.message(recipe.message, 'good');
    this.ui.dirty = true;
    return true;
  }

  /**
   * Whether a recipe has been taught yet.
   *
   * A level gate says "not yet"; a quest gate says "nobody has shown you
   * how". Blackiron is the second kind, so it is hidden entirely rather
   * than listed greyed-out -- a recipe you have never heard of should not
   * appear on a menu at all.
   */
  private recipeKnown(def: { quest?: string }): boolean {
    if (!def.quest) return true;
    const q = getQuest(def.quest);
    return q ? this.quests.isComplete(q) : false;
  }

  /** True if the player holds any part of this recipe. Used to filter menus. */
  private hasAnyIngredient(bar: BarDef): boolean {
    return bar.ingredients.some((i) => this.player.inventory.count(i.id) > 0);
  }

  private hasIngredients(list: readonly { id: string; qty: number }[]): boolean {
    return list.every((i) => this.player.inventory.count(i.id) >= i.qty);
  }

  /**
   * Take one arrow from the ammo slot. False when the quiver is empty.
   *
   * Arrows are not recovered from the ground. Picking spent shafts back up is
   * fiddly in a game with no ground-item ownership, and it would turn every
   * fight into a tidying exercise -- the cost is meant to be felt, not undone.
   */
  private spendAmmo(p: Player, tag: string, count = 1): boolean {
    const ammo = p.inventory.equipment.ammo;
    if (!ammo || ammo.qty < count) return false;

    // The quiver has to hold the right kind: arrows will not fire a focus.
    if (!getItem(ammo.id)?.tags.includes(tag)) return false;

    ammo.qty -= count;
    if (ammo.qty <= 0) {
      const name = getItem(ammo.id)?.name.toLowerCase() ?? 'ammunition';
      p.inventory.equipment.ammo = null;
      this.ui.message(`That was your last ${name}.`);
    }
    this.ui.dirty = true;
    return true;
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

    // Only offer what the player has the makings of, plus everything they
    // already know how to make. A furnace that lists glass to someone who has
    // never seen sand is just a longer menu.
    const opts = bars
      .filter((bar) => this.recipeKnown(bar))
      .filter((bar) => bar.skill === 'smithing' || this.hasAnyIngredient(bar))
      .map((bar: BarDef) => ({
        verb: 'Make',
        noun: `${bar.name} (${this.ingredientText(bar.ingredients)})`,
        action: () => {
          p.clearPath();
          p.setAction({ type: 'smelt', x: tx, y: ty, barId: bar.id });
        }
      }));

    this.ui.openMenu(at.x, at.y, 'Furnace', opts);
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

    const opts = smithablesFor(bar.id).filter((def) => this.recipeKnown(def)).map((def: SmithDef) => {
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
    this.stats.bump('fires');
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

    const reach = mob instanceof Player ? mob.attackRange() : 1;
    if (mob.distanceTo(target) > reach) return;
    if (mob.attackCooldown > 0) return;

    // A shot costs an arrow, a cast costs a reagent. Spent before the roll, so
    // a miss costs the same as a hit -- ammunition is the price of fighting at
    // range, not a fee for succeeding at it.
    if (mob instanceof Player) {
      const tag = mob.ammoTag();
      // A spell decides its own cost; a bow always costs one. Taken as a batch
      // so a two-reagent spell cannot half-cast on the last leaf in the pouch.
      const cost = mob.activeSpell()?.reagents ?? 1;

      if (tag && !this.spendAmmo(mob, tag, cost)) {
        this.ui.message(`You have nothing left to ${tag === 'arrow' ? 'shoot' : 'cast'}.`, 'bad');
        mob.clearAction();
        return;
      }

      // Casting trains Magic whether or not the spell lands -- the leaf is
      // spent either way, and a miss taught you as much as a hit.
      const spell = mob.activeSpell();
      if (spell) this.announceXp('magic', spell.xp);
    }

    mob.faceTowards(target.x, target.y);
    mob.attackCooldown = mob.attackSpeed;
    mob.inCombatTicks = 0;

    const result = combat.resolve(mob, target);
    target.addHitsplat(result.damage);
    target.damage(result.damage);

    if (result.damage > 0) {
      this.stats.bump(mob instanceof Player ? 'damageDealt' : 'damageTaken', result.damage);
    }

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

    } else if (target instanceof Npc) {
      // A boss changing phase is a chat line and nothing else. The stat swap
      // has already happened inside advancePhase; this only says so, because
      // a fight that gets harder without saying why reads as a bug.
      const entered = target.advancePhase();
      if (entered) this.ui.message(entered.say, 'sys');
    }
  }

  private killNpc(npc: Npc, killer: Player | Npc): void {
    if (killer instanceof Player) this.stats.bump('slain');
    for (const drop of rollDrops(npc.def)) {
      this.ground.drop(drop.id, drop.qty, npc.x, npc.y);
    }

    if (killer instanceof Player) {
      this.ui.message(`You defeat ${withArticle(npc.name)}.`, 'good');
      killer.clearAction();

      // Count it against any quest stage currently asking for this kind.
      for (const def of quests) {
        const stage = this.quests.activeStage(def);
        if (stage?.goal.type !== 'kill' || stage.goal.npcId !== npc.def.id) continue;

        this.quests.countKill(def.id);
        const done = this.quests.killsFor(def.id);
        if (done <= stage.goal.count) {
          this.ui.message(`${done}/${stage.goal.count} ${plural(npc.name, stage.goal.count)}.`, 'sys');
        }
        this.ui.dirty = true;
      }
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
    this.stats.bump('deaths');
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
    this.ui.message(`You ${def.eatVerb} the ${def.name.toLowerCase()}. It heals some health.`);
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

    if (scenery && inspectable(scenery.kind)) {
      p.clearPath();
      p.setAction({ type: 'inspect', x: tile.x, y: tile.y });
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
      p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, tile.x, tile.y, this.occupiedByMob, false));
      this.renderer.setClickMarker(tile.x, tile.y, 'move');
      return;
    }

    if (!this.map.isWalkable(tile.x, tile.y)) {
      // Clicking a wall walks as close as possible, like RuneScape does.
      const near = pathfind.findAvoiding(this.map, p.x, p.y, tile.x, tile.y, this.occupiedByMob, true);
      if (near.length) {
        p.clearAction();
        p.setPath(near);
        this.renderer.setClickMarker(tile.x, tile.y, 'move');
      }
      return;
    }

    p.clearAction();
    p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, tile.x, tile.y, this.occupiedByMob, false));
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
            p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, it.x, it.y, this.occupiedByMob, false));
          }
        });
      }

      if (this.map.isWalkable(tile.x, tile.y)) {
        opts.push({
          verb: 'Walk here',
          noun: '',
          action: () => {
            p.clearAction();
            p.setPath(pathfind.findAvoiding(this.map, p.x, p.y, tile.x, tile.y, this.occupiedByMob, false));
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
      quests: this.quests.stages,
      questKills: this.quests.kills,
      rng: rng.snapshot(),
      knowsSpells: p.knowsSpells,
      spell: p.selectedSpell,
      shops: this.shops.snapshot(),
      stats: this.stats.toJSON()
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
      this.quests.restoreKills(data.questKills);
      rng.restore(data.rng);
      if (data.knowsSpells === true) p.knowsSpells = true;
      if (typeof data.spell === 'string') p.selectedSpell = data.spell;
      this.restoreQuestUnlocks();
      // A loaded character may already have earned the statistics tab.
      this.ui.refreshTabs();
      this.shops.restore(data.shops);
      this.stats.restore(data.stats as Record<string, number> | undefined);

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
