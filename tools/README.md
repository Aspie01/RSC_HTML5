# tools

Development-only. Nothing here ships in the bundle.

## Packing a release

```bash
npm run pack
```

Builds, then writes `release/thalren-vale-<version>.zip` with `index.html` at
the archive root — itch.io serves a directory listing instead of the game if it
is nested. Upload that zip, tick "This file will be played in the browser", and
set the embed to **960×600**.

Do not substitute `Compress-Archive`: it writes backslash separators, which the
ZIP spec forbids, and some extractors then create a file literally named
`assets\index.js`. Everything 404s and the page renders blank.

## Cross-origin embed harness

Reproduces the itch.io arrangement locally: a page on one origin embedding the
game, served from another, inside a sandboxed iframe. This is the setup that
breaks builds which work fine when opened directly, so run it before every
upload.

```bash
npm run build
```

Then, in two terminals:

```bash
npm run serve:game
```

```bash
npm run serve:harness
```

Open <http://localhost:4174/iframe-harness.html>. Two frames load the same
build, differing only in their `sandbox` attribute:

1. **storage allowed** (`allow-same-origin`) — the ordinary case. IndexedDB
   should be the active tier.
2. **storage denied** (no `allow-same-origin`) — the frame gets an opaque
   origin, so every storage API throws. The game must still be playable, must
   say that progress will not be saved, and must still export a save code.

### What to check

- Both frames render the start overlay and respond to a click.
- The game origin's request log shows `200` for `index.html` and both assets
  from **each** frame. A `404` here means an absolute path crept in; the fix is
  `base: './'` in `vite.config.ts`.
- Arrow keys and Page Down over the game do not scroll this page. The tall
  filler below the frames exists to make that visible.
- Frame 2 shows the blocked-storage warning in its chat log.

### A limit worth knowing

Frame 2 cannot be inspected from the harness, or from anywhere else. Its
opaque origin is the whole point of the test, and it also means no script
outside it can read it. Check that frame by looking at it. The storage
fallback logic itself is covered by stubbing `indexedDB` and `localStorage` to
throw, which simulates the same condition somewhere it can be observed.
