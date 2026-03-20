import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWeeklyPlan } from './core.js';
import { createEvent, listEvents } from './db.js';

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

app.get('/api/plan', (req, res) => {
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
  const events = listEvents();
  const suggestions = buildWeeklyPlan(events, { days });

  res.json({
    days,
    generatedAt: new Date().toISOString(),
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
  return res.status(201).json({ event: { ...event, tags: event.tags ? JSON.parse(event.tags) : [] } });
});

app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Trend Calendar Tool running at http://localhost:${PORT}`);
});
