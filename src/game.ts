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

import type { EquipSlot, PlayerAction, SkillId, World } from './types';
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
import { getTree, burnables, recipeFor } from './data/resources';
import { rollGather, rollBurn } from './systems/skilling';
import { SKILL_LIST } from './systems/skills';
import * as pathfind from './world/pathfind';
import * as combat from './systems/combat';
import * as iso from './world/iso';
import { lerp, tileDist } from './core/util';
import { loop } from './core/loop';

const SAVE_KEY = 'rs_html5_save_v1';
const AUTOSAVE_TICKS = 50; // every 30 seconds

interface SaveData {
  v: number;
  x: number;
  y: number;
  hp: number;
  xp: Record<string, number>;
  style: string;
  running: boolean;
  slots: unknown;
  equipment: unknown;
}

export class Game implements World {
  readonly map: GameMap = generateMap();
  readonly ground = new GroundItems();
  readonly objects = new WorldObjects();
  readonly player: Player;
  readonly npcs: Npc[] = [];

  private readonly renderer: Renderer;
  private readonly ui: UI;
  private autosaveCounter = 0;

  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement) {
    // Start on the crossroads at the centre of the map.
    this.player = new Player(24, 24);
    this.player.inventory.add('bronze_scimitar', 1);
    this.player.inventory.add('wooden_shield', 1);
    this.player.inventory.add('bronze_axe', 1);
    this.player.inventory.add('tinderbox', 1);
    this.player.inventory.add('cooked_chicken', 3);

    for (const spawn of this.map.spawns) {
      this.npcs.push(new Npc(spawn.npcId, spawn.x, spawn.y));
    }

    this.renderer = new Renderer(canvas, minimap);
    this.ui = new UI(this);

    this.load();
    this.player.attackSpeed = this.player.inventory.attackSpeed();

    this.bindInput(canvas);
    this.greet();
  }

  private greet(): void {
    this.ui.message('Welcome to the game.', 'sys');
    this.ui.message('Left-click the ground to walk, or an enemy to attack.', 'sys');
    this.ui.message('Chickens are north-west, goblins south-west, guards south-east.', 'sys');
    this.ui.message('Click a tree to chop it. Right-click logs to light a fire, ' +
                    'then click the fire to cook.', 'sys');
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

    } else if (action.type === 'chop') {
      this.resolveChop(action.x, action.y);

    } else {
      this.resolveCook(action.x, action.y);
    }
  }

  /**
   * One tick of woodcutting. Like combat, this is an independent roll every
   * tick rather than a progress bar -- which is why a tree sometimes falls
   * immediately and sometimes takes ten seconds.
   */
  private resolveChop(tx: number, ty: number): void {
    const p = this.player;

    const scenery = this.map.sceneryAt(tx, ty);
    if (!scenery || scenery.kind !== 'tree' || !scenery.resource) {
      p.clearAction();
      return;
    }

    const def = getTree(scenery.resource);
    if (!def) { p.clearAction(); return; }

    const tileIndex = this.map.idx(tx, ty);
    if (this.objects.isDepleted(tileIndex)) {
      this.ui.message('This tree has already been cut down.');
      p.clearAction();
      return;
    }

    // Walk into range first.
    if (tileDist(p.x, p.y, tx, ty) > 1) {
      if (!p.path.length) {
        p.setPath(pathfind.findAdjacent(this.map, p.x, p.y, tx, ty));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }
      return;
    }

    p.clearPath();
    p.faceTowards(tx, ty);

    const level = p.skills.level('woodcutting');
    if (level < def.level) {
      this.ui.message(
        `You need a Woodcutting level of ${def.level} to chop this tree.`, 'bad'
      );
      p.clearAction();
      return;
    }

    if (!rollGather(def.low, def.high, level)) return; // swing missed; try again next tick

    if (p.inventory.isFull()) {
      this.ui.message("Your inventory is too full to hold any more logs.", 'bad');
      p.clearAction();
      return;
    }

    p.inventory.add(def.logId, 1);
    this.announceXp('woodcutting', def.xp);
    this.ui.message(`You get some ${getItem(def.logId)?.name.toLowerCase() ?? 'logs'}.`);
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
    if (tileDist(p.x, p.y, tx, ty) > 1) {
      if (!p.path.length) {
        p.setPath(pathfind.findAdjacent(this.map, p.x, p.y, tx, ty));
        if (!p.path.length) {
          this.ui.message("I can't reach that.");
          p.clearAction();
        }
      }
      return;
    }

    p.clearPath();
    p.faceTowards(tx, ty);

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
      this.announceXp('cooking', recipe.xp);
      this.ui.message(`You cook the ${getItem(recipe.rawId)?.name.toLowerCase() ?? 'food'}.`);
    }

    this.ui.dirty = true;
  }

  /** Award experience and announce any level-ups in the chat log. */
  private announceXp(skill: SkillId, amount: number): void {
    if (this.player.skills.addXp(skill, amount) > 0) {
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
    const result = this.player.inventory.equip(index);
    if (!result.ok) return;

    this.player.attackSpeed = this.player.inventory.attackSpeed();
    this.ui.message(`You wield the ${result.name}.`);
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
    this.ui.message(`You eat the ${def.name}. It heals some health.`);
    this.ui.dirty = true;
  }

  dropItem(index: number): void {
    const taken = this.player.inventory.removeSlot(index);
    if (!taken) return;

    this.ground.drop(taken.id, taken.qty, this.player.x, this.player.y);
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
      if (e.code === 'Space') {
        e.preventDefault();
        this.player.running = !this.player.running;
        this.ui.message(`Run mode ${this.player.running ? 'enabled' : 'disabled'}.`);
      } else if (e.key >= '1' && e.key <= '4') {
        const tabs = ['inventory', 'equipment', 'skills', 'combat'] as const;
        const tab = tabs[Number(e.key) - 1];
        if (tab) this.ui.setTab(tab);
      }
    });

    window.addEventListener('resize', () => this.renderer.resize());
  }

  private handleClick(sx: number, sy: number): void {
    const p = this.player;
    if (p.dead) return;

    const mob = this.pickMob(sx, sy, loop.alpha);
    if (mob) {
      p.clearPath();
      p.setAction({ type: 'attack', target: mob });
      p.target = mob;
      this.renderer.setClickMarker(mob.x, mob.y, 'attack');
      this.ui.message(`You attack the ${mob.name}.`);
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

    // A standing tree is a woodcutting node.
    const scenery = this.map.sceneryAt(tile.x, tile.y);
    if (scenery?.kind === 'tree' && scenery.resource &&
        !this.objects.isDepleted(this.map.idx(tile.x, tile.y))) {
      p.clearPath();
      p.setAction({ type: 'chop', x: tile.x, y: tile.y });
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
    const opts: { verb: string; noun: string; action: () => void }[] = [];

    const mob = this.pickMob(sx, sy, loop.alpha);
    if (mob) {
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
      opts.push({
        verb: 'Examine',
        noun: mob.name,
        action: () => {
          const acc = combat.previewAccuracy(p, mob);
          this.ui.message(
            `It's a ${mob.name.toLowerCase()}. Combat level ${mob.def.level}, ` +
            `${mob.maxHp} hitpoints. Your accuracy: ${Math.round(acc * 100)}%.`
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
      if (scenery?.kind === 'tree' && scenery.resource) {
        const treeDef = getTree(scenery.resource);
        const stumped = this.objects.isDepleted(this.map.idx(tile.x, tile.y));

        if (treeDef && !stumped) {
          opts.push({
            verb: 'Chop down', noun: treeDef.name,
            action: () => {
              p.clearPath();
              p.setAction({ type: 'chop', x: tile.x, y: tile.y });
            }
          });
        }
        if (treeDef) {
          opts.push({
            verb: 'Examine', noun: treeDef.name,
            action: () => {
              this.ui.message(stumped
                ? 'A freshly cut tree stump. It will regrow shortly.'
                : `${treeDef.name}. Requires Woodcutting ${treeDef.level}.`);
            }
          });
        }
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
  save(): void {
    try {
      const p = this.player;
      const data: SaveData = {
        v: 1,
        x: p.x, y: p.y,
        hp: p.hp,
        xp: p.skills.xp,
        style: p.attackStyle,
        running: p.running,
        slots: p.inventory.slots,
        equipment: p.inventory.equipment
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // Private browsing or a full quota; not worth interrupting play over.
      console.warn('Save failed:', err);
    }
  }

  load(): void {
    let raw: string | null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    try {
      const data = JSON.parse(raw) as Partial<SaveData>;
      const p = this.player;

      // Merge rather than replace. A save written before a skill existed has
      // no key for it, and assigning the object wholesale would leave that
      // skill permanently unable to gain experience (addXp ignores unknown
      // ids). Merging keeps old saves working every time a skill is added.
      if (data.xp) {
        for (const s of SKILL_LIST) {
          const value = data.xp[s.id];
          if (typeof value === 'number' && Number.isFinite(value)) {
            p.skills.xp[s.id] = value;
          }
        }
      }
      if (data.slots) p.inventory.slots = data.slots as typeof p.inventory.slots;
      if (data.equipment) p.inventory.equipment = data.equipment as typeof p.inventory.equipment;
      if (data.style) p.attackStyle = data.style as typeof p.attackStyle;
      if (typeof data.running === 'boolean') p.running = data.running;

      p.maxHp = p.skills.level('hitpoints');
      p.hp = Math.min(data.hp ?? p.maxHp, p.maxHp);

      if (typeof data.x === 'number' && typeof data.y === 'number' &&
          this.map.isWalkable(data.x, data.y)) {
        p.x = p.prevX = data.x;
        p.y = p.prevY = data.y;
      }

      this.ui.message('Welcome back. Your progress was restored.', 'sys');
    } catch (err) {
      console.warn('Save file was corrupt, starting fresh:', err);
    }
  }

  reset(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
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
