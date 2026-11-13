// Mod manager shown before the game starts: lists bundled and player-added mods, lets the player
// add mods (.zip files or folders), enable/disable them and remove added ones, then starts the
// game. Changes apply on the next start, since Lovely patches are applied while the game loads.
import { fetchPack, packMods, disabledMods, setModEnabled, applyModDefaults, pendingRestart } from './boot.js';
import { listUserMods, saveUserMod, deleteUserMod, modsFromZip, modsFromFiles, compatibilityNotes } from './mod-store.js';

const $ = (sel) => document.querySelector(sel);
const fmtSize = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

// Walk a dropped directory (DataTransferItem.webkitGetAsEntry) into [{file, path}]
async function readEntry(entry, prefix = '') {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    return [{ file, path: prefix + entry.name }];
  }
  const reader = entry.createReader();
  const out = [];
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const e of batch) out.push(...await readEntry(e, prefix + entry.name + '/'));
  }
  return out;
}

export async function runManager() {
  const pack = await fetchPack();
  // ?play, or continuing after a game restart: start straight away
  if (new URLSearchParams(location.search).has('play') || pendingRestart()) return { pack, userMods: await listUserMods() };

  const root = $('#manager');
  root.hidden = false;
  const list = $('#manager-list');
  const message = $('#manager-message');
  const bundled = (pack ? packMods(pack) : []).filter (m => m.name != "smods");
  let userMods = await listUserMods();
  applyModDefaults([...bundled, ...userMods].map(m => m.name));

  const say =(text, kind = '') => { message.textContent = text; message.className = kind; };

  function render() {
    const disabled = disabledMods();
    const userNames = new Set(userMods.map(m => m.name));
    const rows = [
      ...bundled.filter(m => !userNames.has(m.name)).map(m => ({ ...m, origin: 'Bundled' })),
      ...userMods.map(m => ({ name: m.name, size: m.size, origin: bundled.some(b => b.name === m.name) ? 'Added (replaces bundled)' : 'Added', user: true, notes: compatibilityNotes(m.files) })),
    ].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    list.replaceChildren(...rows.map(m => el('li', { class: disabled.has(m.name) ? 'mod off' : 'mod' },
      el('label', { class: 'toggle' },
        el('input', { type: 'checkbox', checked: !disabled.has(m.name), 'aria-label': `Enable ${m.name}`,
          onchange: (e) => { setModEnabled(m.name, e.target.checked); render(); } }),
        el('span', { class: 'track' })),
      el('div', { class: 'info' },
        el('div', { class: 'name' }, m.name),
        el('div', { class: 'meta' }, `${m.origin} · ${fmtSize(m.size)}`),
        ...(m.notes || []).map(n => el('div', { class: 'note' }, `May not work in the browser: ${n}`))),
      m.user ? el('button', { class: 'remove', onclick: async () => {
        if (!confirm(`Remove ${m.name}? It will be deleted from this browser.`)) return;
        await deleteUserMod(m.name);
        setModEnabled(m.name, true);
        userMods = await listUserMods();
        say(`Removed ${m.name}.`);
        render();
      } }, 'Remove') : null)));
    // SMODS is auto on all the time. Deal with it. If you somehow manage to do that, i'm suprised.
    if (disabled.has('smods')) {
      say("I'm suprised. You managed to disable SMODS. I'll turn it back on for you.","warning");
      setModEnabled('smods', true)
    }
    //const smodsOff = disabled.has('smods') || !rows.some(r => r.name === 'smods');
    //$('#manager-warning').hidden = !smodsOff;
  }

  async function addMods(found, source) {
    if (!found.length) { say(`No mod found in ${source}. A mod folder needs a metadata .json, lovely.toml, or a Steamodded header.`, 'error'); return; }
    for (const mod of found) await saveUserMod(mod);
    applyModDefaults(found.map(m => m.name), true); // just added, so start enabled
    userMods = await listUserMods();
    say(`Added ${found.map(m => m.name).join(', ')} from ${source}.`, 'ok');
    render();
  }

  async function importZips(files) {
    for (const f of files) {
      try { await addMods(modsFromZip(f.name, await f.arrayBuffer()), f.name); }
      catch (e) { say(`Couldn't read ${f.name}: ${e.message}`, 'error'); }
    }
  }

  $('#add-zip').addEventListener('change', async (e) => { await importZips([...e.target.files]); e.target.value = ''; });
  $('#add-folder').addEventListener('change', async (e) => {
    const files = [...e.target.files].map(file => ({ file, path: file.webkitRelativePath || file.name }));
    if (files.length) await addMods(await modsFromFiles(files, files[0].path.split('/')[0]), files[0].path.split('/')[0]);
    e.target.value = '';
  });

  // Drag and drop: .zip files or folders
  root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('dragging'); });
  root.addEventListener('dragleave', (e) => { if (e.target === root) root.classList.remove('dragging'); });
  root.addEventListener('drop', async (e) => {
    e.preventDefault();
    root.classList.remove('dragging');
    const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    for (const entry of entries) {
      if (entry.isDirectory) {
        const files = await readEntry(entry);
        await addMods(await modsFromFiles(files, entry.name), entry.name);
      } else if (entry.name.toLowerCase().endsWith('.zip')) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        await importZips([file]);
      } else {
        say(`${entry.name} isn't a .zip or a folder.`, 'error');
      }
    }
  });

  render();
  await new Promise(resolve => $('#manager-play').addEventListener('click', resolve, { once: true }));
  root.hidden = true;
  return { pack, userMods };
}
