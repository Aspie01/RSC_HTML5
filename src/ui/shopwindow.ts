/**
 * The shop window.
 *
 * Stock on the left, the player's pack on the right, coins between them --
 * because every decision a shop asks for is a comparison between those three
 * things, and making the player close one panel to see another turns a choice
 * into bookkeeping.
 *
 * Kept out of `ui.ts` for the same reason the save dialog is: it is not part of
 * the persistent interface, it does not redraw per frame, and it only exists
 * while a conversation is open.
 */

import type { Game } from '../game';
import type { ShopDef } from '../data/shops';
import { getItem } from '../data/items';
import * as sprites from '../render/sprites';
import { audio } from '../audio/audio';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** One clickable cell: item icon, quantity badge, price caption. */
function cell(itemId: string, qty: number, price: number, priceLabel: string,
              dim: boolean, onClick: () => void): HTMLElement {
  const def = getItem(itemId);
  const box = document.createElement('div');
  box.className = 'shop-slot' + (dim ? ' out' : '');

  if (def) {
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 40;
    cv.className = 'inv-icon';
    const ctx = cv.getContext('2d');
    if (ctx) sprites.item(ctx, 20, 20, 34, def);
    box.appendChild(cv);

    if (qty !== 1) {
      const q = document.createElement('span');
      q.className = 'inv-qty';
      q.textContent = String(qty);
      box.appendChild(q);
    }

    const tag = document.createElement('span');
    tag.className = 'shop-price';
    tag.textContent = price > 0 ? String(price) : '--';
    box.appendChild(tag);

    box.title = price > 0
      ? `${def.name} -- ${priceLabel} ${price}`
      : `${def.name} -- not traded`;
  }

  if (!dim && price > 0) box.addEventListener('click', onClick);
  return box;
}

export function bindShopWindow(game: Game): void {
  const modal = el('shop-modal');
  const stockGrid = el('shop-stock');
  const invGrid = el('shop-inv');
  const coinsEl = el('shop-coins');
  const statusEl = el('shop-status');
  const nameEl = el('shop-name');
  const close = el('btn-shop-close');

  if (!modal || !stockGrid || !invGrid || !coinsEl || !statusEl || !nameEl) return;

  let open: ShopDef | null = null;

  const say = (text: string, bad = false) => {
    statusEl.textContent = text;
    statusEl.classList.toggle('bad', bad);
  };

  const REASONS: Record<string, string> = {
    'no-stock': 'Corbin has none of those left.',
    'no-coins': 'You cannot afford that.',
    'no-room': 'Your pack is full.',
    'not-wanted': 'He will not take that.',
    'none-held': 'You are not carrying one.'
  };

  const draw = () => {
    if (!open) return;
    const shop = open;
    const inv = game.player.inventory;

    nameEl.textContent = shop.name;
    coinsEl.textContent = `${inv.count('coins')} coins`;

    stockGrid.replaceChildren();
    for (const line of game.shops.listing(shop)) {
      stockGrid.appendChild(cell(
        line.id, line.qty, line.price, 'costs', line.qty <= 0,
        () => {
          const r = game.buyFromShop(shop, line.id);
          say(r.ok ? `Bought ${getItem(line.id)?.name.toLowerCase()} for ${r.coins}.`
                   : REASONS[r.reason] ?? 'No.', !r.ok);
          draw();
        }
      ));
    }

    // The pack side lists what the shop would actually pay for, so a player
    // never clicks a burnt fish and wonders why nothing happened.
    invGrid.replaceChildren();
    const seen = new Set<string>();
    for (const slot of inv.slots) {
      if (!slot || slot.id === 'coins' || seen.has(slot.id)) continue;
      seen.add(slot.id);

      const price = game.shops.priceToSell(shop, slot.id);
      const wanted = price > 0 &&
        (shop.buysAnything || shop.stock.some((l) => l.id === slot.id));

      invGrid.appendChild(cell(
        slot.id, inv.count(slot.id), wanted ? price : 0, 'fetches', !wanted,
        () => {
          const r = game.sellToShop(shop, slot.id);
          say(r.ok ? `Sold ${getItem(slot.id)?.name.toLowerCase()} for ${r.coins}.`
                   : REASONS[r.reason] ?? 'No.', !r.ok);
          draw();
        }
      ));
    }
  };

  const hide = () => {
    open = null;
    modal.classList.remove('open');
  };

  game.onShopOpen = (shop: ShopDef) => {
    open = shop;
    say('');
    draw();
    modal.classList.add('open');
    audio.play('click');
  };

  close?.addEventListener('click', hide);
  modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) hide();
  });
}
