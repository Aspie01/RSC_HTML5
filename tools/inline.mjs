// Fold the built CSS and JS into index.html, producing one self-contained file.
//
//   node tools/inline.mjs        (runs automatically as part of `npm run build`)
//
// This exists because a plain Vite build cannot be opened by double-clicking
// it, which is the first thing anyone does with a downloaded zip. Two separate
// mechanisms block it:
//
//   1. Vite marks both the script and the stylesheet `crossorigin`. Over
//      file:// the page's origin is opaque, so a CORS fetch is refused and the
//      stylesheet never loads -- the game renders as unstyled HTML.
//   2. `type="module"` is fetched with CORS semantics no matter what, so even
//      with the attribute stripped the bundle would not execute from file://.
//
// Inlining sidesteps both: an inline module is never fetched, so there is no
// request to refuse. It also removes the last way an asset path can be wrong,
// which is the single most common cause of a blank page after upload.
//
// The trade is one larger HTML file instead of three small ones. For a bundle
// this size that is a good trade, and it is one fewer round trip on load.

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const htmlPath = join(dist, 'index.html');

let html = readFileSync(htmlPath, 'utf8');

const script = /<script[^>]*src="\.\/([^"]+)"[^>]*><\/script>/;
const style = /<link[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/;

const consumed = [];

html = html.replace(style, (_, href) => {
  const css = readFileSync(join(dist, href), 'utf8');
  consumed.push(href);
  // A literal </style> inside the CSS would close the tag early. Vite will not
  // emit one, but escaping costs nothing and the failure would be baffling.
  return `<style>${css.replace(/<\/style>/gi, '<\\/style>')}</style>`;
});

html = html.replace(script, (_, src) => {
  let js = readFileSync(join(dist, src), 'utf8');
  consumed.push(src);

  // The sourcemap comment is now relative to the HTML, not to assets/.
  js = js.replace(/\/\/# sourceMappingURL=(.*)$/m, `//# sourceMappingURL=./assets/$1`);

  // Same reasoning as above: a "</script>" in any string literal would end the
  // block. This one is a real possibility in code that builds markup.
  return `<script type="module">${js.replace(/<\/script>/gi, '<\\/script>')}</script>`;
});

if (!consumed.length) {
  console.error('Nothing to inline -- did the build output change shape?');
  process.exit(1);
}

writeFileSync(htmlPath, html);

// Drop the now-unreferenced originals so the archive does not ship the payload
// twice. Sourcemaps stay: they are still pointed at, and never fetched unless
// devtools are open.
for (const file of consumed) {
  const path = join(dist, file);
  if (existsSync(path)) rmSync(path);
}

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`inlined ${consumed.join(', ')} -> index.html (${kb} KB)`);
