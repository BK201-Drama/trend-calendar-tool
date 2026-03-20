import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'app.db');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbFile);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  status TEXT DEFAULT 'planned',
  weight REAL DEFAULT 0.5,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const count = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
if (count === 0) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT INTO events (title, platform, date, time, status, weight, tags)
    VALUES (@title, @platform, @date, @time, @status, @weight, @tags)
  `);
  ins.run({ title: '春季护肤清单短视频', platform: 'douyin', date: today, time: '20:00', status: 'planned', weight: 0.8, tags: JSON.stringify(['hot']) });
  ins.run({ title: '本周通勤穿搭图文', platform: 'xiaohongshu', date: tomorrow, time: '12:30', status: 'planned', weight: 0.7, tags: JSON.stringify(['campaign']) });
}

export function listEvents() {
  const rows = db.prepare('SELECT * FROM events ORDER BY date ASC, time ASC, id ASC').all();
  return rows.map((r) => ({ ...r, tags: safeParseTags(r.tags) }));
}

export function createEvent(payload) {
  const stmt = db.prepare(`
    INSERT INTO events (title, platform, date, time, status, weight, tags)
    VALUES (@title, @platform, @date, @time, @status, @weight, @tags)
  `);
  const info = stmt.run({
    title: payload.title,
    platform: payload.platform,
    date: payload.date,
    time: payload.time || '',
    status: payload.status || 'planned',
    weight: Number.isFinite(Number(payload.weight)) ? Number(payload.weight) : 0.5,
    tags: JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
  });
  return db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
}

function safeParseTags(input) {
  try {
    const t = JSON.parse(input || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}
