// Page-side runtime: unpacks bundled mods into the in-memory filesystem, runs the Lovely patch
// engine, and answers requests from the game's Lua side (lua/lovely_web.lua). Lua sends a
// request by writing /tmp/lovely_in and calling love.system.openURL('lovely:<cmd>'), which
// love.js executes synchronously as window.open(); the reply goes to /tmp/lovely_out.
import { parse as parseToml } from './vendor/smol-toml/index.js';
import { Lovely, LOVELY_VERSION } from './lovely-engine.js';
import { lowerLua } from './lua-lower.js';
import { zipSync } from './vendor/fflate.js';

const MOD_DIR = '/mods';
const IN = '/tmp/lovely_in', OUT = '/tmp/lovely_out';
const STATE_KEY = 'balatro-web:mod-state';
// The web runtime's own Lua (lua/): stands in for native code, so it is never comparison-rewritten.
const RUNTIME_FILES = new Set(['web_compat', 'compare_web', 'lovely_web', 'ffi_web', 'nativefs_web', 'random_web', 'fs_guard_web'].map(n => `@${n}.lua`));
// Hot per-frame engine files that only compare positions, sizes, timers and input state, never
// score values (no mod patches score code into them). Skipping the comparison rewrite here is a
// large part of its cost. engine/event.lua, ui.lua and text.lua do see big numbers, so they keep it.
const NATIVE_COMPARE_FILES = new Set(['moveable', 'node', 'sprite', 'animatedsprite', 'particles', 'controller'].map(n => `@engine/${n}.lua`));
const enc = new TextEncoder(), dec = new TextDecoder();

const log = (...a) => console.log('[lovely]', ...a);
const DEBUG = new URLSearchParams(location.search).has('debug');

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

// mods.pack: uint32 header length, JSON header [{path, size}], then file bytes back to back.
function packHeader(buffer) {
  const headerLen = new DataView(buffer).getUint32(0, true);
  return { files: JSON.parse(dec.decode(new Uint8Array(buffer, 4, headerLen))), headerLen };
}

// Top-level mod folders in the bundled pack, with their total size
export function packMods(buffer) {
  const mods = new Map();
  for (const { path, size } of packHeader(buffer).files) {
    if (!path.includes('/')) continue; // loose files in mods/ aren't mods
    const name = path.split('/')[0];
    mods.set(name, (mods.get(name) || 0) + size);
  }
  return [...mods].map(([name, size]) => ({ name, size }));
}

function unpack(FS, buffer) {
  const { files, headerLen } = packHeader(buffer);
  let offset = 4 + headerLen;
  for (const { path, size } of files) {
    const full = `${MOD_DIR}/${path}`;
    mkdirp(FS, full.slice(0, full.lastIndexOf('/')));
    FS.writeFile(full, new Uint8Array(buffer, offset, size));
    offset += size;
  }
  return files.length;
}

function mkdirp(FS, dir) {
  let cur = '';
  for (const part of dir.split('/').filter(Boolean)) {
    cur += '/' + part;
    try { FS.mkdir(cur); } catch (e) { /* exists */ }
  }
}

const statOf = (FS, p) => { try { return FS.stat(p); } catch { return null; } };

function fsAdapter(FS) {
  return {
    listDir: (p) => FS.readdir(p).filter(n => n !== '.' && n !== '..'),
    isDir: (p) => { const s = statOf(FS, p); return !!s && FS.isDir(s.mode); },
    isFile: (p) => { const s = statOf(FS, p); return !!s && FS.isFile(s.mode); },
    readText: (p) => FS.readFile(p, { encoding: 'utf8' }),
  };
}

// Enabled/disabled mods live in the filesystem (lovely/blacklist.txt, <mod>/.lovelyignore), which is
// rebuilt on every page load, so remember them across reloads.
function saveModState(FS) {
  const fs = fsAdapter(FS);
  const bl = `${MOD_DIR}/lovely/blacklist.txt`;
  const state = {
    blacklist: fs.isFile(bl) ? fs.readText(bl) : null,
    ignored: fs.listDir(MOD_DIR).filter(n => fs.isFile(`${MOD_DIR}/${n}/.lovelyignore`)),
    known: readModState().known,
  };
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// A game 'restart' (e.g. Steamodded temporarily disabling conflicting mods) is a page reload here.
// Desktop Lovely restarts in-process, keeping its variables and patch table, so carry those over
// the reload; the next load also skips the mod manager, like a desktop restart would.
const RESTART_KEY = 'balatro-web:restart';
export function pendingRestart() {
  try { return JSON.parse(sessionStorage.getItem(RESTART_KEY) || 'null'); } catch { return null; }
}
function takeRestart() {
  const info = pendingRestart();
  try { sessionStorage.removeItem(RESTART_KEY); } catch { /* storage unavailable */ }
  return info;
}

// The saved state, also edited by the mod manager: { blacklist, ignored: [disabled mod folders] }
export function readModState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || { blacklist: null, ignored: [] }; } catch { return { blacklist: null, ignored: [] }; }
}
// Steamodded's in-game mod menu disables a mod by adding its folder name to lovely/blacklist.txt;
// Lovely also honours <mod>/.lovelyignore. A mod is off if either says so.
const blacklistNames = (text) => (text || '').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
export function disabledMods(state = readModState()) {
  return new Set([...(state.ignored || []), ...blacklistNames(state.blacklist)]);
}
// Mods start disabled the first time they're seen (Steamodded is always on); after that the
// player's choice sticks. Pass enabled = true for mods the player just added themselves.
export function applyModDefaults(names, enabled = false) {
  const state = readModState();
  const known = new Set(state.known || []);
  const ignored = new Set(state.ignored || []);
  const fresh = names.filter(n => !known.has(n));
  if (!fresh.length) return;
  for (const name of fresh) {
    known.add(name);
    if (!enabled && name !== 'smods') ignored.add(name);
  }
  state.known = [...known];
  state.ignored = [...ignored];
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
export function setModEnabled(name, enabled) {
  const state = readModState();
  const ignored = new Set(state.ignored || []);
  if (enabled) {
    ignored.delete(name);
    if (state.blacklist != null) state.blacklist = state.blacklist.split(/\r?\n/).filter(l => l !== name).join('\n');
  } else ignored.add(name);
  state.ignored = [...ignored];
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function rmrf(FS, path) {
  const s = statOf(FS, path);
  if (!s) return;
  if (FS.isDir(s.mode)) {
    for (const n of FS.readdir(path)) if (n !== '.' && n !== '..') rmrf(FS, `${path}/${n}`);
    FS.rmdir(path);
  } else FS.unlink(path);
}

// Mods the player added (see mod-store.js); one with the same folder name as a bundled mod replaces it.
function writeUserMods(FS, userMods) {
  let count = 0;
  for (const mod of userMods) {
    const dir = `${MOD_DIR}/${mod.name}`;
    rmrf(FS, dir);
    for (const [path, data] of Object.entries(mod.files)) {
      const full = `${dir}/${path}`;
      mkdirp(FS, full.slice(0, full.lastIndexOf('/')));
      FS.writeFile(full, data);
      count++;
    }
  }
  return count;
}

function restoreModState(FS) {
  let state;
  try { state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { state = null; }
  if (!state) return;
  if (state.blacklist != null) { mkdirp(FS, `${MOD_DIR}/lovely`); FS.writeFile(`${MOD_DIR}/lovely/blacklist.txt`, state.blacklist); }
  for (const name of state.ignored || []) {
    if (statOf(FS, `${MOD_DIR}/${name}`)) FS.writeFile(`${MOD_DIR}/${name}/.lovelyignore`, '');
  }
}

function setup(Module, pack, webPatches, userMods) {
  const FS = Module.FS;
  mkdirp(FS, MOD_DIR);
  mkdirp(FS, `${MOD_DIR}/lovely`); // exists on desktop (Lovely's own folder); Steamodded writes blacklist.txt there
  if (pack) log(`unpacked ${unpack(FS, pack)} mod files into ${MOD_DIR}`);
  if (userMods.length) log(`added ${userMods.length} player mod(s), ${writeUserMods(FS, userMods)} files`);
  applyModDefaults([...(pack ? packMods(pack) : []), ...userMods].map(m => m.name));
  restoreModState(FS);

  const restart = takeRestart();
  const luaVars = (restart && restart.vars) || {};
  if (restart) log('continuing after a game restart', restart.excluded && restart.excluded.length ? `(leaving out ${restart.excluded.join(', ')})` : '');

  const lovely = new Lovely({
    fs: fsAdapter(FS), modDir: MOD_DIR, parseToml,
    builtins: [{ name: 'web-patches.toml', content: webPatches }],
    extraBlacklist: (restart && restart.excluded) || [],
    log: () => {}, warn: (w) => console.warn(w),
  });
  log(`${lovely.patches.length} patches, ${lovely.targets.size} targets`);

  // Mods that give cdata metatypes (e.g. Amulet's big numbers) compare them with plain numbers,
  // which PUC Lua can't do natively. Only then are comparisons rewritten, since it costs speed.
  const fsa = fsAdapter(FS);
  const usesMetatype = (dir) => fsa.listDir(dir).some(name => {
    const p = `${dir}/${name}`;
    if (fsa.isDir(p)) return usesMetatype(p);
    return name.endsWith('.lua') && /\bmetatype\s*\(/.test(fsa.readText(p));
  });
  // ?nocompare turns the rewrite off (for measuring its cost; mixed cdata comparisons will then fail)
  const compare = usesMetatype(MOD_DIR) && !new URLSearchParams(location.search).has('nocompare');
  if (compare) log('a mod uses ffi.metatype: comparisons will be routed through cdata-aware helpers');

  const index = () => [
    `D\t${MOD_DIR}`, `V\t${LOVELY_VERSION}`, `C\t${compare ? 1 : 0}`,    ...[...lovely.targets].map(t => `T\t${t}`),
    ...lovely.modules().map(m => `M\t${m.name}\t${m.before ?? ''}\t${m.load_now ? 1 : 0}`),
  ].join('\n');

  const lower = (text, name) => {
    // The web runtime's own Lua stands in for C code, so its comparisons stay native
    const runtime = RUNTIME_FILES.has(name) || NATIVE_COMPARE_FILES.has(name);
    try { return lowerLua(text, name, { compare: compare && !runtime }); } catch (e) { console.error(e.message); return text; }
  };

  const handlers = {
    init: () => index(),
    reload: () => { lovely.reload(); return index(); },
    load: (name, text) => lower(lovely.applyPatches(name, text), name),
    patch: (name, text) => lovely.applyPatches(name, text),
    module: (name) => {
      const m = lovely.modules().find(x => x.name === name);
      if (!m) throw new Error(`No module patch named ${name}`);
      const chunk = lovely.moduleChunkName(m);
      return chunk + '\0' + lower(lovely.applyPatches(chunk, m.content), chunk);
    },
    list: (path) => (statOf(FS, path) ? fsAdapter(FS).listDir(path).join('\n') : ''),
    info: (path) => {
      const s = statOf(FS, path);
      if (!s) return '';
      return `${FS.isDir(s.mode) ? 'directory' : 'file'}\t${s.size}\t${Math.floor(s.mtime.getTime() / 1000)}`;
    },
    mkdir: (path) => { mkdirp(FS, path); return ''; },
    remove: (path) => {
      const s = statOf(FS, path);
      if (!s) throw new Error('not found');
      if (FS.isDir(s.mode)) FS.rmdir(path); else FS.unlink(path);
      return '';
    },
    // Pack a directory into an uncompressed zip so love.filesystem can mount it (ffi PHYSFS_mount).
    // Compile a vertex/pixel GLSL pair in a separate WebGL 1 context. LÖVE's own compile (and
    // validateShader) throw C++ exceptions on failure, which corrupt love.js's memory.
    glslcheck: (vertex, pixel) => {
      const gl = glslContext || (glslContext = document.createElement('canvas').getContext('webgl'));
      if (!gl) return ''; // no way to check; let LÖVE try
      const compile = (type, src, label) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
        const log = gl.getShaderInfoLog(s);
        if (!ok) { gl.deleteShader(s); throw new Error(`Cannot compile ${label} shader code:\n${log}`); }
        return s;
      };
      // A shader may define only one stage; LÖVE supplies its default for the other
      const vs = vertex ? compile(gl.VERTEX_SHADER, vertex, 'vertex') : null;
      let fs = null;
      try { fs = pixel ? compile(gl.FRAGMENT_SHADER, pixel, 'pixel') : null; } catch (e) { if (vs) gl.deleteShader(vs); throw e; }
      if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return ''; }
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      if (!linked) throw new Error(`Cannot link shader program:\n${log}`);
      return '';
    },
    zipdir: (dir) => {
      const s = statOf(FS, dir);
      if (!s || !FS.isDir(s.mode)) throw new Error(`not a directory: ${dir}`);
      const files = {};
      const add = (p, rel) => {
        for (const name of fsAdapter(FS).listDir(p)) {
          const full = `${p}/${name}`, st = statOf(FS, full);
          if (FS.isDir(st.mode)) add(full, `${rel}${name}/`);
          else files[rel + name] = [FS.readFile(full), { level: 0 }];
        }
      };
      add(dir, '');
      const out = `/tmp/lovely_mount_${Date.now()}.zip`;
      FS.writeFile(out, zipSync(files));
      return out;
    },
    setvar: (k, v) => { luaVars[k] = v; return ''; },
    getvar: (k) => (k in luaVars ? 'v' + luaVars[k] : ''),
    removevar: (k) => { if (!(k in luaVars)) return ''; const v = luaVars[k]; delete luaVars[k]; return 'v' + v; },
    restart: () => {
      // Snapshot when the page actually reloads: Steamodded updates the patch table (via
      // reload_patches) after asking to restart, within the same frame.
      setTimeout(() => {
        saveModState(FS);
        try { sessionStorage.setItem(RESTART_KEY, JSON.stringify({ vars: luaVars, excluded: lovely.blacklisted })); } catch { /* storage unavailable */ }
        location.reload();
      }, 0);
      return '';
    },
    quit: ()=>{
      let why = document.createElement("img")
      why.src='./quit_attempt.png'
      why.style.display="flex";
      why.style.zIndex = '255';
      why.style.position = "absolute";
      why.style.alignSelf = "center";
      why.style.justifySelf = "center",
      why.style.top = "calc(50% - 167px)"
      why.style.alignItems = "center"
      why.style.justifyContent = "center";
      why.style.scale = 3
      document.body.appendChild(why);
      setTimeout(function(){
        why.remove();
      },3000)
      /**
       * display: 'flex',
zIndex: '255',
position: 'absolute',
alignSelf: 'center',
justifySelf: 'center',
top: 'calc(50% - 167px)',
alignItems: 'center',
justifyContent: 'center',
scale: '3'
       */
    }
  };

  const bridgeStats = {};
  let glslContext = null;
  if (DEBUG) {
    setInterval(() => {
      const top = Object.entries(bridgeStats).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (top.length) log('bridge calls (last 5s):', top.map(([k, v]) => `${k} x${v}`).join(' | '));
      for (const k in bridgeStats) delete bridgeStats[k];
    }, 5000);
  }

  const realOpen = window.open;
  window.open = function (url, ...rest) {
    if (typeof url !== 'string' || !url.startsWith('lovely:')) return realOpen.call(window, url, ...rest);
    const cmd = url.slice('lovely:'.length);
    let reply;
    try {
      const args = dec.decode(FS.readFile(IN)).split('\0');
      if (DEBUG && cmd !== 'info' && cmd !== 'list') log('bridge', cmd, (args[0] || '').slice(0, 120));
      if (DEBUG) {
        // Per-command call counts and time, logged every 5 seconds
        const key = cmd === 'load' || cmd === 'patch' ? `${cmd} ${(args[0] || '').slice(0, 60)}` : cmd;
        bridgeStats[key] = (bridgeStats[key] || 0) + 1;
      }
      if (!handlers[cmd]) throw new Error(`Unknown lovely command ${cmd}`);
      reply = '1' + handlers[cmd](...args);
    } catch (e) {
      // Removing a file that isn't there is routine (nativefs reports false), not worth logging
      if (!(cmd === 'remove' && e && e.message === 'not found')) console.error(`[lovely] ${cmd}:`, e);
      reply = '0' + (e && e.message || String(e));
    }
    FS.writeFile(OUT, enc.encode(reply));
    return null;
  };

  // love.js only persists the save directory when the page unloads; also sync periodically.
  setInterval(() => { try { FS.syncfs(false, () => {}); } catch { /* not mounted yet */ } }, 10000);
}

export const fetchPack = () => fetch('mods.pack').then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);

// opts.pack: the bundled mods (fetched here if not given); opts.userMods: from mod-store.js
export async function boot(Module, opts = {}) {
  const [pack, webPatches] = await Promise.all([
    opts.pack !== undefined ? opts.pack : fetchPack(),
    fetch('web-patches.toml').then(r => r.text()),
  ]);
  const userMods = opts.userMods || [];
  Module.preRun = [...(Module.preRun || []), () => setup(Module, pack, webPatches, userMods)];
  await loadScript('game.js');
  await loadScript('love.js');
  window.Love(Module);
}
