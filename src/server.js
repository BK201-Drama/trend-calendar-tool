import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWeeklyPlan } from './core.js';
import { createEvent, getSetting, listEvents, setSetting } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function toDisplayPlatform(platform) {
  const map = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    bilibili: 'B站',
    wechat: '视频号',
  };
  return map[String(platform).toLowerCase()] || platform;
}

function formatPlan(days, suggestions) {
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, {
      date: key,
      weekday: d.toLocaleDateString('zh-CN', { weekday: 'short' }),
      items: [],
    });
  }

  for (const s of suggestions) {
    if (!byDay.has(s.date)) continue;
    byDay.get(s.date).items.push({
      platform: toDisplayPlatform(s.platform),
      topic: s.title,
      suggestedTime: `${String(s.hour).padStart(2, '0')}:00`,
      date: s.date,
      score: s.score,
      eventId: s.eventId,
    });
  }

  for (const v of byDay.values()) {
    v.items.sort((a, b) => b.score - a.score || a.suggestedTime.localeCompare(b.suggestedTime));
  }

  return Array.from(byDay.values());
}

const DEFAULT_SETTINGS = {
  platforms: ['douyin', 'xiaohongshu', 'bilibili', 'wechat'],
  hours: [10, 12, 18, 20],
  limitPerDay: 4,
};

app.get('/api/plan', (req, res) => {
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
  const userSettings = getSetting('plan_settings', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };

  const events = listEvents();
  const suggestions = buildWeeklyPlan(events, {
    days,
    platforms: settings.platforms,
    hours: settings.hours,
    limitPerDay: settings.limitPerDay,
  });

  res.json({
    days,
    generatedAt: new Date().toISOString(),
    settings,
    plan: formatPlan(days, suggestions),
  });
});

app.get('/api/events', (_req, res) => {
  res.json({ events: listEvents() });
});

app.post('/api/events', (req, res) => {
  const { title, platform, date } = req.body || {};
  if (!title || !platform || !date) {
    return res.status(400).json({ error: 'title, platform, date 为必填字段' });
  }

  const normalizedPlatform = String(platform).toLowerCase();
  const event = createEvent({ ...req.body, platform: normalizedPlatform });
  return res.status(201).json({ event: { ...event, tags: Array.isArray(event.tags) ? event.tags : [] } });
});

app.get('/api/settings', (_req, res) => {
  const settings = getSetting('plan_settings', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
  res.json({ settings: { ...DEFAULT_SETTINGS, ...settings } });
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  const payload = {
    platforms: Array.isArray(body.platforms) ? body.platforms.map((x) => String(x).toLowerCase()) : DEFAULT_SETTINGS.platforms,
    hours: Array.isArray(body.hours)
      ? body.hours.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0 && x <= 23)
      : DEFAULT_SETTINGS.hours,
    limitPerDay: Number.isFinite(Number(body.limitPerDay)) ? Math.max(1, Number(body.limitPerDay)) : DEFAULT_SETTINGS.limitPerDay,
  };
  setSetting('plan_settings', payload);
  res.json({ settings: payload });
});

app.post('/api/hotspots', (req, res) => {
  const { topics, platform = 'douyin', date, weight = 0.8, tags = ['hot'] } = req.body || {};
  if (!Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'topics 必须是非空数组' });
  }

  const targetDate = date || new Date().toISOString().slice(0, 10);
  const created = [];
  for (const t of topics) {
    if (!t) continue;
    const ev = createEvent({
      title: String(t),
      platform: String(platform).toLowerCase(),
      date: targetDate,
      weight,
      tags,
      status: 'planned',
      time: '',
    });
    created.push(ev);
  }

  res.status(201).json({ createdCount: created.length, events: created });
});

app.get('/api/export', (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
  const userSettings = getSetting('plan_settings', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };
  const suggestions = buildWeeklyPlan(listEvents(), {
    days,
    platforms: settings.platforms,
    hours: settings.hours,
    limitPerDay: settings.limitPerDay,
  });

  if (format === 'md') {
    const lines = ['# 发布计划', '', `生成时间: ${new Date().toISOString()}`, ''];
    lines.push('| 日期 | 平台 | 时间 | 选题 | 分数 |');
    lines.push('|---|---|---|---|---|');
    for (const s of suggestions) {
      lines.push(`| ${s.date} | ${toDisplayPlatform(s.platform)} | ${String(s.hour).padStart(2, '0')}:00 | ${s.title} | ${s.score} |`);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send(lines.join('\n'));
  }

  const header = 'date,platform,time,title,score\n';
  const rows = suggestions
    .map((s) => `${s.date},${toDisplayPlatform(s.platform)},${String(s.hour).padStart(2, '0')}:00,"${String(s.title).replace(/"/g, '""')}",${s.score}`)
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  return res.send(header + rows + (rows ? '\n' : ''));
});

app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Trend Calendar Tool running at http://localhost:${PORT}`);
});
