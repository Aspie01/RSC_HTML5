/**
 * The manual export/import panel.
 *
 * Kept out of `ui.ts` because it is not part of the game interface: it does
 * not render per frame, does not read world state, and exists to work when
 * everything automatic has already failed. Its only contact with the game is
 * asking for a save code and handing one back.
 */

import type { Game } from '../game.ts';

export function bindSaveDialog(game: Game): void {
  const modal = document.getElementById('save-modal');
  const field = document.getElementById('save-code');
  const status = document.getElementById('save-status');
  const open = document.getElementById('btn-save');
  const close = document.getElementById('btn-save-close');
  const copy = document.getElementById('btn-save-copy');
  const load = document.getElementById('btn-save-load');

  if (!modal || !(field instanceof HTMLTextAreaElement) || !status) return;

  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };

  const show = () => {
    field.value = game.exportSave();
    say('This code is your character. Copy it somewhere safe.');
    modal.classList.add('open');
    field.focus();
    field.select();
  };

  const hide = () => modal.classList.remove('open');

  open?.addEventListener('click', show);
  close?.addEventListener('click', hide);

  // Clicking the backdrop closes; clicking the panel itself must not.
  modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) hide();
  });

  copy?.addEventListener('click', () => {
    field.select();

    // The clipboard API needs a secure context and a permission that an
    // itch.io iframe may not grant. The selection above is the fallback:
    // worst case the text is already highlighted for a manual copy.
    navigator.clipboard?.writeText(field.value).then(
      () => say('Copied to the clipboard.'),
      () => say('Could not copy automatically -- the code is selected, press Ctrl+C.', true)
    );
  });

  load?.addEventListener('click', () => {
    if (!confirm('Load this save code? Your current character will be replaced.')) return;

    say('Loading...');
    game.importSave(field.value).then(
      () => {
        // Usually unreachable: a successful import reloads the page. It only
        // resolves here when storage is blocked and the save was applied to
        // the running world instead, which the player should be told about.
        hide();
        alert('Save loaded. This browser is blocking storage, so keep that ' +
              'code -- closing the tab will lose this character again.');
      },
      (err: unknown) => {
        say(err instanceof Error ? err.message : 'That save code could not be read.', true);
      }
    );
  });
}
