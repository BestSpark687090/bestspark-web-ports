// Mods added by the player: imported from .zip files or folders, kept in IndexedDB, and written
// into the in-memory mods folder at startup alongside the bundled mods.
import { unzipSync } from './vendor/fflate.js';

const DB_NAME = 'balatro-web-user-mods';
const STORE = 'mods';
const dec = new TextDecoder();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

// [{ name, files: { relativePath: Uint8Array }, size, added }]
export const listUserMods = () => tx('readonly', s => s.getAll());
export const saveUserMod = (mod) => tx('readwrite', s => s.put(mod));
export const deleteUserMod = (name) => tx('readwrite', s => s.delete(name));

// ---------------------------------------------------------------------------------------------
// Finding mods inside an import. A mod root is a folder holding Lovely patches (lovely.toml or a
// lovely/ folder), a Steamodded metadata .json (with main_file), or a Lua file with the legacy
// "--- STEAMODDED HEADER". The shallowest roots win, so a modpack folder holding several mods
// yields each of them, and a zip whose files sit at its top level is one mod.

function isModRoot(dir, entries) {
  const prefix = dir ? dir + '/' : '';
  for (const [path, data] of entries) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.includes('/')) {
      if (rest.startsWith('lovely/') && rest.endsWith('.toml')) return true;
      continue;
    }
    if (rest === 'lovely.toml') return true;
    if (rest.endsWith('.json')) {
      try { const j = JSON.parse(dec.decode(data)); if (j && j.main_file) return true; } catch { /* not metadata */ }
    }
    if (rest.endsWith('.lua') && dec.decode(data.subarray(0, 400)).includes('--- STEAMODDED HEADER')) return true;
  }
  return false;
}

// entries: [[path, Uint8Array]] with '/' separators. Returns [{ name, files }].
export function findMods(entries, fallbackName) {
  entries = entries.filter(([p]) => !p.endsWith('/') && !p.split('/').some(seg => seg === '__MACOSX' || seg === '.git'));
  const dirs = new Set(['']);
  for (const [p] of entries) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const sorted = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length);
  const roots = [];
  for (const d of sorted) {
    if (roots.some(r => r === '' || d.startsWith(r + '/'))) continue;
    if (isModRoot(d, entries)) roots.push(d);
  }
  return roots.map(root => {
    const prefix = root ? root + '/' : '';
    const files = {};
    let size = 0;
    for (const [p, data] of entries) {
      if (!p.startsWith(prefix)) continue;
      files[p.slice(prefix.length)] = data;
      size += data.length;
    }
    const name = (root ? root.split('/').pop() : fallbackName).replace(/[\\/:*?"<>|]/g, '_');
    return { name, files, size, added: Date.now() };
  });
}

export function modsFromZip(name, buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  return findMods(Object.entries(files), name.replace(/\.zip$/i, ''));
}

// Files from <input webkitdirectory> or a drop: each has webkitRelativePath / a path.
export async function modsFromFiles(fileList, fallbackName) {
  const entries = [];
  for (const { file, path } of fileList) entries.push([path, new Uint8Array(await file.arrayBuffer())]);
  return findMods(entries, fallbackName);
}

// Features the browser build can't provide, found by scanning the mod's Lua.
export function compatibilityNotes(files) {
  const notes = new Set();
  for (const [path, data] of Object.entries(files)) {
    if (!path.endsWith('.lua')) continue;
    const text = dec.decode(data);
    if (/love\.thread\.newThread/.test(text)) notes.add('uses threads (runs on the main thread here)');
    if (/ffi\.load\s*\(|ffi\.C\.\w+\s*\(/.test(text) && !/PHYSFS_/.test(text)) notes.add('calls native code through ffi');
    if (/require\s*\(?\s*['"](socket|luasteam|https?)['"]/.test(text)) notes.add('needs networking or Steam');
  }
  return [...notes];
}
