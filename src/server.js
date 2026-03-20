import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWeeklyPlan } from './core.js';
import { consumeQuota, createEvent, getBillingSummary, getSetting, listEvents, setSetting } from './db.js';

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

function formatPlan(days, suggestions, strategy = 'balanced') {
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
    const item = {
      platform: toDisplayPlatform(s.platform),
      topic: s.title,
      suggestedTime: `${String(s.hour).padStart(2, '0')}:00`,
      date: s.date,
      score: s.score,
      eventId: s.eventId,
    };
    byDay.get(s.date).items.push({
      ...item,
      reason: buildReason(item, strategy),
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
  strategy: 'balanced',
};

function getStrategy(settings) {
  const strategy = String(settings?.strategy || 'balanced').toLowerCase();
  return ['balanced', 'conservative', 'aggressive'].includes(strategy) ? strategy : 'balanced';
}

function getEffectiveLimit(limitPerDay, strategy) {
  if (strategy === 'conservative') return Math.max(1, Math.floor(limitPerDay * 0.75));
  if (strategy === 'aggressive') return Math.max(1, Math.ceil(limitPerDay * 1.25));
  return limitPerDay;
}

function buildReason(item, strategy) {
  const scoreHint = item.score >= 80 ? '热度高' : item.score >= 60 ? '热度中等' : '可尝试测试';
  const timeHint = Number(item.suggestedTime?.slice(0, 2)) >= 18 ? '晚间活跃时段' : '白天稳定时段';
  const strategyHint = strategy === 'conservative'
    ? '稳健策略，优先更确定的发布时间'
    : strategy === 'aggressive'
      ? '激进策略，增加覆盖争取曝光'
      : '均衡策略，兼顾稳定与增长';
  return `${scoreHint}｜${timeHint}｜${strategyHint}`;
}

app.get('/api/plan', (req, res) => {
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
  const userSettings = getSetting('plan_settings', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };
  const strategy = getStrategy(settings);
  const effectiveLimitPerDay = getEffectiveLimit(settings.limitPerDay, strategy);

  const events = listEvents();
  const suggestions = buildWeeklyPlan(events, {
    days,
    platforms: settings.platforms,
    hours: settings.hours,
    limitPerDay: effectiveLimitPerDay,
  });

  res.json({
    days,
    generatedAt: new Date().toISOString(),
    settings: { ...settings, strategy, effectiveLimitPerDay },
    plan: formatPlan(days, suggestions, strategy),
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
    strategy: ['balanced', 'conservative', 'aggressive'].includes(String(body.strategy || '').toLowerCase())
      ? String(body.strategy).toLowerCase()
      : DEFAULT_SETTINGS.strategy,
  };
  setSetting('plan_settings', payload);
  res.json({ settings: payload });
});

app.get('/api/billing/summary', (_req, res) => {
  res.json(getBillingSummary());
});

app.post('/api/quota/consume', (req, res) => {
  const { action = 'manual', units = 1, detail = {} } = req.body || {};
  const result = consumeQuota(String(action), Number(units), detail);
  if (!result.ok) {
    return res.status(402).json({ error: result.message, ...result });
  }
  return res.json(result);
});

app.post('/api/hotspots', (req, res) => {
  const { topics, platform = 'douyin', date, weight = 0.8, tags = ['hot'] } = req.body || {};
  if (!Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'topics 必须是非空数组' });
  }

  const validTopics = topics.filter(Boolean);
  const quota = consumeQuota('hotspot_import', validTopics.length, {
    platform: String(platform).toLowerCase(),
    topicsCount: validTopics.length,
  });
  if (!quota.ok) {
    return res.status(402).json({ error: quota.message, billing: quota });
  }

  const targetDate = date || new Date().toISOString().slice(0, 10);
  const created = [];
  for (const t of validTopics) {
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

  res.status(201).json({ createdCount: created.length, events: created, billing: quota });
});

app.get('/api/export', (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
  const userSettings = getSetting('plan_settings', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };
  const strategy = getStrategy(settings);
  const effectiveLimitPerDay = getEffectiveLimit(settings.limitPerDay, strategy);
  const suggestions = buildWeeklyPlan(listEvents(), {
    days,
    platforms: settings.platforms,
    hours: settings.hours,
    limitPerDay: effectiveLimitPerDay,
  });

  const quota = consumeQuota('plan_export', suggestions.length, { format, days, rows: suggestions.length });
  if (!quota.ok) {
    return res.status(402).json({ error: quota.message, billing: quota });
  }

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
