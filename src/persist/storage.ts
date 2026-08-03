/**
 * Where the save actually lives.
 *
 * This module owns storage and nothing else: it moves an opaque string in and
 * out of the best backing store the browser will give us. It knows nothing
 * about what the string contains. Serialisation and migration are the game's
 * business, not storage's.
 *
 * Three tiers, tried in order:
 *
 *   IndexedDB     Survives more aggressive cleanup than localStorage, and is
 *                 not subject to the ~5MB per-origin string quota.
 *   localStorage  Where saves lived before this module existed, and still the
 *                 fallback when IndexedDB is unavailable.
 *   memory        Keeps the session playable when both throw. Progress dies on
 *                 refresh, which is why manual export exists.
 *
 * The third tier is not paranoia. itch.io serves games from a sandboxed
 * iframe on a foreign origin, and a real fraction of players arrive with
 * storage blocked outright, private browsing on, or an extension that
 * partitions it. Those players still get a playable session and a save code
 * they can paste back in.
 */

const DB_NAME = 'rs_html5';
const DB_STORE = 'saves';
const DB_KEY = 'save';

/**
 * The localStorage key predates this module. The `_v1` is part of the key's
 * name, not the save format version -- renaming it would orphan every save
 * already on a player's machine.
 */
const LS_KEY = 'rs_html5_save_v1';

/**
 * IndexedDB `open` can hang indefinitely rather than fail: Firefox in private
 * browsing historically never settled the request, and a blocked upgrade from
 * another tab does the same. Without a deadline the game would never boot.
 */
const OPEN_TIMEOUT_MS = 3000;

export type StoreKind = 'indexeddb' | 'localstorage' | 'memory';

export interface SaveStore {
  /** Which tier we ended up on. Surfaced to the player so a memory-only session is not a silent surprise. */
  readonly kind: StoreKind;
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
  clear(): Promise<void>;
}

// ----------------------------------------------------------------------
// IndexedDB
// ----------------------------------------------------------------------

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };

    const timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS);

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      clearTimeout(timer);
      finish(null);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => { clearTimeout(timer); finish(req.result); };
    req.onerror = () => { clearTimeout(timer); finish(null); };
    req.onblocked = () => { clearTimeout(timer); finish(null); };
  });
}

function idbRequest<T>(db: IDBDatabase, mode: IDBTransactionMode,
                       run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let req: IDBRequest<T>;
    try {
      req = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function tryIndexedDb(): Promise<SaveStore | null> {
  if (typeof indexedDB === 'undefined') return null;

  const db = await openDb();
  if (!db) return null;

  // An open database is not proof of a writable one; Safari's ITP and some
  // privacy extensions only fail at the first transaction. Prove it works
  // before committing the player's progress to it.
  try {
    await idbRequest(db, 'readonly', (s) => s.get(DB_KEY));
  } catch {
    db.close();
    return null;
  }

  return {
    kind: 'indexeddb',
    async read() {
      const value = await idbRequest<unknown>(db, 'readonly', (s) => s.get(DB_KEY));
      return typeof value === 'string' ? value : null;
    },
    async write(raw) {
      await idbRequest(db, 'readwrite', (s) => s.put(raw, DB_KEY));
    },
    async clear() {
      await idbRequest(db, 'readwrite', (s) => s.delete(DB_KEY));
    }
  };
}

// ----------------------------------------------------------------------
// localStorage
// ----------------------------------------------------------------------

function tryLocalStorage(): SaveStore | null {
  try {
    // Merely reading `localStorage` throws when cookies are blocked, and a
    // present-but-unwritable store is common enough to be worth a probe write.
    const probe = `${LS_KEY}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    return null;
  }

  return {
    kind: 'localstorage',
    async read() { return localStorage.getItem(LS_KEY); },
    async write(raw) { localStorage.setItem(LS_KEY, raw); },
    async clear() { localStorage.removeItem(LS_KEY); }
  };
}

// ----------------------------------------------------------------------
// Memory
// ----------------------------------------------------------------------

function memoryStore(): SaveStore {
  let held: string | null = null;
  return {
    kind: 'memory',
    async read() { return held; },
    async write(raw) { held = raw; },
    async clear() { held = null; }
  };
}

// ----------------------------------------------------------------------
// Opening
// ----------------------------------------------------------------------

/**
 * Pick the best available store, and carry an existing save up to it.
 *
 * The adoption step matters on this change specifically: every save in the
 * wild today is in localStorage, and promoting IndexedDB to primary without
 * it would read an empty database and look exactly like a wiped character.
 * It is written generally rather than as a one-off because the same thing
 * happens to any player whose IndexedDB is cleared while localStorage is not.
 */
export async function openSaveStore(): Promise<SaveStore> {
  const idb = await tryIndexedDb();
  const ls = tryLocalStorage();

  const primary = idb ?? ls ?? memoryStore();
  const fallbacks = [idb, ls].filter(
    (s): s is SaveStore => s !== null && s !== primary
  );

  let existing: string | null = null;
  try {
    existing = await primary.read();
  } catch {
    // A store that cannot be read cannot be trusted to be written either, but
    // demoting it here would strand the save it may still hold. Treat it as
    // empty and let the write path report its own failures.
  }

  if (existing === null) {
    for (const store of fallbacks) {
      let inherited: string | null = null;
      try {
        inherited = await store.read();
      } catch { continue; }

      if (inherited !== null) {
        try { await primary.write(inherited); } catch { /* best effort */ }
        break;
      }
    }
  }

  return {
    kind: primary.kind,
    read: () => primary.read(),
    write: (raw) => primary.write(raw),

    // Clearing has to reach every tier, not just the primary. A reset that
    // wiped IndexedDB alone would leave the old localStorage copy behind for
    // the adoption step above to promote straight back on the next boot --
    // a delete that visibly undoes itself.
    async clear() {
      for (const store of [primary, ...fallbacks]) {
        try { await store.clear(); } catch { /* best effort */ }
      }
    }
  };
}
