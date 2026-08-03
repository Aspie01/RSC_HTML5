// Build the itch.io upload archive.
//
//   npm run pack
//
// Writes release/<name>-<version>.zip with index.html at the ROOT of the
// archive, which is what itch.io requires -- a zip containing a `dist/` folder
// serves a directory listing instead of the game.
//
// This exists as a script rather than a documented shell command because of a
// specific trap: PowerShell's Compress-Archive writes entry names with
// BACKSLASHES, which the ZIP spec forbids. Some extractors cope, and some
// create a single file literally named `assets\index.js` -- at which point the
// page loads and every asset 404s, producing the blank screen that is the
// classic "worked locally, broken on itch" report. Writing the archive by hand
// keeps the separator correct on every platform.
//
// Deflate comes from node:zlib, so there is still no dependency to install.

import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** MS-DOS date/time, which is what a ZIP stores. Seconds have 2-second resolution. */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full, base)
      // Forward slashes, always -- see the note at the top of this file.
      : [{ full, name: relative(base, full).split('\\').join('/') }];
  });
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const raw = readFileSync(file.full);
    const deflated = deflateRawSync(raw, { level: 9 });

    // Never let "compression" make a file bigger; fall back to storing it.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;

    const name = Buffer.from(file.name, 'utf8');
    const { time, day } = dosTime(statSync(file.full).mtime);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);          // extra field length
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);        // extra
    central.writeUInt16LE(0, 32);        // comment
    central.writeUInt16LE(0, 34);        // disk number
    central.writeUInt16LE(0, 36);        // internal attrs
    central.writeUInt32LE(0, 38);        // external attrs
    central.writeUInt32LE(offset, 42);   // local header offset
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

const root = resolve(process.argv[2] ?? 'dist');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = join('release', `${pkg.name}-${pkg.version}.zip`);

const files = walk(root);
if (!files.some((f) => f.name === 'index.html')) {
  console.error(`No index.html at the root of ${root}. Run \`npm run build\` first.`);
  process.exit(1);
}

mkdirSync('release', { recursive: true });
writeFileSync(out, zip(files));

console.log(`${out}\n`);
for (const f of files) console.log(`  ${f.name}`);
console.log(`\n${(statSync(out).size / 1024).toFixed(0)} KB`);
