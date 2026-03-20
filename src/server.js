import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const platforms = ['抖音', '小红书', 'B站', '视频号'];

const events = [
  {
    id: 1,
    title: '春季护肤清单短视频',
    platform: '抖音',
    date: new Date().toISOString().slice(0, 10),
    time: '20:00',
    status: 'planned',
  },
  {
    id: 2,
    title: '本周通勤穿搭图文',
    platform: '小红书',
    date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
    time: '12:30',
    status: 'planned',
  },
];

let nextId = 3;

function buildPlan(days = 7) {
  const today = new Date();
  const plan = [];

  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const date = d.toISOString().slice(0, 10);

    const items = platforms.map((platform, idx) => ({
      platform,
      topic: `${platform} 选题 #${i + 1}`,
      suggestedTime: ['10:00', '12:30', '18:00', '20:00'][idx % 4],
      date,
    }));

    plan.push({
      date,
      weekday: d.toLocaleDateString('zh-CN', { weekday: 'short' }),
      items,
    });
  }

  return plan;
}

app.get('/api/plan', (_req, res) => {
  res.json({
    days: 7,
    generatedAt: new Date().toISOString(),
    plan: buildPlan(7),
  });
});

app.get('/api/events', (_req, res) => {
  res.json({ events });
});

app.post('/api/events', (req, res) => {
  const { title, platform, date, time = '', status = 'planned' } = req.body || {};

  if (!title || !platform || !date) {
    return res.status(400).json({
      error: 'title, platform, date 为必填字段',
    });
  }

  const event = {
    id: nextId,
    title,
    platform,
    date,
    time,
    status,
  };

  nextId += 1;
  events.push(event);

  return res.status(201).json({ event });
});

app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Trend Calendar Tool running at http://localhost:${PORT}`);
});
