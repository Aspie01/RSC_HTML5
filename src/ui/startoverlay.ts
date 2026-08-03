/**
 * The click-to-start gate, and the sound toggle it enables.
 *
 * This screen exists for three reasons that all happen to need the same
 * gesture:
 *
 *   1. **Audio.** A browser will not let a page create a running AudioContext
 *      without a user interaction, so the first click is the only moment the
 *      audio graph can be built.
 *   2. **Focus.** Inside an itch.io iframe the game does not have keyboard
 *      focus until something in it is clicked. Without this, the run toggle
 *      and tab keys silently do nothing on arrival.
 *   3. **Arrival.** A fixed-tick world that begins the instant the page paints
 *      means combat can start while the player is still reading the chat log.
 */

import { audio } from '../audio/audio.ts';

/** Muting survives a refresh, but is not part of the save -- it is a device preference, not progress. */
const MUTE_KEY = 'rs_html5_muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Blocked storage costs the player a remembered preference, nothing more.
  }
}

export function bindStartOverlay(canvas: HTMLCanvasElement, onStart: () => void): void {
  const overlay = document.getElementById('start-overlay');
  const button = document.getElementById('btn-mute');

  let muted = readMuted();
  audio.setMuted(muted);

  const paintMute = () => {
    if (!button) return;
    button.textContent = muted ? 'sound off' : 'sound on';
    button.classList.toggle('off', muted);
    button.title = muted ? 'Turn sound on' : 'Turn sound off';
  };
  paintMute();

  button?.addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    writeMuted(muted);
    paintMute();
    if (!muted) audio.play('click');
  });

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;

    // Order matters: the context has to exist before anything asks it to make
    // a sound, and both have to happen inside this gesture.
    audio.unlock();
    audio.setMuted(muted);
    audio.startAmbient();

    overlay?.classList.add('gone');
    canvas.focus();
    onStart();
  };

  if (!overlay) { begin(); return; }

  overlay.addEventListener('click', begin);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); }
  });
  overlay.focus();
}
