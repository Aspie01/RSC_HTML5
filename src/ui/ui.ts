// The interface: tabbed sidebar, chatbox, orbs, context menus.
//
// Built from DOM elements rather than drawn into the canvas. That is the right
// call for a RuneScape-like: the interface is panels, grids and text, which the
// browser already lays out and styles for free. Canvas is for the world, DOM is
// for the UI -- mixing the two is a common and painful mistake.
//
// Redraws are gated on a dirty flag; there is no reason to rebuild 28 inventory
// icons at 144fps.

import type { Game } from '../game';
import type { AttackStyleId, ItemDef, EquipSlot } from '../types';
import { INVENTORY_CAPACITY, EQUIP_SLOTS } from '../systems/inventory';
import { SKILL_LIST } from '../systems/skills';
import { STYLES, previewMaxHit } from '../systems/combat';
import { getItem } from '../data/items';
import { burnables } from '../data/resources';
import * as sprites from '../render/sprites';
import * as XP from '../data/xp';

export type TabId = 'inventory' | 'equipment' | 'skills' | 'combat';
export type ChatClass = '' | 'sys' | 'good' | 'bad' | 'levelup';

interface TabDef {
  readonly id: TabId;
  readonly label: string;
  readonly title: string;
}

const TABS: readonly TabDef[] = [
  { id: 'inventory', label: 'Inv', title: 'Inventory' },
  { id: 'equipment', label: 'Equip', title: 'Worn Equipment' },
  { id: 'skills', label: 'Skills', title: 'Skills' },
  { id: 'combat', label: 'Combat', title: 'Combat Options' }
];

interface MenuOption {
  verb: string;
  noun: string;
  action: () => void;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

function sign(n: number): string {
  return (n >= 0 ? '+' : '') + n;
}

export class UI {
  private readonly game: Game;
  private activeTab: TabId = 'inventory';
  private menuOpen = false;

  dirty = true;

  private readonly dom = {
    tabs: el<HTMLDivElement>('tabs'),
    panel: el<HTMLDivElement>('panel'),
    panelTitle: el<HTMLSpanElement>('panel-title'),
    chat: el<HTMLDivElement>('chat-log'),
    hp: el<HTMLSpanElement>('orb-hp'),
    hpFill: el<HTMLDivElement>('orb-hp-fill'),
    combat: el<HTMLDivElement>('stat-combat'),
    run: el<HTMLDivElement>('orb-run'),
    contextMenu: el<HTMLDivElement>('context-menu')
  };

  constructor(game: Game) {
    this.game = game;
    this.buildTabs();
    this.bindGlobal();
    this.setTab('inventory');
  }

  // --------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------
  message(text: string, cls: ChatClass = ''): void {
    const div = document.createElement('div');
    div.className = `chat-line ${cls}`.trim();
    div.textContent = text;
    this.dom.chat.appendChild(div);

    while (this.dom.chat.children.length > 80) {
      this.dom.chat.removeChild(this.dom.chat.firstChild!);
    }
    this.dom.chat.scrollTop = this.dom.chat.scrollHeight;
  }

  // --------------------------------------------------------------------
  // Tabs
  // --------------------------------------------------------------------
  private buildTabs(): void {
    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset['tab'] = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.setTab(tab.id));
      this.dom.tabs.appendChild(btn);
    }
  }

  setTab(id: TabId): void {
    this.activeTab = id;
    this.dom.panelTitle.textContent = TABS.find((t) => t.id === id)?.title ?? '';

    for (const btn of this.dom.tabs.querySelectorAll<HTMLButtonElement>('.tab-btn')) {
      btn.classList.toggle('active', btn.dataset['tab'] === id);
    }
    this.dirty = true;
  }

  private bindGlobal(): void {
    document.addEventListener('mousedown', (e) => {
      if (this.menuOpen && !this.dom.contextMenu.contains(e.target as Node)) {
        this.closeMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenu();
    });
  }

  // --------------------------------------------------------------------
  // Context menu
  // --------------------------------------------------------------------
  openMenu(screenX: number, screenY: number, title: string, options: MenuOption[]): void {
    const menu = this.dom.contextMenu;
    menu.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ctx-title';
    head.textContent = title;
    menu.appendChild(head);

    for (const opt of options) {
      const row = document.createElement('div');
      row.className = 'ctx-option';

      const verb = document.createElement('span');
      verb.className = 'ctx-verb';
      verb.textContent = opt.verb;

      const noun = document.createElement('span');
      noun.className = 'ctx-noun';
      noun.textContent = opt.noun ? ` ${opt.noun}` : '';

      row.append(verb, noun);
      row.addEventListener('click', () => {
        this.closeMenu();
        opt.action();
      });
      menu.appendChild(row);
    }

    menu.style.display = 'block';
    menu.style.left = `${screenX}px`;
    menu.style.top = `${screenY}px`;

    // Keep the menu inside the window.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }

    this.menuOpen = true;
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.dom.contextMenu.style.display = 'none';
  }

  // --------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------
  update(): void {
    const p = this.game.player;

    this.dom.hp.textContent = `${p.hp}/${p.maxHp}`;
    this.dom.hpFill.style.height = `${Math.round((p.hp / p.maxHp) * 100)}%`;
    this.dom.hp.classList.toggle('low', p.hp / p.maxHp <= 0.25);
    this.dom.combat.textContent = `Combat ${p.skills.combatLevel()}`;
    this.dom.run.classList.toggle('on', p.running);

    if (this.dirty) {
      this.renderPanel();
      this.dirty = false;
    }
  }

  private renderPanel(): void {
    const panel = this.dom.panel;
    panel.replaceChildren();

    switch (this.activeTab) {
      case 'inventory': this.renderInventory(panel); break;
      case 'equipment': this.renderEquipment(panel); break;
      case 'skills': this.renderSkills(panel); break;
      case 'combat': this.renderCombat(panel); break;
    }
  }

  private footer(text: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'panel-footer';
    div.textContent = text;
    return div;
  }

  // --------------------------------------------------------------------
  // Inventory
  // --------------------------------------------------------------------
  private renderInventory(panel: HTMLElement): void {
    const inv = this.game.player.inventory;

    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const index = i;
      const cell = document.createElement('div');
      cell.className = 'inv-slot';

      const slot = inv.slots[index];
      if (slot) {
        const def = getItem(slot.id);
        if (def) {
          const cv = document.createElement('canvas');
          cv.width = 40;
          cv.height = 40;
          cv.className = 'inv-icon';
          const cctx = cv.getContext('2d');
          if (cctx) sprites.item(cctx, 20, 20, 34, def);
          cell.appendChild(cv);

          if (def.stackable && slot.qty > 1) {
            const q = document.createElement('span');
            q.className = 'inv-qty';
            q.textContent = slot.qty >= 100000
              ? `${Math.floor(slot.qty / 1000)}K`
              : String(slot.qty);
            cell.appendChild(q);
          }

          cell.title = def.name;
          cell.addEventListener('click', () => this.game.defaultItemAction(index));
          cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openItemMenu(e.clientX, e.clientY, index, def);
          });
        }
      }

      grid.appendChild(cell);
    }

    panel.appendChild(grid);
    panel.appendChild(this.footer(`${inv.freeSlots()} free slots`));
  }

  private openItemMenu(x: number, y: number, index: number, def: ItemDef): void {
    const opts: MenuOption[] = [];

    if (burnables[def.id]) {
      opts.push({ verb: 'Light', noun: def.name, action: () => this.game.lightLogs(index) });
    }
    if (def.slot) {
      opts.push({
        verb: def.slot === 'weapon' ? 'Wield' : 'Wear',
        noun: def.name,
        action: () => this.game.equipItem(index)
      });
    }
    if (def.heals > 0) {
      opts.push({ verb: 'Eat', noun: def.name, action: () => this.game.eatItem(index) });
    }
    opts.push({ verb: 'Drop', noun: def.name, action: () => this.game.dropItem(index) });
    opts.push({ verb: 'Examine', noun: def.name, action: () => this.message(def.examine) });

    this.openMenu(x, y, 'Choose Option', opts);
  }

  // --------------------------------------------------------------------
  // Equipment
  // --------------------------------------------------------------------
  private renderEquipment(panel: HTMLElement): void {
    const inv = this.game.player.inventory;

    const wrap = document.createElement('div');
    wrap.className = 'equip-list';

    for (const slotName of EQUIP_SLOTS) {
      const row = document.createElement('div');
      row.className = 'equip-row';

      const label = document.createElement('span');
      label.className = 'equip-slot-name';
      label.textContent = slotName;

      const value = document.createElement('span');
      value.className = 'equip-slot-item';

      const eq = inv.equipment[slotName];
      if (eq) {
        value.textContent = getItem(eq.id)?.name ?? eq.id;
        row.classList.add('filled');
        row.title = 'Click to remove';
        row.addEventListener('click', () => this.game.unequipItem(slotName as EquipSlot));
      } else {
        value.textContent = '--';
      }

      row.append(label, value);
      wrap.appendChild(row);
    }

    panel.appendChild(wrap);

    const b = inv.bonuses();
    const stats = document.createElement('div');
    stats.className = 'equip-bonuses';
    stats.innerHTML =
      '<div class="bonus-head">Equipment Bonuses</div>' +
      `<div><span>Attack</span><b>${sign(b.attack)}</b></div>` +
      `<div><span>Strength</span><b>${sign(b.strength)}</b></div>` +
      `<div><span>Defence</span><b>${sign(b.defence)}</b></div>` +
      `<div><span>Speed</span><b>${inv.attackSpeed()} ticks</b></div>`;
    panel.appendChild(stats);
  }

  // --------------------------------------------------------------------
  // Skills
  // --------------------------------------------------------------------
  private renderSkills(panel: HTMLElement): void {
    const skills = this.game.player.skills;

    const grid = document.createElement('div');
    grid.className = 'skill-grid';

    for (const s of SKILL_LIST) {
      const lvl = skills.level(s.id);
      const exp = skills.experience(s.id);
      const prog = XP.progress(exp);

      const cell = document.createElement('div');
      cell.className = 'skill-cell';
      cell.title =
        `${s.name}\nXP: ${Math.floor(exp).toLocaleString()}\n` +
        (lvl < 99
          ? `Next level: ${Math.ceil(XP.forLevel(lvl + 1) - exp).toLocaleString()} xp`
          : 'Maxed');

      cell.innerHTML =
        `<span class="skill-dot" style="background:${s.colour}"></span>` +
        `<span class="skill-name">${s.name.slice(0, 5)}</span>` +
        `<span class="skill-lvl">${lvl}</span>` +
        `<span class="skill-bar"><i style="width:${(prog * 100).toFixed(1)}%;background:${s.colour}"></i></span>`;

      grid.appendChild(cell);
    }

    panel.appendChild(grid);
    panel.appendChild(this.footer(`Total level: ${skills.totalLevel()}`));
  }

  // --------------------------------------------------------------------
  // Combat
  // --------------------------------------------------------------------
  private renderCombat(panel: HTMLElement): void {
    const player = this.game.player;

    const wrap = document.createElement('div');
    wrap.className = 'style-list';

    for (const key of Object.keys(STYLES) as AttackStyleId[]) {
      const style = STYLES[key];
      const btn = document.createElement('button');
      btn.className = `style-btn${player.attackStyle === key ? ' active' : ''}`;

      const trains = style.xp
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(', ');

      btn.innerHTML = `<b>${style.name}</b><small>${trains}</small>`;
      btn.addEventListener('click', () => {
        player.attackStyle = key;
        this.message(`Combat style: ${style.name}.`);
        this.dirty = true;
      });

      wrap.appendChild(btn);
    }

    panel.appendChild(wrap);

    const info = document.createElement('div');
    info.className = 'equip-bonuses';
    info.innerHTML =
      '<div class="bonus-head">Your Stats</div>' +
      `<div><span>Max hit</span><b>${previewMaxHit(player)}</b></div>` +
      `<div><span>Attack speed</span><b>${player.inventory.attackSpeed()} ticks</b></div>` +
      `<div><span>Combat level</span><b>${player.skills.combatLevel()}</b></div>`;
    panel.appendChild(info);

    const help = document.createElement('div');
    help.className = 'panel-footer';
    help.innerHTML =
      'Left-click to walk or attack.<br>Right-click for options.<br>Space toggles run.';
    panel.appendChild(help);
  }
}
