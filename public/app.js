// PLH NEO · Bureau — configuration + pilotage du Stream Deck Neo (WebHID, Chrome)
import { requestStreamDecks, getStreamDecks } from './vendor/streamdeck.js';

const $ = (s) => document.querySelector(s);
const KEY = 96, LCD_W = 248, LCD_H = 58, NKEYS = 8, TOUCH_L = 8, TOUCH_R = 9;
const LS = 'plh-neo-bureau-config';

const ACTIONS = {
  radio: 'Radio (flux direct)',
  url: 'Ouvrir un site (YouTube Music…)',
  podcast: 'Podcast (dernier épisode)',
  shortcut: 'Raccourci clavier Mac',
  app: 'Ouvrir une application Mac',
  page: 'Aller à une page',
  toggle: 'Pause / Lecture',
  stop: 'Stop',
  'vol+': 'Volume +',
  'vol-': 'Volume −',
};

const state = { cfg: null, page: 0, sel: null, local: false, mac: false, deck: null, playing: null, playingKey: null, saveTimer: null };
const audio = $('#audio');

// ---------------------------------------------------------------- utilitaires
const toast = (msg, ms = 2500) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); };
const api = async (p, opt = {}) => {
  const r = await fetch(p, { ...opt, headers: { 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const curPage = () => state.cfg.pages[state.page];
const hexRgb = (h) => { const n = parseInt((h || '#000').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const shade = (h, f) => { const [r, g, b] = hexRgb(h); return `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`; };

// ---------------------------------------------------------------- dessin
function drawKey(key, active) {
  const c = document.createElement('canvas'); c.width = c.height = KEY;
  const g = c.getContext('2d');
  if (!key) { g.fillStyle = '#000'; g.fillRect(0, 0, KEY, KEY); return c; }
  const grd = g.createLinearGradient(0, 0, 0, KEY);
  grd.addColorStop(0, key.color || '#333'); grd.addColorStop(1, shade(key.color || '#333', 0.45));
  g.fillStyle = grd; g.fillRect(0, 0, KEY, KEY);
  if (active) { g.strokeStyle = '#2bd576'; g.lineWidth = 6; g.strokeRect(3, 3, KEY - 6, KEY - 6); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.fillText(key.icon || '', KEY / 2, 38);
  g.fillStyle = '#fff'; g.shadowColor = '#000a'; g.shadowBlur = 3;
  const words = (key.label || '').split(' ');
  let lines = [words.join(' ')];
  g.font = '600 15px -apple-system,"Helvetica Neue",Arial,sans-serif';
  if (g.measureText(lines[0]).width > KEY - 8 && words.length > 1) {
    const mid = Math.ceil(words.length / 2); lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }
  if (lines.some((l) => g.measureText(l).width > KEY - 8)) g.font = '600 12px -apple-system,"Helvetica Neue",Arial,sans-serif';
  lines.forEach((l, i) => g.fillText(l, KEY / 2, lines.length === 1 ? 78 : 70 + i * 15, KEY - 6));
  return c;
}

function drawLcd() {
  const c = $('#lcd'), g = c.getContext('2d'), p = curPage();
  g.fillStyle = '#000'; g.fillRect(0, 0, LCD_W, LCD_H);
  g.fillStyle = p.color; g.fillRect(0, 0, 4, LCD_H);
  g.textBaseline = 'top'; g.fillStyle = '#fff';
  g.font = '600 15px -apple-system,"Helvetica Neue",Arial,sans-serif';
  g.fillText(p.name, 12, 7, 170);
  g.fillStyle = '#9aa'; g.font = '12px -apple-system,Arial,sans-serif';
  g.fillText(`${state.page + 1}/${state.cfg.pages.length}`, 200, 9);
  const now = new Date();
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '600 13px -apple-system,Arial,sans-serif';
  g.fillText(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), LCD_W - 6, 34);
  if (Date.now() < (state.volUntil || 0)) {
    const v = state.cfg.volume ?? 0.8;
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '12px -apple-system,Arial,sans-serif';
    g.fillText(`🔊 ${Math.round(v * 100)} %`, 12, 36);
    g.fillStyle = '#333'; g.fillRect(80, 40, 100, 8); g.fillStyle = '#2bd576'; g.fillRect(80, 40, 100 * v, 8);
    return c;
  }
  g.textAlign = 'left'; g.fillStyle = state.playing ? '#2bd576' : '#667';
  g.font = '12px -apple-system,Arial,sans-serif';
  g.fillText(state.playing ? `▶ ${state.playing}` : '—', 12, 36, LCD_W - 70);
  return c;
}

const rgba = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

// ---------------------------------------------------------------- rendu (écran + Neo)
function render() {
  const p = curPage();
  // onglets
  $('#pages').innerHTML = '';
  state.cfg.pages.forEach((pg, i) => {
    const b = document.createElement('button'); b.textContent = pg.name; b.style.setProperty('--c', pg.color);
    if (i === state.page) b.className = 'cur';
    b.onclick = () => goPage(i); $('#pages').append(b);
  });
  // touches
  const grid = $('#grid'); grid.innerHTML = '';
  p.keys.forEach((k, i) => {
    const d = document.createElement('div'); d.className = 'key' + (state.sel === i ? ' sel' : ''); d.draggable = true;
    d.append(drawKey(k, isActive(k)));
    const e = document.createElement('span'); e.className = 'edit'; e.textContent = '✎'; e.onclick = (ev) => { ev.stopPropagation(); select(i); }; d.append(e);
    d.onclick = (ev) => (ev.altKey || !k ? select(i) : press(i));
    d.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', i);
    d.ondragover = (ev) => { ev.preventDefault(); d.classList.add('drop'); };
    d.ondragleave = () => d.classList.remove('drop');
    d.ondrop = (ev) => { ev.preventDefault(); const from = +ev.dataTransfer.getData('text/plain'); [p.keys[from], p.keys[i]] = [p.keys[i], p.keys[from]]; state.sel = i; changed(); };
    grid.append(d);
  });
  document.querySelectorAll('.touch').forEach((t) => t.style.setProperty('--led', p.color));
  drawLcd();
  $('#pageName').value = p.name; $('#pageColor').value = p.color;
  $('#nowPlaying').textContent = state.playing ? `▶ ${state.playing}` : 'Rien en lecture';
  renderEditor();
  paintDeck();
}

const isActive = (k) => k && state.playingKey && k === state.playingKey;

let painting = Promise.resolve();
function paintDeck() {
  const deck = state.deck; if (!deck) return;
  const p = curPage();
  painting = painting.then(async () => {
    for (let i = 0; i < NKEYS; i++) await deck.fillKeyBuffer(i, rgba(drawKey(p.keys[i], isActive(p.keys[i]))), { format: 'rgba' });
    const [r, g, b] = hexRgb(p.color);
    await deck.fillKeyColor(TOUCH_L, r, g, b); await deck.fillKeyColor(TOUCH_R, r, g, b);
    await deck.fillLcd(0, rgba(drawLcd()), { format: 'rgba' });
  }).catch((e) => console.warn('Neo:', e));
}
function paintLcd() { const c = drawLcd(); if (state.deck) state.deck.fillLcd(0, rgba(c), { format: 'rgba' }).catch(() => {}); }
setInterval(paintLcd, 20000);

// ---------------------------------------------------------------- navigation & actions
function goPage(i) { state.page = (i + state.cfg.pages.length) % state.cfg.pages.length; state.sel = null; render(); }

async function press(i) {
  const k = curPage().keys[i]; if (!k) return;
  const a = k.action || {};
  try {
    switch (a.type) {
      case 'radio': return await playRadio(k);
      case 'podcast': return await playPodcast(k);
      case 'url': return await openUrl(a.url);
      case 'app': return await api('/api/open', { method: 'POST', body: { app: a.app } });
      case 'shortcut': return await api('/api/shortcut', { method: 'POST', body: { key: a.key, keyCode: a.keyCode ? +a.keyCode : undefined, mods: a.mods || [] } });
      case 'page': return goPage(state.cfg.pages.findIndex((p) => p.id === a.page));
      case 'toggle': return togglePlay();
      case 'stop': return stop();
      case 'vol+': return setVol(audio.volume + 0.1);
      case 'vol-': return setVol(audio.volume - 0.1);
    }
  } catch (e) {
    toast(`${k.label} : ${state.local ? e.message : 'nécessite le serveur local (node server.mjs)'}`, 4000);
  }
}

const airplayOn = () => state.local && state.mac && state.cfg.output?.mode === 'airplay' && (state.cfg.output.devices || []).length;
async function play(url, title, key) {
  if (state.cfg.output?.mode === 'airplay' && !(state.cfg.output.devices || []).length) toast('AirPlay choisi mais aucune enceinte cochée : le son reste sur le Mac', 5000);
  if (airplayOn()) {
    audio.pause();
    toast(`AirPlay → ${state.cfg.output.devices.join(' + ')}`);
    await api('/api/airplay/play', { method: 'POST', body: { url, devices: state.cfg.output.devices, volume: Math.round((state.cfg.volume ?? 0.8) * 100) } });
  } else {
    audio.src = url; audio.volume = state.cfg.volume ?? 0.8;
    await audio.play();
  }
  state.playing = title; state.playingKey = key; render();
}
function togglePlay() {
  if (airplayOn()) return api('/api/airplay/toggle', { method: 'POST' }).catch((e) => toast(e.message));
  if (audio.src) audio.paused ? audio.play() : audio.pause();
}
function stop() {
  if (state.local && state.mac && state.cfg.output?.mode === 'airplay') api('/api/airplay/stop', { method: 'POST' }).catch(() => {});
  audio.pause(); audio.removeAttribute('src'); audio.load(); state.playing = null; state.playingKey = null; render();
}
let volTimer;
function setVol(v) {
  v = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100; audio.volume = v; state.cfg.volume = v; $('#vol').value = v; save();
  state.volUntil = Date.now() + 1500; paintLcd(); clearTimeout(state.volLcd); state.volLcd = setTimeout(paintLcd, 1600);
  if (airplayOn()) { clearTimeout(volTimer); volTimer = setTimeout(() => api('/api/airplay/volume', { method: 'POST', body: { volume: Math.round(v * 100) } }).catch(() => {}), 150); }
}

// ---------------------------------------------------------------- sortie audio
function renderOutput() {
  const o = state.cfg.output || (state.cfg.output = { mode: 'mac', devices: [] });
  const box = $('#output');
  if (!(state.local && state.mac)) { box.innerHTML = '<p class="small muted">AirPlay disponible avec le serveur local sur le Mac.</p>'; return; }
  box.innerHTML = `<label class="field"><span>Le son sort sur</span><select id="outMode">
      <option value="mac" ${o.mode !== 'airplay' ? 'selected' : ''}>Ce Mac (sortie son du système)</option>
      <option value="airplay" ${o.mode === 'airplay' ? 'selected' : ''}>AirPlay via l’app Musique (HomePod…)</option></select></label>
    <div id="outDevs" ${o.mode === 'airplay' ? '' : 'hidden'}><div class="row"><span class="small muted" style="flex:1">Enceintes AirPlay</span><button id="outRefresh">Rafraîchir</button></div><div id="outList" class="small muted">…</div></div>`;
  $('#outMode').onchange = (e) => { o.mode = e.target.value; save(); renderOutput(); };
  if (o.mode === 'airplay') { $('#outRefresh').onclick = loadAirplay; loadAirplay(); }
}
async function loadAirplay() {
  const o = state.cfg.output, list = $('#outList');
  list.textContent = 'Recherche des enceintes…';
  try {
    const devs = (await api('/api/airplay/devices')).filter((d) => d.kind !== 'computer');
    list.innerHTML = devs.length ? (o.devices.length ? '' : '<p class="small" style="color:#ffb703">⚠️ Coche au moins une enceinte.</p>') : 'Aucune enceinte AirPlay trouvée (Musique ouverte ?)';
    devs.forEach((d) => {
      const l = document.createElement('label'); l.className = 'row';
      l.innerHTML = `<input type="checkbox" ${o.devices.includes(d.name) ? 'checked' : ''}> ${d.name} <span class="muted">${d.kind}</span>`;
      l.querySelector('input').onchange = (e) => { o.devices = e.target.checked ? [...new Set([...o.devices, d.name])] : o.devices.filter((n) => n !== d.name); save(); loadAirplay(); };
      list.append(l);
    });
  } catch (e) { list.textContent = 'Erreur : ' + e.message + ' — autorise le Terminal à piloter « Musique » (Réglages Système → Confidentialité → Automatisation).'; }
}

async function playRadio(k) {
  const a = k.action;
  if (a.url) { try { return await play(a.url, k.label, k); } catch (e) { if (!a.search) throw e; } }
  if (!a.search) throw new Error('aucun flux');
  toast(`Recherche du flux « ${a.search} »…`);
  const [hit] = await api(`/api/radio-search?q=${encodeURIComponent(a.search)}`);
  if (!hit) throw new Error('station introuvable');
  a.url = hit.url; save(); // mémorise le flux trouvé
  await play(a.url, k.label, k);
}

async function playPodcast(k) {
  const a = k.action;
  if (!a.feed && a.search) {
    const [hit] = await api(`/api/podcast-search?q=${encodeURIComponent(a.search)}`);
    if (!hit) throw new Error('podcast introuvable');
    a.feed = hit.feedUrl; save();
  }
  const ep = await api(`/api/podcast-latest?feed=${encodeURIComponent(a.feed)}`);
  await play(ep.url, `${k.label} — ${ep.title}`, k);
}

async function openUrl(url) {
  if (state.local && state.mac) return api('/api/open', { method: 'POST', body: { url } });
  const w = window.open(url, 'neo-web');
  if (!w) toast('Pop-up bloqué : autorise les pop-ups pour ce site dans Chrome', 5000);
}

// ---------------------------------------------------------------- Neo (WebHID)
async function serialOf(d) { try { return await d.getSerialNumber(); } catch { return '?'; } }

const touchT = new Map();
async function attach(deck) {
  state.deck = deck;
  await deck.setBrightness(state.cfg.brightness ?? 70).catch(() => {});
  // Touches tactiles : appui bref = page ; appui maintenu = volume (◀ baisse, ▶ monte)
  deck.on('down', (c) => {
    if (c.type !== 'button') return;
    if (c.index < NKEYS) return press(c.index);
    const step = c.index === TOUCH_L ? -0.05 : 0.05;
    const t = { vol: false };
    t.timer = setTimeout(() => { t.vol = true; setVol(audio.volume + step); t.rep = setInterval(() => setVol(audio.volume + step), 180); }, 450);
    touchT.set(c.index, t);
  });
  deck.on('up', (c) => {
    if (c.type !== 'button' || c.index < NKEYS) return;
    const t = touchT.get(c.index) || {}; clearTimeout(t.timer); clearInterval(t.rep); touchT.delete(c.index);
    if (t.vol) return;
    goPage(state.page + (c.index === TOUCH_L ? -1 : 1));
  });
  // Écran central : s'il est tactile sur ce modèle, tap gauche/droite = volume −/+, glissé = volume
  deck.on('lcdShortPress', (_c, pos) => setVol(audio.volume + (pos.x < LCD_W / 2 ? -0.1 : 0.1)));
  deck.on('lcdSwipe', (_c, a, b) => setVol(audio.volume + (b.x - a.x) / LCD_W));
  deck.on('error', (e) => { console.warn(e); detach(); });
  $('#device').textContent = `Neo Bureau · ${state.cfg.deviceSerial}`; $('#device').className = 'pill on';
  $('#btnConnect').textContent = 'Connecté'; paintDeck();
}
function detach() { state.deck = null; $('#device').textContent = 'Neo non connecté'; $('#device').className = 'pill off'; $('#btnConnect').textContent = 'Connecter le Neo Bureau'; }

// Ouvre UNIQUEMENT le Neo dont le n° de série est associé ; les autres (Neo DUPLEX) sont refermés sans y toucher.
async function connect(list) {
  if (!navigator.hid) return toast('WebHID indisponible : utilise Chrome', 5000);
  if (!state.cfg.deviceSerial) return pair();
  const decks = list || await getStreamDecks();
  let found = null;
  for (const d of decks) {
    if (!found && (await serialOf(d)) === state.cfg.deviceSerial) found = d; else await d.close().catch(() => {});
  }
  if (found) return attach(found);
  if (!list) return connect(await requestStreamDecks());
  toast('Ce n’est pas le Neo Bureau associé (n° de série différent). Utilise « Associer… » pour changer.', 6000);
}

async function pair() {
  if (!navigator.hid) return toast('WebHID indisponible : utilise Chrome', 5000);
  const [d] = await requestStreamDecks(); if (!d) return;
  const serial = await serialOf(d);
  for (let i = 0; i < NKEYS; i++) await d.fillKeyColor(i, 229, 0, 125).catch(() => {}); // flash rose
  const ok = confirm(`Le Neo n° ${serial} s’est allumé en rose.\n\nEst-ce bien le Neo BUREAU (et pas celui du DUPLEX) ?`);
  if (!ok) { await d.clearPanel().catch(() => {}); await d.close(); return toast('Association annulée'); }
  state.cfg.deviceSerial = serial; save();
  attach(d);
}

// ---------------------------------------------------------------- éditeur
function select(i) { state.sel = i; if (!curPage().keys[i]) curPage().keys[i] = { label: 'Nouveau', icon: '⭐', color: '#444444', action: { type: 'radio' } }; render(); }

function renderEditor() {
  const ed = $('#editor');
  const k = state.sel != null ? curPage().keys[state.sel] : null;
  if (!k) { ed.innerHTML = '<h3>Touche</h3><p class="muted">Sélectionne une touche (crayon ou Alt + clic) pour la configurer.</p>'; return; }
  const a = k.action || (k.action = { type: 'radio' });
  const f = (name, label, val, ph = '') => `<label class="field"><span>${label}</span><input data-a="${name}" value="${(val ?? '').toString().replace(/"/g, '&quot;')}" placeholder="${ph}"></label>`;
  let extra = '';
  if (a.type === 'radio') extra = f('url', 'URL du flux', a.url, 'https://…') + f('search', 'Ou nom de la station (recherche auto)', a.search, 'ex. BFM Business') + searchBox('radio');
  if (a.type === 'url') extra = f('url', 'Adresse', a.url, 'https://music.youtube.com/…');
  if (a.type === 'podcast') extra = f('feed', 'Flux RSS', a.feed, 'https://…/rss') + f('search', 'Ou nom du podcast', a.search) + searchBox('podcast');
  if (a.type === 'app') extra = f('app', 'Nom de l’application', a.app, 'ex. Microsoft Teams');
  if (a.type === 'shortcut') extra = f('key', 'Touche (1 caractère)', a.key, 'ex. c') + f('keyCode', 'ou key code Mac', a.keyCode, 'ex. 53 = Échap') +
    `<div class="mods">${['cmd', 'shift', 'alt', 'ctrl'].map((m) => `<label><input type="checkbox" data-mod="${m}" ${(a.mods || []).includes(m) ? 'checked' : ''}> ${{ cmd: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' }[m]}</label>`).join('')}</div>`;
  if (a.type === 'page') extra = `<label class="field"><span>Page cible</span><select data-a="page">${state.cfg.pages.map((p) => `<option value="${p.id}" ${p.id === a.page ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>`;

  ed.innerHTML = `<h3>Touche ${state.sel + 1}</h3>
    <div class="row"><input data-k="icon" value="${k.icon || ''}" style="flex:0 0 58px;text-align:center" title="Icône (emoji)"><input data-k="label" value="${(k.label || '').replace(/"/g, '&quot;')}" placeholder="Libellé"><input data-k="color" type="color" value="${k.color || '#444444'}"></div>
    <label class="field"><span>Action</span><select data-type>${Object.entries(ACTIONS).map(([v, l]) => `<option value="${v}" ${v === a.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${extra}
    <div class="row"><button id="kTest" class="primary">▶ Tester</button><button id="kDel" class="danger">Vider la touche</button></div>
    ${!state.local && ['shortcut', 'app'].includes(a.type) ? '<p class="small muted">⚠️ Cette action demande le serveur local sur le Mac.</p>' : ''}`;

  ed.querySelectorAll('[data-k]').forEach((el) => (el.oninput = () => { k[el.dataset.k] = el.value; changed(false); }));
  ed.querySelectorAll('[data-a]').forEach((el) => (el.oninput = el.onchange = () => { a[el.dataset.a] = el.value || undefined; changed(false); }));
  ed.querySelectorAll('[data-mod]').forEach((el) => (el.onchange = () => { a.mods = [...ed.querySelectorAll('[data-mod]:checked')].map((x) => x.dataset.mod); changed(false); }));
  ed.querySelector('[data-type]').onchange = (e) => { k.action = { type: e.target.value }; changed(); };
  ed.querySelector('#kTest').onclick = () => press(state.sel);
  ed.querySelector('#kDel').onclick = () => { curPage().keys[state.sel] = null; state.sel = null; changed(); };
  const sb = ed.querySelector('.search');
  if (sb) sb.querySelector('button').onclick = () => runSearch(sb.dataset.kind, sb.querySelector('input').value, k);
}

const searchBox = (kind) => `<div class="search" data-kind="${kind}"><div class="row"><input placeholder="Rechercher ${kind === 'radio' ? 'une radio' : 'un podcast'}…"><button>Chercher</button></div><div class="results"></div></div>`;

async function runSearch(kind, q, k) {
  const box = $('#editor .results'); box.innerHTML = '<div>Recherche…</div>';
  try {
    const list = await api(`/api/${kind}-search?q=${encodeURIComponent(q)}`);
    box.innerHTML = '';
    list.forEach((r) => {
      const d = document.createElement('div');
      d.innerHTML = kind === 'radio' ? `${r.name} <small>${r.country || ''} · ${r.codec || ''} ${r.bitrate || ''}k</small>` : `${r.name} <small>${r.author || ''}</small>`;
      d.onclick = () => { if (kind === 'radio') k.action.url = r.url; else k.action.feed = r.feedUrl; if (!k.label || k.label === 'Nouveau') k.label = r.name.slice(0, 18); changed(); toast('Ajouté — clique ▶ Tester'); };
      box.append(d);
    });
    if (!list.length) box.innerHTML = '<div>Aucun résultat</div>';
  } catch (e) { box.innerHTML = `<div>${state.local ? e.message : 'Recherche disponible avec le serveur local'}</div>`; }
}

// ---------------------------------------------------------------- pages
$('#pageName').oninput = (e) => { curPage().name = e.target.value; changed(); };
$('#pageColor').oninput = (e) => { curPage().color = e.target.value; changed(); };
$('#pageAdd').onclick = () => { state.cfg.pages.splice(state.page + 1, 0, { id: 'p' + Date.now().toString(36), name: 'Nouvelle page', color: '#888888', keys: Array(NKEYS).fill(null) }); goPage(state.page + 1); save(); };
$('#pageDel').onclick = () => { if (state.cfg.pages.length > 1 && confirm(`Supprimer la page « ${curPage().name} » ?`)) { state.cfg.pages.splice(state.page, 1); goPage(Math.min(state.page, state.cfg.pages.length - 1)); save(); } };
const movePage = (d) => { const j = state.page + d, P = state.cfg.pages; if (j < 0 || j >= P.length) return; [P[state.page], P[j]] = [P[j], P[state.page]]; state.page = j; changed(); };
$('#pageUp').onclick = () => movePage(-1);
$('#pageDown').onclick = () => movePage(1);

// ---------------------------------------------------------------- sauvegarde
function changed(full = true) { save(); if (full) render(); else { paintDeck(); const g = $('#grid').children[state.sel]; if (g) { g.firstChild.replaceWith(drawKey(curPage().keys[state.sel])); } } }
function save() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      if (state.local) await api('/api/config', { method: 'PUT', body: state.cfg }); else localStorage.setItem(LS, JSON.stringify(state.cfg));
      $('#saveState').textContent = `Enregistré ${new Date().toLocaleTimeString('fr-FR')} ${state.local ? '(config/neo-bureau.json)' : '(navigateur)'}`;
    } catch (e) { $('#saveState').textContent = 'Erreur de sauvegarde : ' + e.message; }
  }, 400);
}
$('#btnExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state.cfg, null, 2)], { type: 'application/json' })); a.download = 'neo-bureau.json'; a.click(); };
$('#fileImport').onchange = async (e) => { try { const c = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(c.pages)) throw 0; state.cfg = c; state.page = 0; save(); render(); renderOutput(); toast('Config importée'); } catch { toast('Fichier invalide'); } };
$('#btnReset').onclick = async () => { if (!confirm('Revenir à la configuration d’origine ?')) return; const serial = state.cfg.deviceSerial; state.cfg = await (await fetch('default-config.json')).json(); state.cfg.deviceSerial = serial; state.page = 0; save(); render(); renderOutput(); };
$('#bright').oninput = (e) => { state.cfg.brightness = +e.target.value; state.deck?.setBrightness(+e.target.value).catch(() => {}); save(); };
$('#vol').oninput = (e) => setVol(+e.target.value);
$('#btnToggle').onclick = togglePlay;
$('#btnStop').onclick = stop;
for (const [id, dir] of [['#touchL', -1], ['#touchR', 1]]) {
  const el = $(id); let t = {};
  el.onpointerdown = () => { t = { vol: false }; t.timer = setTimeout(() => { t.vol = true; setVol(audio.volume + dir * 0.05); t.rep = setInterval(() => setVol(audio.volume + dir * 0.05), 180); }, 450); };
  el.onpointerup = () => { clearTimeout(t.timer); clearInterval(t.rep); if (!t.vol) goPage(state.page + dir); };
  el.onpointerleave = () => { clearTimeout(t.timer); clearInterval(t.rep); };
}
$('#btnConnect').onclick = () => connect().catch((e) => toast(e.message, 5000));
$('#btnPair').onclick = () => pair().catch((e) => toast(e.message, 5000));
audio.onerror = () => { if (state.playing) toast('Flux audio indisponible'); };
if (navigator.hid) navigator.hid.addEventListener('disconnect', () => { if (state.deck) { state.deck.close().catch(() => {}); detach(); } });

// ---------------------------------------------------------------- démarrage
(async function init() {
  try { const s = await api('/api/status'); state.local = !!s.local; state.mac = !!s.mac; } catch {}
  $('#mode').textContent = state.local ? (state.mac ? 'Mode local · Mac' : 'Mode local') : 'Mode web (sans raccourcis)';
  try {
    state.cfg = state.local ? await api('/api/config') : JSON.parse(localStorage.getItem(LS) || 'null');
  } catch {}
  if (!state.cfg) state.cfg = await (await fetch('default-config.json')).json();
  $('#vol').value = state.cfg.volume ?? 0.8; $('#bright').value = state.cfg.brightness ?? 70;
  render(); renderOutput();
  // Reconnexion automatique au Neo Bureau déjà autorisé
  if (navigator.hid && state.cfg.deviceSerial) getStreamDecks().then((l) => l.length && connect(l)).catch(() => {});
})();
