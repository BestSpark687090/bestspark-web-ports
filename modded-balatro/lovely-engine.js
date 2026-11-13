// A JavaScript port of Lovely's patch engine (https://github.com/ethangreen-dev/lovely-injector,
// crates/lovely-core/src/patch). Behaviour mirrors Lovely 0.10: same patch discovery order,
// priorities, pattern/regex/copy/module semantics and var interpolation. Runs in Node (build-time
// checks) and in the browser (runtime patching for love.js).

export const LOVELY_VERSION = '0.10.0';

// ---------------------------------------------------------------------------------------------
// Filesystem abstraction: { listDir(path) -> names[], isDir(path), isFile(path), readText(path) }
// Paths are POSIX style; joins use '/'.
const join = (...parts) => parts.join('/').replace(/\/+/g, '/');
const baseName = (p) => p.replace(/\/+$/, '').split('/').pop();
const lowerName = (p) => baseName(p).toLowerCase();
const byFileName = (a, b) => { const x = lowerName(a), y = lowerName(b); return x < y ? -1 : x > y ? 1 : 0; };
const stableSortBy = (arr, key) => arr.map((v, i) => [v, i]).sort((a, b) => (key(a[0]) - key(b[0])) || (a[1] - b[1])).map(x => x[0]);

// Rust's str::lines(): split on \n, strip a trailing \r, no trailing empty line.
function rustLines(s) {
  if (s === '') return [];
  const parts = s.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map(l => l.endsWith('\r') ? l.slice(0, -1) : l);
}

// Rust's str::split_inclusive('\n'): native split, then the newlines added back.
// This is also how a rope's lines are seen (crop's raw_lines: breaks kept, no trailing empty line).
function splitInclusive(s) {
  if (s === '') return [];
  const parts = s.split('\n');
  const last = parts.pop();
  for (let i = 0; i < parts.length; i++) parts[i] += '\n';
  if (last !== '') parts.push(last);
  return parts;
}

// The text being patched. Pattern patches work on lines, regex/copy patches on the whole string.
// Each form (and the trimmed lines used for matching) is built on demand and cached until a patch
// changes the text, so consecutive pattern patches don't re-split and re-trim the file.
class Doc {
  constructor(text) { this.text = text; this.lines = null; this.trimmed = null; }
  getText() { if (this.text === null) this.text = this.lines.join(''); return this.text; }
  getLines() { if (this.lines === null) this.lines = splitInclusive(this.text); return this.lines; }
  getTrimmed() { if (this.trimmed === null) this.trimmed = this.getLines().map(l => l.trim()); return this.trimmed; }
  setText(t) { this.text = t; this.lines = null; this.trimmed = null; }
  setLines(lines, trimmed = null) { this.lines = lines; this.text = null; this.trimmed = trimmed; }
}

const isWordChar = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);

// ---------------------------------------------------------------------------------------------
// WildMatch: '*' = any run of characters, '?' = exactly one character, full match.
function wildMatcher(pattern) {
  if (!pattern.includes('*') && !pattern.includes('?')) return (s) => s === pattern;
  const re = new RegExp('^' + [...pattern].map(c => c === '*' ? '[\\s\\S]*' : c === '?' ? '[\\s\\S]' : c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('') + '$');
  return (s) => re.test(s);
}

// ---------------------------------------------------------------------------------------------
// Rust regex syntax -> JS RegExp
const POSIX_CLASSES = {
  alnum: '0-9A-Za-z', alpha: 'A-Za-z', ascii: '\\x00-\\x7F', blank: '\\t ', cntrl: '\\x00-\\x1F\\x7F',
  digit: '0-9', graph: '!-~', lower: 'a-z', print: ' -~', punct: '!-\\/:-@\\[-`{-~', space: '\\t\\n\\v\\f\\r ',
  upper: 'A-Z', word: '0-9A-Za-z_', xdigit: '0-9A-Fa-f',
};

export function rustRegexToJs(pattern, verbose = false) {
  let flags = 'gmd';
  let p = pattern;
  // Leading inline flag groups such as (?x) or (?is)
  for (;;) {
    const m = /^\(\?([a-zA-Z]+)\)/.exec(p);
    if (!m) break;
    for (const f of m[1]) {
      if (f === 'x') verbose = true;
      else if (f === 'i' && !flags.includes('i')) flags += 'i';
      else if (f === 's' && !flags.includes('s')) flags += 's';
    }
    p = p.slice(m[0].length);
  }
  let out = '';
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') {
      const n = p[i + 1];
      if (!inClass && n === 'A') { out += '(?<![\\s\\S])'; i++; continue; }
      if (!inClass && n === 'z') { out += '(?![\\s\\S])'; i++; continue; }
      out += c + (n ?? ''); i++; continue;
    }
    if (inClass) {
      if (c === '[' && p[i + 1] === ':') {
        const end = p.indexOf(':]', i + 2);
        if (end > 0) {
          let name = p.slice(i + 2, end), neg = false;
          if (name.startsWith('^')) { neg = true; name = name.slice(1); }
          if (POSIX_CLASSES[name] && !neg) { out += POSIX_CLASSES[name]; i = end + 1; continue; }
        }
      }
      if (c === ']') inClass = false;
      out += c;
      continue;
    }
    if (c === '[') {
      inClass = true; out += c;
      if (p[i + 1] === '^') { out += '^'; i++; }
      if (p[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (verbose && /\s/.test(c)) continue;
    if (verbose && c === '#') { while (i < p.length && p[i] !== '\n') i++; continue; }
    if (c === '(' && p.startsWith('(?P<', i)) { out += '(?<'; i += 3; continue; }
    out += c;
  }
  // Patterns that start with optional indentation and then '.*' (common in Lovely patches) can't
  // cross a newline before their first literal, so the leftmost match always begins at a line
  // start. Anchoring them there gives identical matches; it only spares JS's backtracking engine
  // from retrying the pattern at every character (Rust's regex engine doesn't need this).
  if (/^(?:\(\?<\w+>\[\\t \]\*\)|\[\\t \]\*)?\.\*/.test(out)) out = '^' + out;
  return new RegExp(out, flags);
}

// Map named capture groups to their numeric index by scanning the (JS) regex source.
function groupNames(src) {
  const names = new Map();
  let idx = 0, inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (src[i + 1] !== '?') { idx++; continue; }
    const m = /^\(\?<([A-Za-z_][A-Za-z0-9_]*)>/.exec(src.slice(i));
    if (m) { idx++; names.set(m[1], idx); }
  }
  return names;
}

// regex-automata's interpolate::string
function interpolate(replacement, append, nameToIndex) {
  let dst = '';
  let rep = replacement;
  const validCap = (c) => /[0-9A-Za-z_]/.test(c);
  while (rep.length) {
    const i = rep.indexOf('$');
    if (i < 0) break;
    dst += rep.slice(0, i);
    rep = rep.slice(i);
    if (rep[1] === '$') { dst += '$'; rep = rep.slice(2); continue; }
    let cap = null, end = 0;
    if (rep[1] === '{') {
      const close = rep.indexOf('}', 2);
      if (close > 2) { cap = rep.slice(2, close); end = close + 1; }
    } else {
      let e = 1;
      while (e < rep.length && validCap(rep[e])) e++;
      if (e > 1) { cap = rep.slice(1, e); end = e; }
    }
    if (cap === null) { dst += '$'; rep = rep.slice(1); continue; }
    rep = rep.slice(end);
    if (/^\d+$/.test(cap)) dst += append(parseInt(cap, 10));
    else { const idx = nameToIndex(cap); if (idx !== undefined) dst += append(idx); }
  }
  return dst + rep;
}

// ---------------------------------------------------------------------------------------------
const targetsOf = (t) => Array.isArray(t) ? t : [t];

function applyPattern(patch, target, doc, warn) {
  const patLines = rustLines(patch.pattern).map(l => l.trim());
  const wm = patLines.map(wildMatcher);
  if (!wm.length) { warn(`Pattern on target '${target}' has no lines`); return; }
  const lines = doc.getLines();
  const trimmed = doc.getTrimmed();
  // A first line without wildcards can be found with the native array search
  const first = patLines[0];
  const literalFirst = !first.includes('*') && !first.includes('?');
  let matches = [];
  let idx = 0;
  while (idx + wm.length <= lines.length) {
    if (literalFirst) {
      idx = trimmed.indexOf(first, idx);
      if (idx < 0 || idx + wm.length > lines.length) break;
    }
    let ok = true;
    for (let k = literalFirst ? 1 : 0; k < wm.length; k++) if (!wm[k](trimmed[idx + k])) { ok = false; break; }
    if (ok) {
      const indent = patch.match_indent ? /^[ \t]*/.exec(lines[idx])[0] : '';
      matches.push([idx, indent]);
      idx += wm.length;
    } else idx++;
  }
  if (!matches.length) { warn(`Pattern '${patch.pattern}' on target '${target}' resulted in no matches`); return; }
  if (patch.times != null && matches.length !== patch.times) {
    warn(`Pattern '${patch.pattern}' on target '${target}' resulted in ${matches.length} matches, wanted ${patch.times}`);
    if (matches.length > patch.times) matches = matches.slice(0, patch.times);
  }
  // Build the new lines and their trimmed forms together, reusing the trimmed form of every
  // unchanged line instead of re-trimming the whole file.
  const out = [], outTrimmed = [];
  const keep = (i) => { out.push(lines[i]); outTrimmed.push(trimmed[i]); };
  const add = (l) => { out.push(l); outTrimmed.push(l.trim()); };
  let cursor = 0;
  for (const [lineIdx, indent] of matches) {
    let payload = splitInclusive(patch.payload).map(x => indent + x).join('');
    if (!patch.payload.endsWith('\n')) payload += '\n';
    const payloadLines = splitInclusive(payload);
    for (let i = cursor; i < lineIdx; i++) keep(i);
    if (patch.position === 'before') {
      payloadLines.forEach(add);
      for (let i = 0; i < wm.length; i++) keep(lineIdx + i);
    } else if (patch.position === 'after') {
      for (let i = 0; i < wm.length; i++) keep(lineIdx + i);
      payloadLines.forEach(add);
    } else {
      payloadLines.forEach(add);
    }
    cursor = lineIdx + wm.length;
  }
  for (let i = cursor; i < lines.length; i++) keep(i);
  // A last line without a newline followed by inserted text joins into one line, as in the rope
  for (let i = out.length - 2; i >= 0; i--) {
    if (!out[i].endsWith('\n')) {
      out[i] += out[i + 1]; out.splice(i + 1, 1);
      outTrimmed[i] = out[i].trim(); outTrimmed.splice(i + 1, 1);
    }
  }
  doc.setLines(out, outTrimmed);
}

function applyRegex(patch, target, text, warn) {
  const re = rustRegexToJs(patch.pattern, !!patch.verbose);
  const names = groupNames(re.source);
  let caps = [...text.matchAll(re)];
  if (!caps.length) { warn(`Regex '${patch.pattern}' on target '${target}' resulted in no matches`); return text; }
  if (patch.times != null && caps.length !== patch.times) {
    warn(`Regex '${patch.pattern}' on target '${target}' resulted in ${caps.length} matches, wanted ${patch.times}`);
    if (caps.length > patch.times) caps = caps.slice(0, patch.times);
  }
  let rope = text;
  let delta = 0;
  for (const m of caps) {
    const span = (i) => m.indices[i];
    const groupText = (i) => { const s = span(i); return s ? rope.slice(s[0] + delta, s[1] + delta) : ''; };
    const nameToIndex = (name) => names.get(name);
    const linePrepend = interpolate(patch.line_prepend || '', groupText, nameToIndex);

    const groupName = String(patch.root_capture ?? '0').replace(/\$/g, '');
    let tspan;
    if (/^\d+$/.test(groupName)) tspan = span(parseInt(groupName, 10));
    else tspan = m.indices.groups && m.indices.groups[groupName];
    if (!tspan) throw new Error(`The capture group '${groupName}' could not be found with the Regex '${patch.pattern}' (target ${target})`);
    const tStart = tspan[0] + delta, tEnd = tspan[1] + delta;

    const prepended = splitInclusive(patch.payload).map(x => linePrepend + x).join('');
    let payload = interpolate(prepended, groupText, nameToIndex);

    if (/^[A-Za-z0-9_]/.test(payload)) {
      const pre = patch.position === 'after' ? tEnd : tStart;
      if (pre > 0 && isWordChar(rope[pre - 1])) payload = ' ' + payload;
    }
    if (/[A-Za-z0-9_]$/.test(payload)) {
      const post = patch.position === 'before' ? tStart : tEnd;
      if (post < rope.length && isWordChar(rope[post])) payload += ' ';
    }

    if (patch.position === 'before') { rope = rope.slice(0, tStart) + payload + rope.slice(tStart); delta += payload.length; }
    else if (patch.position === 'after') { rope = rope.slice(0, tEnd) + payload + rope.slice(tEnd); delta += payload.length; }
    else { rope = rope.slice(0, tStart) + payload + rope.slice(tEnd); delta += payload.length - (tEnd - tStart); }
  }
  return rope;
}

function applyCopy(patch, text) {
  let rope = text;
  const payloads = [...patch.contents, ...(patch.payload != null ? [patch.payload] : [])];
  for (const content of payloads) {
    if (patch.position === 'prepend') rope = content + '\n' + rope;
    else rope = rope + '\n' + content;
  }
  return rope;
}

// ---------------------------------------------------------------------------------------------
export class Lovely {
  // builtins: [{ name, content }] patch files that always apply, after all mods.
  // extraBlacklist: mod folders to leave out on the first load only (carries a desktop Lovely
  // patch-table state across the page reload that stands in for an in-process restart).
  constructor({ fs, modDir, parseToml, builtins = [], extraBlacklist = [], log = console.log, warn = console.warn }) {
    this.fs = fs;
    this.builtins = builtins;
    this.extraBlacklist = extraBlacklist;
    this.modDir = modDir.replace(/\/+$/, '');
    this.parseToml = parseToml;
    this.log = log;
    this.warnFn = warn;
    this.reload();
  }

  reload() {
    const { fs, modDir } = this;
    this.patches = [];     // { kind, patch, priority, file }
    this.targets = new Set();
    this.vars = {};
    const blacklist = new Set(this.extraBlacklist);
    this.extraBlacklist = [];
    const blFile = join(modDir, 'lovely', 'blacklist.txt');
    if (fs.isFile(blFile)) for (const line of fs.readText(blFile).split(/\r?\n/)) if (line && !line.startsWith('#')) blacklist.add(line);
    this.blacklisted = [...blacklist];

    const entries = !fs.isDir(modDir) ? [] : fs.listDir(modDir).filter(n => !blacklist.has(n)).map(n => join(modDir, n));
    const dirs = entries.filter(p => fs.isDir(p) && !fs.isFile(join(p, '.lovelyignore'))).sort(byFileName);

    for (const dir of dirs) {
      const tomls = [];
      if (fs.isFile(join(dir, 'lovely.toml'))) tomls.push(join(dir, 'lovely.toml'));
      const lovelyDir = join(dir, 'lovely');
      if (fs.isDir(lovelyDir)) tomls.push(...this.walk(lovelyDir).filter(p => p.endsWith('.toml')).sort(byFileName));
      for (const toml of tomls) this.loadPatchFile(toml, dir);
    }
    for (const b of this.builtins) this.loadPatchFile(b.name, '', b.content);

    for (const { kind, patch } of this.patches) {
      if (kind === 'module') this.targets.add(patch.before ?? '');
      else for (const t of targetsOf(patch.target)) this.targets.add(t);
    }

    // Per-target patch lists in application order, built once: copy patches by priority, then
    // pattern patches followed by regex patches, stably sorted by priority (as Lovely does).
    const copies = stableSortBy(this.patches.filter(p => p.kind === 'copy'), p => p.priority);
    const ordered = stableSortBy([
      ...this.patches.filter(p => p.kind === 'pattern'),
      ...this.patches.filter(p => p.kind === 'regex'),
    ], p => p.priority);
    this.byTarget = new Map();
    for (const p of [...copies, ...ordered]) {
      for (const t of targetsOf(p.patch.target)) {
        if (!this.byTarget.has(t)) this.byTarget.set(t, []);
        this.byTarget.get(t).push(p);
      }
    }
  }

  walk(dir) {
    const out = [];
    for (const name of this.fs.listDir(dir)) {
      const p = join(dir, name);
      if (this.fs.isDir(p)) out.push(...this.walk(p));
      else out.push(p);
    }
    return out;
  }

  loadPatchFile(tomlPath, modPath, text) {
    let data;
    try {
      const content = (text ?? this.fs.readText(tomlPath)).replaceAll('{{lovely_hack:patch_dir}}', modPath.replaceAll('\\', '\\\\'));
      data = this.parseToml(content);
    } catch (e) {
      this.warnFn(`[lovely] Failed to parse patch file ${tomlPath}: ${e.message}`);
      return;
    }
    const priority = (data.manifest && data.manifest.priority) || 0;
    Object.assign(this.vars, data.vars || {});
    for (const entry of data.patches || []) {
      const kind = Object.keys(entry)[0];
      const patch = { ...entry[kind] };
      try {
        if (kind === 'module') {
          if (patch.load_now && patch.before == null) throw new Error(`Module "${patch.name}" has load_now but no before`);
          patch.display_source = patch.source;
          patch.content = this.fs.readText(join(modPath, patch.source));
        } else if (kind === 'copy') {
          patch.contents = (patch.sources || []).map(s => this.fs.readText(join(modPath, s)));
        } else if (kind !== 'pattern' && kind !== 'regex') {
          this.warnFn(`[lovely] Unknown patch type '${kind}' in ${tomlPath}`);
          continue;
        }
      } catch (e) {
        this.warnFn(`[lovely] ${tomlPath}: ${e.message}`);
        continue;
      }
      this.patches.push({ kind, patch, priority, file: tomlPath });
    }
  }

  needsPatching(name) {
    return this.targets.has(name.replace(/^@/, ''));
  }

  // Module patches, sorted by priority.
  modules() {
    return stableSortBy(this.patches.filter(p => p.kind === 'module'), p => p.priority).map(p => p.patch);
  }

  moduleChunkName(mod) {
    return `=[lovely ${mod.name} "${mod.display_source}"]`;
  }

  applyPatches(name, buffer) {
    const target = name.replace(/^@/, '');
    if (!this.targets.has(target)) return buffer;
    const warn = (msg) => this.warnFn(`[lovely] ${msg}`);
    const doc = new Doc(buffer);
    const list = this.byTarget.get(target) || [];

    for (const { kind, patch, file } of list) {
      if (kind === 'copy') { doc.setText(applyCopy(patch, doc.getText())); continue; }
      const w = (msg) => warn(`${msg} (from ${file})`);
      if (kind === 'pattern') {
        applyPattern(patch, target, doc, w);
      } else {
        const before = doc.getText();
        const after = applyRegex(patch, target, before, w);
        if (after !== before) doc.setText(after);
      }
    }

    // {{lovely:VAR}} interpolation, only if the text mentions it
    let text = doc.getText();
    if (text.includes('{{lovely:')) {
      text = splitInclusive(text).map(line => line.replace(/\{\{lovely:(\w+)\}\}/g, (_, v) => {
        if (!(v in this.vars)) throw new Error(`Failed to interpolate an unregistered variable '${v}'`);
        return this.vars[v];
      })).join('');
    }

    this.log(`[lovely] Applied ${list.length} patch${list.length === 1 ? '' : 'es'} to '${target}'`);
    return text;
  }
}
