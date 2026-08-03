// A static file server, in one file with no dependencies.
//
// Exists so the iframe harness can put the game and the embedding page on two
// different ORIGINS. A port is part of an origin, so serving `dist` on one port
// and `tools` on another reproduces the itch.io arrangement -- a page on one
// host embedding a game served from another -- which is the only way to catch
// the class of bug that only appears after upload.
//
//   node tools/serve.mjs <directory> <port>

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  // Refuse anything that climbs out of the served directory.
  const target = join(root, normalize(path));
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // Logged because a cross-origin iframe cannot be inspected from the page
  // embedding it -- the request log is the only evidence available that the
  // frame fetched what it needed, and a 404 here is the classic symptom of an
  // absolute path that worked locally and breaks once uploaded.
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
    console.log(`200 ${path}`);
  } catch {
    res.writeHead(404).end('Not found');
    console.log(`404 ${path}`);
  }
}).listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port}`);
});
