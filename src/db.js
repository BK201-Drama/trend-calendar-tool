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

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  units INTEGER NOT NULL,
  period TEXT NOT NULL,
  detail TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usages_period ON usages(period);
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

const defaultPlanCode = 'starter';
if (!db.prepare('SELECT id FROM plans WHERE code = ?').get(defaultPlanCode)) {
  db.prepare('INSERT INTO plans (code, name, monthly_quota) VALUES (?, ?, ?)').run(defaultPlanCode, 'Starter', 100);
}

function getPeriod(inputDate = new Date()) {
  const d = new Date(inputDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBillingSummary() {
  const plan = db.prepare('SELECT code, name, monthly_quota AS monthlyQuota FROM plans WHERE code = ?').get(defaultPlanCode);
  const period = getPeriod();
  const usedUnits = db.prepare('SELECT COALESCE(SUM(units), 0) AS used FROM usages WHERE period = ?').get(period).used;
  const remainingUnits = Math.max(0, (plan?.monthlyQuota || 0) - usedUnits);
  const overageUnits = Math.max(0, usedUnits - (plan?.monthlyQuota || 0));
  return {
    period,
    plan,
    usage: {
      usedUnits,
      remainingUnits,
      overageUnits,
      // backward-compatible aliases
      used: usedUnits,
      remaining: remainingUnits,
      overage: overageUnits,
    },
  };
}

export function consumeQuota(action, units = 1, detail = {}) {
  const amount = Math.max(0, Number.isFinite(Number(units)) ? Math.floor(Number(units)) : 0);
  if (amount <= 0) {
    return { ok: true, consumedUnits: 0, ...getBillingSummary() };
  }

  const summary = getBillingSummary();
  if (summary.usage.remainingUnits < amount) {
    return {
      ok: false,
      code: 'QUOTA_EXCEEDED',
      message: `配额不足：本月剩余 ${summary.usage.remainingUnits}，请求消耗 ${amount}`,
      requestedUnits: amount,
      ...summary,
    };
  }

  db.prepare('INSERT INTO usages (action, units, period, detail) VALUES (?, ?, ?, ?)').run(
    action,
    amount,
    summary.period,
    JSON.stringify(detail || {}),
  );

  return {
    ok: true,
    consumedUnits: amount,
    consumed: amount,
    ...getBillingSummary(),
  };
}

function safeParseTags(input) {
  try {
    const t = JSON.parse(input || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}
