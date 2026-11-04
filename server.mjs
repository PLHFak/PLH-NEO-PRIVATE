// PLH NEO — serveur local (Mac). Aucune dépendance : `node server.mjs`
// Sert le site, sauvegarde la config sur disque et exécute les actions Mac
// (ouvrir une URL / une app, raccourcis clavier). Écoute UNIQUEMENT sur 127.0.0.1.
import http from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const CONFIG = path.join(ROOT, 'config', 'neo-bureau.json');
const DEFAULT_CONFIG = path.join(PUBLIC, 'default-config.json');
const PORT = Number(process.env.PORT || 4321);
const IS_MAC = process.platform === 'darwin';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok, ko) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 2e6) ko(new Error('trop gros')); });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } });
});
const run = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, { timeout: 8000 }, (e, out, err) => (e ? ko(new Error(err || e.message)) : ok(out))));

// --- Raccourcis clavier (AppleScript / System Events) ---------------------
const MODS = { cmd: 'command down', shift: 'shift down', alt: 'option down', ctrl: 'control down' };
function shortcutScript({ key, keyCode, mods = [] }) {
  const using = mods.filter((m) => MODS[m]).map((m) => MODS[m]);
  const u = using.length ? ` using {${using.join(', ')}}` : '';
  if (Number.isInteger(keyCode) && keyCode >= 0 && keyCode < 256) return `tell application "System Events" to key code ${keyCode}${u}`;
  if (typeof key === 'string' && key.length === 1) return `tell application "System Events" to keystroke ${JSON.stringify(key)}${u}`;
  throw new Error('Raccourci invalide (une touche ou un key code)');
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/status') return send(res, 200, { local: true, mac: IS_MAC });

  if (p === '/api/config' && req.method === 'GET') {
    const f = existsSync(CONFIG) ? CONFIG : DEFAULT_CONFIG;
    return send(res, 200, await readFile(f, 'utf8'));
  }
  if (p === '/api/config' && req.method === 'PUT') {
    const cfg = await readBody(req);
    if (!Array.isArray(cfg.pages)) return send(res, 400, { error: 'config invalide' });
    await mkdir(path.dirname(CONFIG), { recursive: true });
    if (existsSync(CONFIG)) await copyFile(CONFIG, CONFIG + '.bak');
    await writeFile(CONFIG, JSON.stringify(cfg, null, 2));
    return send(res, 200, { ok: true });
  }

  if (p === '/api/open' && req.method === 'POST') {
    const { url: u, app } = await readBody(req);
    if (!IS_MAC) return send(res, 501, { error: 'Disponible seulement sur Mac' });
    if (app) { await run('open', ['-a', String(app)]); return send(res, 200, { ok: true }); }
    if (!/^https?:\/\//i.test(u || '')) return send(res, 400, { error: 'URL http(s) requise' });
    await run('open', [u]);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/shortcut' && req.method === 'POST') {
    if (!IS_MAC) return send(res, 501, { error: 'Disponible seulement sur Mac' });
    await run('osascript', ['-e', shortcutScript(await readBody(req))]);
    return send(res, 200, { ok: true });
  }

  // Recherche de radios (annuaire public radio-browser.info)
  if (p === '/api/radio-search') {
    const q = url.searchParams.get('q') || '';
    const r = await fetch(`https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&hidebroken=true&order=clickcount&reverse=true&limit=15`, { headers: { 'User-Agent': 'PLH-NEO/1.0' } });
    const list = (await r.json()).map((s) => ({ name: s.name, url: s.url_resolved || s.url, codec: s.codec, bitrate: s.bitrate, country: s.countrycode, favicon: s.favicon }));
    return send(res, 200, list);
  }

  // Recherche de podcasts (annuaire Apple Podcasts) → flux RSS
  if (p === '/api/podcast-search') {
    const q = url.searchParams.get('q') || '';
    const r = await fetch(`https://itunes.apple.com/search?media=podcast&country=FR&limit=10&term=${encodeURIComponent(q)}`);
    const list = (await r.json()).results.map((x) => ({ name: x.collectionName, author: x.artistName, feedUrl: x.feedUrl, artwork: x.artworkUrl100 }));
    return send(res, 200, list);
  }

  // Dernier épisode d'un flux RSS
  if (p === '/api/podcast-latest') {
    const feed = url.searchParams.get('feed') || '';
    if (!/^https?:\/\//i.test(feed)) return send(res, 400, { error: 'flux invalide' });
    const xml = await (await fetch(feed, { headers: { 'User-Agent': 'PLH-NEO/1.0' } })).text();
    const item = xml.split(/<item[\s>]/i)[1] || '';
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
    const audio = (item.match(/<enclosure[^>]*url="([^"]+)"/i) || [])[1];
    if (!audio) return send(res, 404, { error: 'aucun épisode audio' });
    return send(res, 200, { title: title.trim(), url: audio.replace(/&amp;/g, '&') });
  }

  return send(res, 404, { error: 'inconnu' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) return send(res, 404, 'Introuvable', 'text/plain');
    send(res, 200, await readFile(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  PLH NEO Bureau → http://localhost:${PORT}  (à ouvrir dans Chrome)\n`);
});
