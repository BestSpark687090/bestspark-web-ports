// Lowers LuaJIT-only syntax to plain Lua 5.1, which is what love.js runs:
//   * goto / ::labels::      -> repeat ... until true blocks with break (plus flags where needed)
//   * break mid-block        -> do break end
//   * \x, \u{...}, \z escapes -> decimal escapes
//   * 1LL / 2ULL integer suffixes -> plain numbers
//   * a parameter named `arg` in a vararg function -> renamed (Lua 5.1's hidden `arg` shadows it)
// Source is edited in place (by character ranges) so unrelated code and line numbers stay intact.
import luaparse from './vendor/luaparse.mjs';

const NEEDS_LOWERING = /\bgoto\b|::|\\[xzu]|\bbreak\b\s*[^\s;e]|\d(?:[uU]?[lL][lL])\b|\barg\b[^()]*\.\.\.\s*\)/;

const LOOPS = new Set(['WhileStatement', 'RepeatStatement', 'ForNumericStatement', 'ForGenericStatement']);
const BLOCK_OWNERS = new Set(['Chunk', 'FunctionDeclaration', 'WhileStatement', 'DoStatement', 'RepeatStatement',
  'ForNumericStatement', 'ForGenericStatement', 'IfClause', 'ElseifClause', 'ElseClause']);

function children(node) {
  const out = [];
  for (const key in node) {
    if (key === 'range' || key === 'loc') continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') out.push(c); }
    else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}

// Statement blocks owned directly by a node (not nested ones)
function blocksOf(node) {
  if (node.type === 'IfStatement') return [];
  return BLOCK_OWNERS.has(node.type) && Array.isArray(node.body) ? [node.body] : [];
}

class LowerError extends Error {}

function escapeString(raw) {
  const q = raw[0];
  if (q !== '"' && q !== "'") return raw;
  let out = q;
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const n = raw[i + 1];
    if (n === 'x') {
      const hex = raw.slice(i + 2, i + 4);
      out += '\\' + String(parseInt(hex, 16)).padStart(3, '0');
      i += 3;
    } else if (n === 'u' && raw[i + 2] === '{') {
      const close = raw.indexOf('}', i + 3);
      const cp = parseInt(raw.slice(i + 3, close), 16);
      for (const b of new TextEncoder().encode(String.fromCodePoint(cp))) out += '\\' + String(b).padStart(3, '0');
      i = close;
    } else if (n === 'z') {
      i += 2;
      while (i < raw.length - 1 && /\s/.test(raw[i])) i++;
      i--;
    } else {
      out += c + n;
      i++;
    }
  }
  return out + q;
}

// Comparison operators -> helper calls (only with { compare: true }). LuaJIT compares cdata with
// numbers through metamethods (big < 5); PUC Lua 5.1 raises an error for a table vs a number.
// The helpers (lua/web_compat.lua) behave natively unless one side is emulated ffi cdata.
const COMPARE_HELPERS = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge', '==': 'eq', '~=': 'ne' };
const COMPARE_OP_RE = { '<': /<(?!=)/, '<=': /<=/, '>': />(?!=)/, '>=': />=/, '==': /==/, '~=': /~=/ };
const isLiteral = (n) => n.type === 'NilLiteral' || n.type === 'BooleanLiteral' || n.type === 'StringLiteral';
const isConstant = (n) => isLiteral(n) || n.type === 'NumericLiteral';

export function lowerLua(source, chunkName = '?', opts = {}) {
  const compare = !!opts.compare && /[<>]|==|~=/.test(source);
  if (!compare && !NEEDS_LOWERING.test(source)) return source;
  let ast;
  try {
    ast = luaparse.parse(source, { luaVersion: 'LuaJIT', ranges: true, comments: false, encodingMode: 'none' });
  } catch (e) {
    // Let Lua report plain syntax errors itself, but say why goto could not be lowered
    if (/\bgoto\b/.test(source)) throw new Error(`[lua-lower] ${chunkName}: cannot parse, goto left in place: ${e.message}`);
    return source;
  }

  const edits = []; // { pos, end, text, order }
  const replaced = new Set();
  const replace = (node, text) => { replaced.add(node); edits.push({ pos: node.range[0], end: node.range[1], text, order: 1 }); };
  const insert = (pos, text, order) => edits.push({ pos, end: pos, text, order });
  let uid = 0;

  // Find gotos targeting `name` inside `stmt`, not crossing functions or shadowing labels.
  function collectGotos(stmt, name, loops, out) {
    if (stmt.type === 'FunctionDeclaration') return;
    if (stmt.type === 'GotoStatement' && stmt.label.name === name) { out.push({ node: stmt, loops: [...loops] }); return; }
    for (const block of blocksOf(stmt)) if (block.some(s => s.type === 'LabelStatement' && s.label.name === name)) return;
    const isLoop = LOOPS.has(stmt.type);
    if (isLoop) loops.push(stmt);
    for (const c of children(stmt)) collectGotos(c, name, loops, out);
    if (isLoop) loops.pop();
  }

  // Breaks inside `stmt` that leave through it (their loop is outside `stmt`)
  function collectEscapingBreaks(stmt, out) {
    if (stmt.type === 'FunctionDeclaration' || LOOPS.has(stmt.type)) return;
    if (stmt.type === 'BreakStatement') { out.push(stmt); return; }
    for (const c of children(stmt)) collectEscapingBreaks(c, out);
  }

  const isVoid = (s) => s.type === 'LabelStatement';
  const declaresLocal = (s) => s.type === 'LocalStatement' || (s.type === 'FunctionDeclaration' && s.isLocal);

  function wrapRegion(block, from, to, gotos, backward) {
    const n = ++uid;
    const brk = `__lw${n}_brk`, flag = `__lw${n}_go`;
    const region = block.slice(from, to + 1);
    const breaks = [];
    for (const s of region) collectEscapingBreaks(s, breaks);
    for (const b of breaks) if (!replaced.has(b)) replace(b, ` ${brk} = true do break end `);

    let needFlag = backward;
    for (const g of gotos) {
      if (g.loops.length) {
        needFlag = true;
        for (const loop of g.loops) insert(loop.range[1], ` if ${flag} then break end `, -2);
        replace(g.node, ` ${flag} = true do break end `);
      } else {
        replace(g.node, backward ? ` ${flag} = true do break end ` : ' do break end ');
      }
    }
    const decl = [breaks.length ? brk : null, needFlag ? flag : null].filter(Boolean);
    const local = decl.length ? `local ${decl.join(', ')} ` : '';
    const after = breaks.length ? ` if ${brk} then break end ` : '';
    if (backward) {
      insert(region[0].range[0], ` ${local}repeat ${flag} = false repeat `, 0);
      insert(region[region.length - 1].range[1], ` until true until not ${flag}${after} `, -1);
    } else {
      insert(region[0].range[0], ` ${local}repeat `, 0);
      insert(region[region.length - 1].range[1], ` until true${after} `, -1);
    }
  }

  function processBlock(block) {
    const claimed = []; // [from, to] regions already wrapped in this block
    block.forEach((stmt, j) => {
      if (stmt.type !== 'LabelStatement') return;
      const name = stmt.label.name;
      const fwd = [], bwd = [];
      block.forEach((s, k) => {
        if (k === j) return;
        const found = [];
        collectGotos(s, name, [], found);
        for (const g of found) (k < j ? fwd : bwd).push({ ...g, index: k });
      });
      replace(stmt, ' ');
      const rest = block.slice(j + 1).filter(s => !isVoid(s));
      const overlaps = (a, b) => claimed.some(([x, y]) => !(b < x || a > y));

      if (fwd.length) {
        const from = Math.min(...fwd.map(g => g.index)), to = j - 1;
        if (rest.length && block.slice(from, to + 1).some(declaresLocal))
          throw new LowerError(`goto ${name}: jumps over local declarations used after the label`);
        if (overlaps(from, to)) throw new LowerError(`goto ${name}: overlapping goto regions`);
        claimed.push([from, to]);
        wrapRegion(block, from, to, fwd, false);
      }
      if (bwd.length) {
        const from = j + 1, to = Math.max(...bwd.map(g => g.index));
        if (block.slice(to + 1).some(s => !isVoid(s)) && block.slice(from, to + 1).some(declaresLocal))
          throw new LowerError(`goto ${name}: loop body declares locals used after it`);
        if (overlaps(from, to)) throw new LowerError(`goto ${name}: overlapping goto regions`);
        claimed.push([from, to]);
        wrapRegion(block, from, to, bwd, true);
      }
    });
  }

  // PUC Lua 5.1 (LUA_COMPAT_VARARG) gives every vararg function a hidden local `arg`, declared
  // after the named parameters. A parameter that is itself called `arg` is shadowed by it and
  // reads as nil. LuaJIT has no such local, so rename the parameter and its references.
  const RENAMED_ARG = '__arg_param';
  function renameArgParam(fn) {
    const rename = (id) => { if (!replaced.has(id)) replace(id, RENAMED_ARG); };
    // Walk expressions/statements; `active` = references to `arg` still mean the parameter.
    function walk(node, active) {
      if (!node || typeof node.type !== 'string') return;
      switch (node.type) {
        case 'Identifier':
          if (active && node.name === 'arg') rename(node);
          return;
        case 'MemberExpression': walk(node.base, active); return;
        case 'TableKeyString': walk(node.value, active); return;
        case 'LabelStatement': case 'GotoStatement': return;
        case 'FunctionDeclaration': {
          if (node.identifier && !node.isLocal) walk(node.identifier, active);
          const shadows = node.parameters.some(p => p.type === 'Identifier' && p.name === 'arg') ||
            (node.isLocal && node.identifier && node.identifier.name === 'arg');
          walkBlock(node.body, active && !shadows);
          return;
        }
        case 'ForNumericStatement':
          walk(node.start, active); walk(node.end, active); walk(node.step, active);
          walkBlock(node.body, active && node.variable.name !== 'arg');
          return;
        case 'ForGenericStatement':
          node.iterators.forEach(it => walk(it, active));
          walkBlock(node.body, active && !node.variables.some(v => v.name === 'arg'));
          return;
        case 'RepeatStatement': {
          const stillActive = walkBlock(node.body, active);
          walk(node.condition, stillActive);
          return;
        }
        default:
          if (blocksOf(node).length) { walkBlock(node.body, active); return; }
          for (const c of children(node)) walk(c, active);
      }
    }
    // Returns whether `arg` still refers to the parameter after the block's statements.
    function walkBlock(stmts, active) {
      for (const s of stmts) {
        if (s.type === 'LocalStatement') {
          s.init.forEach(e => walk(e, active));
          if (s.variables.some(v => v.name === 'arg')) active = false;
        } else if (s.type === 'FunctionDeclaration' && s.isLocal && s.identifier && s.identifier.name === 'arg') {
          active = false;
          walk(s, false);
        } else if (s.type === 'IfStatement') {
          s.clauses.forEach(c => { if (c.condition) walk(c.condition, active); walkBlock(c.body, active); });
        } else {
          walk(s, active);
        }
      }
      return active;
    }
    for (const p of fn.parameters) if (p.type === 'Identifier' && p.name === 'arg') rename(p);
    walkBlock(fn.body, true);
  }

  let depth = 0;
  function rewriteComparison(node) {
    const { left, right, operator } = node;
    // Comparisons with nil/booleans/strings, or between two constants, can't involve cdata
    if (isLiteral(left) || isLiteral(right) || (isConstant(left) && isConstant(right))) return;
    // == and ~= never raise errors in Lua 5.1; they only differ from LuaJIT when cdata meets a
    // plain number, which in practice means a literal (big == 0). Leave the rest native: equality
    // checks are the most frequent comparisons, so this is most of the rewrite's cost.
    const isNumberLiteral = (n) => n.type === 'NumericLiteral' ||
      (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'NumericLiteral');
    if ((operator === '==' || operator === '~=') && !isNumberLiteral(left) && !isNumberLiteral(right)) return;
    const between = source.slice(left.range[1], right.range[0]);
    const m = COMPARE_OP_RE[operator].exec(between);
    if (!m) return;
    const opPos = left.range[1] + m.index;
    insert(node.range[0], `__web_cmp_${COMPARE_HELPERS[operator]}(`, depth * 1e-6);
    edits.push({ pos: opPos, end: opPos + operator.length, text: ',', order: 1 });
    insert(node.range[1], ')', -1 - depth * 1e-6);
  }

  function visit(node) {
    depth++;
    if (compare && node.type === 'BinaryExpression' && COMPARE_HELPERS[node.operator]) rewriteComparison(node);
    if (node.type === 'FunctionDeclaration' && node.parameters.some(p => p.type === 'VarargLiteral') &&
        node.parameters.some(p => p.type === 'Identifier' && p.name === 'arg')) renameArgParam(node);
    for (const block of blocksOf(node)) {
      processBlock(block);
      block.forEach((s, i) => {
        if (s.type === 'BreakStatement' && i < block.length - 1 && !replaced.has(s)) {
          if (block.slice(i + 1).some(x => !isVoid(x))) replace(s, ' do break end ');
        }
      });
    }
    if (node.type === 'NumericLiteral' && /u?ll$/i.test(node.raw)) replace(node, node.raw.replace(/u?ll$/i, ''));
    if (node.type === 'StringLiteral' && /\\[xzu]/.test(node.raw)) {
      const raw = escapeString(node.raw);
      if (raw !== node.raw) replace(node, raw);
    }
    for (const c of children(node)) visit(c);
    depth--;
  }

  try {
    visit(ast);
  } catch (e) {
    if (e instanceof LowerError) throw new Error(`[lua-lower] ${chunkName}: ${e.message}`);
    throw e;
  }
  for (const g of findAll(ast, 'GotoStatement')) {
    if (!replaced.has(g)) throw new Error(`[lua-lower] ${chunkName}: goto ${g.label.name} has no visible label`);
  }

  edits.sort((a, b) => (a.pos - b.pos) || (a.order - b.order));
  let out = '';
  let cursor = 0;
  for (const e of edits) {
    if (e.pos < cursor) continue; // inside an already replaced range
    out += source.slice(cursor, e.pos) + e.text;
    cursor = e.end;
  }
  return out + source.slice(cursor);
}

function findAll(node, type, out = []) {
  if (node.type === type) out.push(node);
  for (const c of children(node)) findAll(c, type, out);
  return out;
}
