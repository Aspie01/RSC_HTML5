// Entry point. Vite loads this from index.html.

import { Game } from './game';
import { openSaveStore } from './persist/storage';
import { bindSaveDialog } from './ui/savedialog';
import { bindStartOverlay } from './ui/startoverlay';
import { bindShopWindow } from './ui/shopwindow';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  const minimap = document.getElementById('minimap');

  if (!(canvas instanceof HTMLCanvasElement) || !(minimap instanceof HTMLCanvasElement)) {
    throw new Error('Expected #game and #minimap canvas elements.');
  }

  // Storage is opened and read before the game is constructed. Picking a
  // backing store involves an IndexedDB handshake, so it cannot happen inside
  // a constructor -- see the note on Game's.
  const store = await openSaveStore();
  let saved: string | null = null;
  try {
    saved = await store.read();
  } catch (err) {
    console.warn('Could not read the save:', err);
  }

  const game = new Game(canvas, minimap, store, saved);

  // The loop starts on the player's first click rather than on load. Ticks are
  // fixed and the world is live, so starting on load means a goblin can reach
  // you while you are still reading the welcome messages.
  bindStartOverlay(canvas, () => game.start());

  const reset = document.getElementById('btn-reset');
  reset?.addEventListener('click', () => {
    if (confirm('Delete your saved progress and start over?')) void game.reset();
  });

  bindSaveDialog(game);
  bindShopWindow(game);

  // Handy while developing: `game` in the console lets you poke at live state.
  (window as unknown as { game: Game }).game = game;
}

function start(): void {
  void boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
