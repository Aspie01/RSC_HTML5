// Entry point. Vite loads this from index.html.

import { Game } from './game';

function boot(): void {
  const canvas = document.getElementById('game');
  const minimap = document.getElementById('minimap');

  if (!(canvas instanceof HTMLCanvasElement) || !(minimap instanceof HTMLCanvasElement)) {
    throw new Error('Expected #game and #minimap canvas elements.');
  }

  const game = new Game(canvas, minimap);
  game.start();

  const reset = document.getElementById('btn-reset');
  reset?.addEventListener('click', () => {
    if (confirm('Delete your saved progress and start over?')) game.reset();
  });

  // Handy while developing: `game` in the console lets you poke at live state.
  (window as unknown as { game: Game }).game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
