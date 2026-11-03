// Jens Run – ranglijst API. Statische bestanden komen uit public/.
const MODES = new Set(['fiets', 'telefoon', 'terror', 'school', 'bazen']);
const EMOJI = ['😂', '🔥', '👑', '💀', '🤡'];
// grove woorden die niet op de muur mogen
const BAD = /kanker|tering|tyfus|hoer|mongool|nigg|neger|homo|flikker|kut|lul|pedo|nazi|hitler|jood|kkk|sieg|heil/i;
const ID_RE = /^[a-f0-9-]{36}$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// ---------- wachtwoorden en sessies ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
async function hashPassword(password, saltHex) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt: hex(salt) };
}
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function newSession(db, playerId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO sessions (token_hash, player_id, created) VALUES (?, ?, ?)').bind(await sha256(token), playerId, Date.now()).run();
  return token;
}
async function sessionPlayer(db, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const s = await db.prepare('SELECT player_id FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first();
  return s?.player_id || null;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 16) return null;
  if (!/^[\p{L}\p{N} ._\-!]+$/u.test(name)) return null;
  return name;
}

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

function isAdmin(req, env) {
  const key = req.headers.get('x-admin-key') || '';
  return env.ADMIN_KEY && key.length > 0 && key === env.ADMIN_KEY;
}

async function api(req, env, url) {
  const path = url.pathname;
  const db = env.DB;

  if (path === '/api/me' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!ID_RE.test(id)) return json({ error: 'id' }, 400);
    const p = await db.prepare('SELECT name FROM players WHERE id = ?').bind(id).first();
    return p ? json({ name: p.name }) : json({ error: 'onbekend' }, 404);
  }

  if (path === '/api/register' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '')) return json({ error: 'id' }, 400);
    const existing = await db.prepare('SELECT name FROM players WHERE id = ?').bind(b.id).first();
    if (existing) return json({ name: existing.name });
    const name = cleanName(b.name);
    if (!name) return json({ error: 'Naam moet 2 tot 16 tekens zijn (letters, cijfers, spatie).' }, 400);
    const key = name.toLowerCase();
    const taken = await db.prepare('SELECT 1 FROM players WHERE name_key = ?').bind(key).first();
    if (taken) return json({ error: 'Die naam is al bezet.' }, 409);
    await db.prepare('INSERT INTO players (id, name, name_key, created) VALUES (?, ?, ?, ?)').bind(b.id, name, key, Date.now()).run();
    return json({ name });
  }

  if (path === '/api/score' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '') || !MODES.has(b.mode)) return json({ error: 'ongeldig' }, 400);
    const score = Math.floor(Number(b.score)), dist = Math.floor(Number(b.dist)), secs = Number(b.secs), bekers = Math.floor(Number(b.bekers) || 0);
    if (!Number.isFinite(score) || !Number.isFinite(dist) || !Number.isFinite(secs) || score < 0 || dist < 0) return json({ error: 'ongeldig' }, 400);
    // grove plausibiliteitscheck: max snelheid ~40 m/s, score max ~2x afstand + bekers + gesloopte obstakels
    const mult = Math.min(20, Math.max(1, Math.floor(Number(b.mult) || 1)));
    if (b.mode === 'bazen' ? score > dist / 4000 + 1 : dist > secs * 42 + 50 || score > (dist * 2.2 + bekers * 20 + secs * 60 + 500) * mult) return json({ error: 'ongeldig' }, 400);
    const p = await db.prepare('SELECT name FROM players WHERE id = ?').bind(b.id).first();
    if (!p) return json({ error: 'onbekend' }, 404);
    if (b.mode !== 'bazen') {
      const reason = /^[a-z]{1,12}$/.test(b.reason || '') ? b.reason : null, street = String(b.street || '').slice(0, 40) || null;
      await db.prepare('INSERT INTO runs (player_id, mode, score, dist, reason, street, created) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(b.id, b.mode, score, dist, reason, street, Date.now()).run();
      if (Math.random() < 0.02) await db.prepare('DELETE FROM runs WHERE created < ?').bind(Date.now() - 14 * 864e5).run();
    }
    const prev = await db.prepare('SELECT score FROM scores WHERE player_id = ? AND mode = ?').bind(b.id, b.mode).first();
    await db.prepare(`INSERT INTO scores (player_id, mode, score, dist, created) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT (player_id, mode) DO UPDATE SET score = ?3, dist = ?4, created = ?5 WHERE ?3 > scores.score`)
      .bind(b.id, b.mode, score, dist, Date.now()).run();
    if (b.mode !== 'bazen') {
      const { results: beaten } = await db.prepare(`SELECT f.player_id FROM friends f JOIN scores s ON s.player_id = f.player_id AND s.mode = ?2
        WHERE f.friend_id = ?1 AND s.score < ?3 AND s.score >= COALESCE(?4, 0)`).bind(b.id, b.mode, score, prev?.score ?? 0).all();
      for (const r of beaten) await notify(r.player_id, `🏃 ${p.name} heeft je record in ${b.mode} verbroken: ${score.toLocaleString('nl-NL')}`);
    }
    const rank = await db.prepare('SELECT COUNT(*) + 1 AS r FROM scores WHERE mode = ? AND score > (SELECT score FROM scores WHERE player_id = ? AND mode = ?)')
      .bind(b.mode, b.id, b.mode).first();
    return json({ ok: true, rank: rank?.r ?? null });
  }

  // dagelijkse krant: wat gebeurde er tussen from en to (ms)
  if (path === '/api/krant' && req.method === 'GET') {
    const from = Number(url.searchParams.get('from')), to = Number(url.searchParams.get('to'));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 2 * 864e5) return json({ error: 'periode' }, 400);
    const agg = await db.prepare('SELECT COUNT(*) AS runs, COALESCE(SUM(dist), 0) AS meters FROM runs WHERE created >= ? AND created < ?').bind(from, to).first();
    if (!agg?.runs) return json({ runs: 0 });
    const q = (sql) => db.prepare(sql).bind(from, to);
    const { results: top } = await q(`SELECT p.name, r.mode, r.score, r.street FROM runs r JOIN players p ON p.id = r.player_id
      WHERE r.created >= ? AND r.created < ? ORDER BY r.score DESC LIMIT 3`).all();
    const lang = await q(`SELECT p.name, r.dist FROM runs r JOIN players p ON p.id = r.player_id WHERE r.created >= ? AND r.created < ? ORDER BY r.dist DESC LIMIT 1`).first();
    const vaak = await q(`SELECT p.name, COUNT(*) AS n FROM runs r JOIN players p ON p.id = r.player_id WHERE r.created >= ? AND r.created < ? GROUP BY r.player_id ORDER BY n DESC LIMIT 1`).first();
    const dood = await q(`SELECT p.name, r.reason, r.street FROM runs r JOIN players p ON p.id = r.player_id WHERE r.created >= ? AND r.created < ? AND r.reason IN ('vlucht','gevloerd','gat','afzetting','auto') ORDER BY CASE r.reason WHEN 'vlucht' THEN 0 WHEN 'gevloerd' THEN 1 ELSE 2 END, RANDOM() LIMIT 1`).first();
    return json({ runs: agg.runs, meters: agg.meters, top, lang, vaak, dood });
  }

  if (path === '/api/leaderboard' && req.method === 'GET') {
    const mode = url.searchParams.get('mode');
    if (!MODES.has(mode)) return json({ error: 'modus' }, 400);
    const { results } = await db.prepare(`SELECT p.name, s.score, s.dist FROM scores s JOIN players p ON p.id = s.player_id
      WHERE s.mode = ? ORDER BY s.score DESC LIMIT 25`).bind(mode).all();
    return json({ rows: results });
  }

  // ---------- vrienden ----------
  const playerByName = (n) => db.prepare('SELECT id, name FROM players WHERE name_key = ?').bind(String(n || '').toLowerCase().trim()).first();
  const exists = (id) => db.prepare('SELECT name FROM players WHERE id = ?').bind(id).first();
  const notify = (pid, text) => db.prepare('INSERT INTO notifs (player_id, text, created) VALUES (?, ?, ?)').bind(pid, text, Date.now()).run();
  if (path === '/api/friends' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!ID_RE.test(id)) return json({ error: 'id' }, 400);
    const { results } = await db.prepare(`SELECT p.name,
        MAX(CASE WHEN s.mode = 'fiets' THEN s.score END) AS fiets, MAX(CASE WHEN s.mode = 'telefoon' THEN s.score END) AS telefoon,
        MAX(CASE WHEN s.mode = 'terror' THEN s.score END) AS terror, MAX(CASE WHEN s.mode = 'school' THEN s.score END) AS school
      FROM players p LEFT JOIN scores s ON s.player_id = p.id
      WHERE p.id = ?1 OR p.id IN (SELECT friend_id FROM friends WHERE player_id = ?1) GROUP BY p.id`).bind(id).all();
    return json({ rows: results });
  }
  if (path === '/api/friends' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '') || !(await exists(b.id))) return json({ error: 'Kies eerst een naam op de ranglijst.' }, 400);
    const f = await playerByName(b.name);
    if (!f) return json({ error: 'Die naam bestaat niet.' }, 404);
    if (f.id === b.id) return json({ error: 'Dat ben je zelf 😅' }, 400);
    if (b.remove) { await db.prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?').bind(b.id, f.id).run(); return json({ ok: true }); }
    const me = await exists(b.id);
    const r = await db.prepare('INSERT OR IGNORE INTO friends (player_id, friend_id, created) VALUES (?, ?, ?)').bind(b.id, f.id, Date.now()).run();
    if (r.meta.changes) await notify(f.id, `👥 ${me.name} heeft je als vriend toegevoegd`);
    return json({ ok: true, name: f.name });
  }

  // ---------- clans ----------
  const clanTotals = `SELECT c.id, c.name, c.code, COUNT(DISTINCT m.player_id) AS members, COALESCE(SUM(s.score), 0) AS total
    FROM clans c JOIN clan_members m ON m.clan_id = c.id LEFT JOIN scores s ON s.player_id = m.player_id AND s.mode IN ('fiets', 'telefoon', 'terror', 'school')`;
  if (path === '/api/clans' && req.method === 'GET') {
    const { results } = await db.prepare(`${clanTotals} GROUP BY c.id ORDER BY total DESC LIMIT 25`).all();
    return json({ rows: results.map(({ code, ...r }) => r) });
  }
  if (path === '/api/clan' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const m = await db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').bind(id).first();
    if (!m) return json({ clan: null });
    const clan = await db.prepare(`${clanTotals} WHERE c.id = ? GROUP BY c.id`).bind(m.clan_id).first();
    const { results } = await db.prepare(`SELECT p.name, COALESCE(SUM(s.score), 0) AS total FROM clan_members m JOIN players p ON p.id = m.player_id
      LEFT JOIN scores s ON s.player_id = m.player_id AND s.mode IN ('fiets', 'telefoon', 'terror', 'school') WHERE m.clan_id = ? GROUP BY p.id ORDER BY total DESC`).bind(m.clan_id).all();
    return json({ clan, members: results });
  }
  if (path === '/api/clan' && req.method === 'POST') {
    const b = await body(req);
    const me = ID_RE.test(b.id || '') ? await exists(b.id) : null;
    if (!me) return json({ error: 'Kies eerst een naam op de ranglijst.' }, 400);
    if (b.leave) { await db.prepare('DELETE FROM clan_members WHERE player_id = ?').bind(b.id).run(); return json({ ok: true }); }
    if (await db.prepare('SELECT 1 FROM clan_members WHERE player_id = ?').bind(b.id).first()) return json({ error: 'Je zit al in een clan. Verlaat die eerst.' }, 400);
    let clanId;
    if (b.create) {
      const name = cleanName(b.create);
      if (!name) return json({ error: 'Clannaam: 2 tot 16 tekens.' }, 400);
      if (await db.prepare('SELECT 1 FROM clans WHERE name_key = ?').bind(name.toLowerCase()).first()) return json({ error: 'Die clannaam bestaat al.' }, 409);
      clanId = crypto.randomUUID();
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (v) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v % 32]).join('');
      await db.prepare('INSERT INTO clans (id, name, name_key, code, owner_id, created) VALUES (?, ?, ?, ?, ?, ?)').bind(clanId, name, name.toLowerCase(), code, b.id, Date.now()).run();
    } else {
      const c = await db.prepare('SELECT id FROM clans WHERE code = ?').bind(String(b.code || '').toUpperCase().trim()).first();
      if (!c) return json({ error: 'Die clancode klopt niet.' }, 404);
      clanId = c.id;
      const { results } = await db.prepare('SELECT player_id FROM clan_members WHERE clan_id = ?').bind(clanId).all();
      for (const r of results) await notify(r.player_id, `🛡️ ${me.name} zit nu in je clan`);
    }
    await db.prepare('INSERT INTO clan_members (player_id, clan_id, joined) VALUES (?, ?, ?)').bind(b.id, clanId, Date.now()).run();
    return json({ ok: true });
  }

  // ---------- meldingen ----------
  if (path === '/api/notifs' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!ID_RE.test(id)) return json({ error: 'id' }, 400);
    const after = parseInt(url.searchParams.get('after'), 10) || 0;
    const { results } = await db.prepare('SELECT id, text, created, seen FROM notifs WHERE player_id = ? AND id > ? ORDER BY id DESC LIMIT 30').bind(id, after).all();
    if (url.searchParams.get('seen')) await db.prepare('UPDATE notifs SET seen = 1 WHERE player_id = ?').bind(id).run();
    return json({ rows: results });
  }

  // ---------- live samen rennen ----------
  if (path.startsWith('/api/live/')) {
    const code = path.slice(10).toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return json({ error: 'code' }, 400);
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket' }, 426);
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
  }

  // ---------- accounts en synchroniseren ----------
  if (path === '/api/account/register' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '')) return json({ error: 'ongeldig' }, 400);
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: 'Vul een geldig e-mailadres in.' }, 400);
    if (String(b.password || '').length < 8) return json({ error: 'Wachtwoord moet minstens 8 tekens zijn.' }, 400);
    if (await db.prepare('SELECT 1 FROM accounts WHERE email = ?').bind(email).first()) return json({ error: 'Er is al een account met dit e-mailadres.' }, 409);
    let p = await db.prepare('SELECT name FROM players WHERE id = ?').bind(b.id).first();
    if (p) {
      if (await db.prepare('SELECT 1 FROM accounts WHERE player_id = ?').bind(b.id).first()) return json({ error: 'Deze speler heeft al een account. Log in.' }, 409);
    } else {
      const name = cleanName(b.name);
      if (!name) return json({ error: 'Gebruikersnaam moet 2 tot 16 tekens zijn (letters, cijfers, spatie).' }, 400);
      if (await db.prepare('SELECT 1 FROM players WHERE name_key = ?').bind(name.toLowerCase()).first()) return json({ error: 'Die gebruikersnaam is al bezet.' }, 409);
      await db.prepare('INSERT INTO players (id, name, name_key, created) VALUES (?, ?, ?, ?)').bind(b.id, name, name.toLowerCase(), Date.now()).run();
      p = { name };
    }
    const { hash, salt } = await hashPassword(String(b.password));
    await db.prepare('INSERT INTO accounts (player_id, email, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?)').bind(b.id, email, hash, salt, Date.now()).run();
    return json({ ok: true, token: await newSession(db, b.id), playerId: b.id, name: p.name, email });
  }
  if (path === '/api/account/login' && req.method === 'POST') {
    const b = await body(req);
    const login = String(b.login || '').trim().toLowerCase();
    const failKey = await sha256('login:' + login);
    const f = await db.prepare('SELECT n, until FROM login_fails WHERE key = ?').bind(failKey).first();
    if (f && f.n >= 5 && f.until > Date.now()) return json({ error: 'Te vaak geprobeerd. Wacht een paar minuten.' }, 429);
    const a = await db.prepare(`SELECT a.player_id, a.email, a.pass_hash, a.salt, p.name FROM accounts a JOIN players p ON p.id = a.player_id
      WHERE a.email = ?1 OR p.name_key = ?1`).bind(login).first();
    const ok = a && sameHash((await hashPassword(String(b.password || ''), a.salt)).hash, a.pass_hash);
    if (!ok) {
      await db.prepare(`INSERT INTO login_fails (key, n, until) VALUES (?1, 1, ?2) ON CONFLICT (key) DO UPDATE SET n = CASE WHEN until < ?3 THEN 1 ELSE n + 1 END, until = ?2`)
        .bind(failKey, Date.now() + 5 * 60000, Date.now()).run();
      return json({ error: 'Gebruikersnaam/e-mail of wachtwoord klopt niet.' }, 401);
    }
    await db.prepare('DELETE FROM login_fails WHERE key = ?').bind(failKey).run();
    const s = await db.prepare('SELECT data, updated FROM saves WHERE player_id = ?').bind(a.player_id).first();
    return json({ ok: true, token: await newSession(db, a.player_id), playerId: a.player_id, name: a.name, email: a.email,
      save: s ? JSON.parse(s.data) : null, updated: s?.updated || 0 });
  }
  if (path === '/api/account/sync' && req.method === 'POST') {
    const b = await body(req);
    const pid = await sessionPlayer(db, b.token);
    if (!pid) return json({ error: 'Niet ingelogd.' }, 401);
    if (b.save && typeof b.save === 'object') {
      const data = JSON.stringify(b.save);
      if (data.length > 300000) return json({ error: 'Te groot.' }, 413);
      await db.prepare(`INSERT INTO saves (player_id, data, updated) VALUES (?1, ?2, ?3)
        ON CONFLICT (player_id) DO UPDATE SET data = ?2, updated = ?3`).bind(pid, data, Date.now()).run();
      return json({ ok: true, updated: Date.now() });
    }
    const s = await db.prepare('SELECT data, updated FROM saves WHERE player_id = ?').bind(pid).first();
    const a = await db.prepare('SELECT a.email, p.name FROM accounts a JOIN players p ON p.id = a.player_id WHERE a.player_id = ?').bind(pid).first();
    return json({ ok: true, save: s ? JSON.parse(s.data) : null, updated: s?.updated || 0, name: a?.name, email: a?.email });
  }
  if (path === '/api/account/logout' && req.method === 'POST') {
    const b = await body(req);
    if (/^[a-f0-9]{64}$/.test(b.token || '')) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(b.token)).run();
    return json({ ok: true });
  }
  if (path === '/api/account/password' && req.method === 'POST') {
    const b = await body(req);
    const pid = await sessionPlayer(db, b.token);
    if (!pid) return json({ error: 'Niet ingelogd.' }, 401);
    const a = await db.prepare('SELECT pass_hash, salt FROM accounts WHERE player_id = ?').bind(pid).first();
    if (!a || !sameHash((await hashPassword(String(b.old || ''), a.salt)).hash, a.pass_hash)) return json({ error: 'Je huidige wachtwoord klopt niet.' }, 401);
    if (String(b.password || '').length < 8) return json({ error: 'Nieuw wachtwoord moet minstens 8 tekens zijn.' }, 400);
    const { hash, salt } = await hashPassword(String(b.password));
    await db.prepare('UPDATE accounts SET pass_hash = ?, salt = ? WHERE player_id = ?').bind(hash, salt, pid).run();
    return json({ ok: true });
  }

  // ---------- instellingen van de beheerder: wedstrijddagen en de muur ----------
  if (path === '/api/config' && req.method === 'GET') {
    const rows = (await db.prepare('SELECT key, value FROM config').all()).results;
    const cfg = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return json({ wedstrijden: cfg.wedstrijden || [], wall: cfg.wall || null });
  }
  if (path === '/api/wall' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '')) return json({ error: 'ongeldig' }, 400);
    const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (text.length < 2) return json({ error: 'Te kort.' }, 400);
    if (BAD.test(text.replace(/[^a-z]/gi, ''))) return json({ error: 'Dat mag niet op de muur.' }, 400);
    const p = await db.prepare('SELECT name FROM players WHERE id = ?').bind(b.id).first();
    if (!p) return json({ error: 'onbekend' }, 404);
    let top = false;
    for (const m of ['fiets', 'telefoon', 'terror', 'school']) {
      const t = await db.prepare('SELECT player_id FROM scores WHERE mode = ? ORDER BY score DESC LIMIT 1').bind(m).first();
      if (t?.player_id === b.id) top = true;
    }
    if (!top) return json({ error: 'Alleen wie #1 staat mag op de muur.' }, 403);
    await db.prepare("INSERT INTO config (key, value) VALUES ('wall', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1")
      .bind(JSON.stringify({ name: p.name, text, at: Date.now() })).run();
    return json({ ok: true });
  }
  if (path === '/api/react' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '') || !EMOJI.includes(b.emoji)) return json({ error: 'ongeldig' }, 400);
    const me = await db.prepare('SELECT 1 FROM players WHERE id = ?').bind(b.id).first();
    const t = await db.prepare('SELECT id FROM players WHERE name_key = ?').bind(String(b.target || '').toLowerCase()).first();
    if (!me || !t || t.id === b.id) return json({ error: 'ongeldig' }, 400);
    await db.prepare(`INSERT INTO reactions (target_id, from_id, emoji, created) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (target_id, from_id) DO UPDATE SET emoji = ?3, created = ?4`).bind(t.id, b.id, b.emoji, Date.now()).run();
    const mn = await db.prepare('SELECT name FROM players WHERE id = ?').bind(b.id).first();
    await db.prepare('INSERT INTO notifs (player_id, text, created) VALUES (?, ?, ?)').bind(t.id, `${b.emoji} ${mn.name} reageerde op je profiel`, Date.now()).run();
    return json({ ok: true });
  }

  // ---------- weekuitdaging ----------
  if (path === '/api/weekly' && req.method === 'GET') {
    const { results } = await db.prepare(`SELECT p.name, w.score FROM weekly w JOIN players p ON p.id = w.player_id
      WHERE w.week = ? ORDER BY w.score DESC LIMIT 25`).bind(isoWeek()).all();
    return json({ week: isoWeek(), rows: results });
  }
  if (path === '/api/weekly' && req.method === 'POST') {
    const b = await body(req);
    const week = isoWeek();
    if (!ID_RE.test(b.id || '') || b.week !== week) return json({ error: 'ongeldig' }, 400);
    const score = Math.floor(Number(b.score)), dist = Math.floor(Number(b.dist)), secs = Number(b.secs), bekers = Math.floor(Number(b.bekers) || 0);
    if (![score, dist, secs].every(Number.isFinite) || score < 0 || dist > secs * 42 + 50 || score > dist * 4.5 + bekers * 40 + secs * 80 + 500) return json({ error: 'ongeldig' }, 400);
    const p = await db.prepare('SELECT 1 FROM players WHERE id = ?').bind(b.id).first();
    if (!p) return json({ error: 'onbekend' }, 404);
    await db.prepare(`INSERT INTO weekly (week, player_id, score, created) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (week, player_id) DO UPDATE SET score = ?3, created = ?4 WHERE ?3 > weekly.score`).bind(week, b.id, score, Date.now()).run();
    const r = await db.prepare('SELECT COUNT(*) + 1 AS r FROM weekly WHERE week = ?1 AND score > (SELECT score FROM weekly WHERE week = ?1 AND player_id = ?2)').bind(week, b.id).first();
    return json({ ok: true, rank: r?.r ?? null });
  }

  // ---------- profielen ----------
  if (path === '/api/profile' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '') || typeof b.profile !== 'object') return json({ error: 'ongeldig' }, 400);
    const pr = b.profile, eq = pr.outfit || {};
    const clean = {
      outfit: Object.fromEntries(['shirt', 'head', 'bril', 'shout', 'rug', 'hand', 'maatje'].map((k) => [k, String(eq[k] || '').slice(0, 20).replace(/[^a-z0-9-]/g, '')])),
      stars: Math.min(24, Math.max(0, Math.floor(pr.stars) || 0)), starsNl: Math.min(30, Math.max(0, Math.floor(pr.starsNl) || 0)),
      mult: Math.min(20, Math.max(1, Math.floor(pr.mult) || 1)),
      ach: (Array.isArray(pr.ach) ? pr.ach : []).filter((a) => /^[a-z0-9-]{1,20}$/.test(a)).slice(0, 40),
    };
    await db.prepare('UPDATE players SET profile = ? WHERE id = ?').bind(JSON.stringify(clean), b.id).run();
    return json({ ok: true });
  }
  if (path === '/api/profile' && req.method === 'GET') {
    const name = String(url.searchParams.get('name') || '').toLowerCase();
    const p = await db.prepare('SELECT id, name, created, profile FROM players WHERE name_key = ?').bind(name).first();
    if (!p) return json({ error: 'onbekend' }, 404);
    const { results } = await db.prepare(`SELECT s.mode, s.score, (SELECT COUNT(*) + 1 FROM scores t WHERE t.mode = s.mode AND t.score > s.score) AS rank
      FROM scores s WHERE s.player_id = ?`).bind(p.id).all();
    const fame = await db.prepare('SELECT 1 FROM fame WHERE player_id = ?').bind(p.id).first();
    const fameNl = await db.prepare('SELECT 1 FROM fame_nl WHERE player_id = ?').bind(p.id).first();
    let profile = null;
    try { profile = p.profile ? JSON.parse(p.profile) : null; } catch { /* leeg */ }
    const re = (await db.prepare('SELECT emoji, COUNT(*) AS n FROM reactions WHERE target_id = ? GROUP BY emoji').bind(p.id).all()).results;
    const mine = ID_RE.test(url.searchParams.get('me') || '') ? await db.prepare('SELECT emoji FROM reactions WHERE target_id = ? AND from_id = ?').bind(p.id, url.searchParams.get('me')).first() : null;
    return json({ name: p.name, created: p.created, profile, scores: results, fame: !!fame, fameNl: !!fameNl,
      reactions: Object.fromEntries(re.map((r) => [r.emoji, r.n])), myReaction: mine?.emoji || null });
  }

  // ---------- wall of fame: wie de Koning van Hatert versloeg ----------
  const fameTable = url.searchParams.get('c') === 'nl' ? 'fame_nl' : 'fame';
  if (path === '/api/fame' && req.method === 'GET') {
    const { results } = await db.prepare(`SELECT name, score, created FROM ${fameTable} ORDER BY created ASC LIMIT 200`).all();
    return json({ rows: results });
  }
  if (path === '/api/fame' && req.method === 'POST') {
    const b = await body(req);
    if (!ID_RE.test(b.id || '')) return json({ error: 'ongeldig' }, 400);
    const name = cleanName(b.name);
    if (!name) return json({ error: 'Naam moet 2 tot 16 tekens zijn (letters, cijfers, spatie).' }, 400);
    const score = Math.floor(Number(b.score)), secs = Math.floor(Number(b.secs));
    // het eindbaaslevel duurt minstens een minuut en levert flink wat punten op
    const mult = Math.min(20, Math.max(1, Math.floor(Number(b.mult) || 1)));
    if (!Number.isFinite(score) || !Number.isFinite(secs) || secs < 45 || score < 3000 || score > secs * 400 * mult) return json({ error: 'Dat klopt niet helemaal…' }, 400);
    await db.prepare(`INSERT INTO ${fameTable} (player_id, name, score, secs, created) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT (player_id) DO UPDATE SET name = ?2, score = MAX(score, ?3)`).bind(b.id, name, score, secs, Date.now()).run();
    return json({ name });
  }

  // ---------- beheer ----------
  if (path.startsWith('/api/admin/')) {
    if (!isAdmin(req, env)) return json({ error: 'geen toegang' }, 401);
    if (path === '/api/admin/players' && req.method === 'GET') {
      const { results } = await db.prepare(`SELECT p.id, p.name, p.created, (SELECT email FROM accounts a WHERE a.player_id = p.id) AS email,
        MAX(CASE WHEN s.mode = 'fiets' THEN s.score END) AS fiets,
        MAX(CASE WHEN s.mode = 'telefoon' THEN s.score END) AS telefoon,
        MAX(CASE WHEN s.mode = 'terror' THEN s.score END) AS terror,
        MAX(CASE WHEN s.mode = 'school' THEN s.score END) AS school
        FROM players p LEFT JOIN scores s ON s.player_id = p.id GROUP BY p.id ORDER BY p.created DESC`).all();
      return json({ rows: results });
    }
    if (path === '/api/admin/config' && req.method === 'GET') {
      const rows = (await db.prepare('SELECT key, value FROM config').all()).results;
      return json(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])));
    }
    if (path === '/api/admin/config' && req.method === 'POST') {
      const b = await body(req);
      if (Array.isArray(b.wedstrijden)) {
        const d = b.wedstrijden.map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 200);
        await db.prepare("INSERT INTO config (key, value) VALUES ('wedstrijden', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1").bind(JSON.stringify(d)).run();
      }
      if (b.clearWall) await db.prepare("DELETE FROM config WHERE key = 'wall'").run();
      return json({ ok: true });
    }
    if (path === '/api/admin/password' && req.method === 'POST') {
      const b = await body(req);
      if (!ID_RE.test(b.id || '') || String(b.password || '').length < 8) return json({ error: 'ongeldig' }, 400);
      const { hash, salt } = await hashPassword(String(b.password));
      const r = await db.prepare('UPDATE accounts SET pass_hash = ?, salt = ? WHERE player_id = ?').bind(hash, salt, b.id).run();
      await db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(b.id).run();
      return json({ ok: !!r.meta.changes });
    }
    if (path === '/api/admin/rename' && req.method === 'POST') {
      const b = await body(req);
      if (!ID_RE.test(b.id || '')) return json({ error: 'id' }, 400);
      const name = cleanName(b.name);
      if (!name) return json({ error: 'Naam moet 2 tot 16 tekens zijn (letters, cijfers, spatie).' }, 400);
      const key = name.toLowerCase();
      const taken = await db.prepare('SELECT 1 FROM players WHERE name_key = ? AND id != ?').bind(key, b.id).first();
      if (taken) return json({ error: 'Die naam is al bezet.' }, 409);
      // ook op de Wall of Fame meteen de nieuwe naam
      const r = await db.batch([
        db.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?').bind(name, key, b.id),
        db.prepare('UPDATE fame SET name = ? WHERE player_id = ?').bind(name, b.id),
        db.prepare('UPDATE fame_nl SET name = ? WHERE player_id = ?').bind(name, b.id),
      ]);
      return r[0].meta.changes ? json({ name }) : json({ error: 'onbekend' }, 404);
    }
    if (path === '/api/admin/fame' && req.method === 'GET') {
      const { results } = await db.prepare(`SELECT player_id AS id, name, score, created, 'nijmegen' AS c FROM fame UNION ALL SELECT player_id, name, score, created, 'nl' FROM fame_nl ORDER BY created ASC`).all();
      return json({ rows: results });
    }
    if (path === '/api/admin/fame/delete' && req.method === 'POST') {
      const b = await body(req);
      if (!ID_RE.test(b.id || '')) return json({ error: 'id' }, 400);
      await db.prepare(`DELETE FROM ${b.c === 'nl' ? 'fame_nl' : 'fame'} WHERE player_id = ?`).bind(b.id).run();
      return json({ ok: true });
    }
    if (path === '/api/admin/delete' && req.method === 'POST') {
      const b = await body(req);
      if (!ID_RE.test(b.id || '')) return json({ error: 'id' }, 400);
      await db.batch([
        db.prepare('DELETE FROM scores WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM weekly WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM reactions WHERE target_id = ?1 OR from_id = ?1').bind(b.id),
        db.prepare('DELETE FROM friends WHERE player_id = ?1 OR friend_id = ?1').bind(b.id),
        db.prepare('DELETE FROM clan_members WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM notifs WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM accounts WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM saves WHERE player_id = ?').bind(b.id),
        db.prepare('DELETE FROM players WHERE id = ?').bind(b.id),
      ]);
      return json({ ok: true });
    }
  }
  return json({ error: 'niet gevonden' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // uitdaging-links: de gewone pagina, maar met een eigen voorbeeld in WhatsApp e.d.
    if (url.pathname === '/daag') {
      const page = await env.ASSETS.fetch(new Request(new URL('/', url)));
      const n = (url.searchParams.get('n') || 'Iemand').slice(0, 20), s = parseInt(url.searchParams.get('s'), 10) || 0;
      const labels = { fiets: 'Fiets', telefoon: 'Telefoon', terror: 'Terror', school: 'School' };
      const m = labels[url.searchParams.get('m')] || 'Jens Run';
      const title = `${n} daagt je uit in Jens Run`, desc = `Haal meer dan ${s.toLocaleString('nl-NL')} punten in ${m}. Durf je?`;
      const set = (attr) => ({ element(el) { el.setAttribute('content', attr); } });
      return new HTMLRewriter()
        .on('meta[property="og:title"]', set(title))
        .on('meta[property="og:description"]', set(desc))
        .on('title', { element(el) { el.setInnerContent(title); } })
        .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { return json({ error: 'serverfout' }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};

// =====================================================================
//  Live samen rennen: één kamer per code, berichten worden doorgestuurd
// =====================================================================
export class Room {
  constructor(state) { this.state = state; }
  async fetch(req) {
    if (this.state.getWebSockets().length >= 4) return new Response('vol', { status: 409 });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  players() {
    return this.state.getWebSockets().map((ws) => ws.deserializeAttachment()).filter((a) => a?.name);
  }
  send(data, except) {
    const msg = JSON.stringify(data);
    for (const ws of this.state.getWebSockets()) if (ws !== except) try { ws.send(msg); } catch { /* weg */ }
  }
  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      const name = String(m.name || 'Speler').slice(0, 16), pid = String(m.pid || '').slice(0, 40);
      const host = this.players().length === 0;
      ws.serializeAttachment({ name, pid, host });
      this.send({ t: 'players', list: this.players() });
      return;
    }
    const me = ws.deserializeAttachment();
    if (!me) return;
    if (m.t === 'start' && me.host) { this.send({ t: 'go', mode: String(m.mode || 'fiets'), at: Date.now() + 3500 }); return; }
    if (m.t === 's' || m.t === 'dead') this.send({ ...m, pid: me.pid, name: me.name }, ws);
  }
  async webSocketClose(ws) { this.afterLeave(ws); }
  async webSocketError(ws) { this.afterLeave(ws); }
  afterLeave(ws) {
    const list = this.players().filter((a) => a !== ws.deserializeAttachment());
    // als de host weggaat, wordt de volgende host
    const rest = this.state.getWebSockets().filter((x) => x !== ws);
    if (rest.length && !rest.some((x) => x.deserializeAttachment()?.host)) { const a = rest[0].deserializeAttachment(); if (a) rest[0].serializeAttachment({ ...a, host: true }); }
    this.send({ t: 'players', list: rest.map((x) => x.deserializeAttachment()).filter((a) => a?.name) }, ws);
  }
}
