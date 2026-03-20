import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import request from 'supertest';

const PORT = 3300;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess;

function waitForServerReady(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const timer = setInterval(async () => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('服务启动超时'));
        return;
      }

      try {
        const res = await request(BASE_URL).get('/api/events');
        if (res.status === 200) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        // 继续等待
      }
    }, 150);
  });
}

beforeAll(async () => {
  serverProcess = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  await waitForServerReady();
});

afterAll(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
});

describe('api: supertest', () => {
  it('GET /api/plan 返回 7 天计划', async () => {
    const res = await request(BASE_URL).get('/api/plan');

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan).toHaveLength(7);
  });

  it('GET /api/events 返回事件列表', async () => {
    const res = await request(BASE_URL).get('/api/events');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  it('POST /api/events 缺少必填字段时返回 400', async () => {
    const res = await request(BASE_URL).post('/api/events').send({ title: '缺字段测试' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('必填');
  });

  it('POST /api/events 创建成功并可在列表中查到', async () => {
    const payload = {
      title: 'QA 新建事件',
      platform: 'douyin',
      date: '2026-03-21',
      time: '20:30',
      status: 'planned',
    };

    const createRes = await request(BASE_URL).post('/api/events').send(payload);
    expect(createRes.status).toBe(201);
    expect(createRes.body.event.title).toBe(payload.title);

    const listRes = await request(BASE_URL).get('/api/events');
    const found = listRes.body.events.find((e) => e.title === payload.title && e.date === payload.date);
    expect(found).toBeTruthy();
  });

  it('PUT /api/settings 可更新时段配置', async () => {
    const res = await request(BASE_URL).put('/api/settings').send({
      hours: [9, 13, 21],
      limitPerDay: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.settings.hours).toEqual([9, 13, 21]);
    expect(res.body.settings.limitPerDay).toBe(3);
  });

  it('策略切换（通过 settings.hours）会影响计划建议时段', async () => {
    await request(BASE_URL).put('/api/settings').send({
      platforms: ['douyin'],
      hours: [10],
      limitPerDay: 1,
    });
    const morningPlan = await request(BASE_URL).get('/api/plan?days=2');
    expect(morningPlan.status).toBe(200);

    const morningItems = morningPlan.body.plan.flatMap((d) => d.items || []);
    expect(morningItems.length).toBeGreaterThan(0);
    expect(morningItems.every((x) => x.suggestedTime === '10:00')).toBe(true);

    await request(BASE_URL).put('/api/settings').send({
      platforms: ['douyin'],
      hours: [20],
      limitPerDay: 1,
    });
    const nightPlan = await request(BASE_URL).get('/api/plan?days=2');
    const nightItems = nightPlan.body.plan.flatMap((d) => d.items || []);

    expect(nightItems.length).toBeGreaterThan(0);
    expect(nightItems.every((x) => x.suggestedTime === '20:00')).toBe(true);
  });

  it('GET /api/plan 推荐项包含可解释字段（score / eventId）', async () => {
    const res = await request(BASE_URL).get('/api/plan?days=2');
    expect(res.status).toBe(200);

    const items = res.body.plan.flatMap((d) => d.items || []);
    expect(items.length).toBeGreaterThan(0);

    const first = items[0];
    expect(first).toMatchObject({
      score: expect.any(Number),
      eventId: expect.any(String),
    });
  });

  it('GET /api/export?format=csv 返回可下载CSV', async () => {
    const res = await request(BASE_URL).get('/api/export?format=csv');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/csv');
    expect(res.text.startsWith('date,platform,time,title,score')).toBe(true);
  });

  it('GET /api/billing/summary 返回账单与配额摘要', async () => {
    const res = await request(BASE_URL).get('/api/billing/summary');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      period: expect.any(String),
      plan: expect.objectContaining({
        code: expect.any(String),
        monthlyQuota: expect.any(Number),
      }),
      usage: expect.objectContaining({
        usedUnits: expect.any(Number),
        remainingUnits: expect.any(Number),
        overageUnits: expect.any(Number),
      }),
    });
    expect(res.body.usage.usedUnits).toBeGreaterThanOrEqual(0);
    expect(res.body.usage.remainingUnits).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/hotspots 会消耗配额并反映到摘要', async () => {
    const before = await request(BASE_URL).get('/api/billing/summary');
    expect(before.status).toBe(200);

    const topics = ['配额消耗测试-A', '配额消耗测试-B'];
    const consumeRes = await request(BASE_URL).post('/api/hotspots').send({
      topics,
      platform: 'douyin',
    });

    expect(consumeRes.status).toBe(201);
    expect(consumeRes.body.createdCount).toBe(topics.length);
    expect(consumeRes.body.billing).toMatchObject({
      ok: true,
      consumedUnits: topics.length,
    });

    const after = await request(BASE_URL).get('/api/billing/summary');
    expect(after.status).toBe(200);
    expect(after.body.usage.usedUnits).toBeGreaterThanOrEqual(before.body.usage.usedUnits + topics.length);
    expect(after.body.usage.remainingUnits).toBeLessThanOrEqual(before.body.usage.remainingUnits - topics.length);
  });

  it('POST /api/hotspots 超额时应被拦截', async () => {
    const summary = await request(BASE_URL).get('/api/billing/summary');
    expect(summary.status).toBe(200);

    const overUnits = Number(summary.body.usage.remainingUnits || 0) + 1;
    const topics = Array.from({ length: overUnits }, (_, i) => `超额测试-${i + 1}`);
    const overRes = await request(BASE_URL).post('/api/hotspots').send({
      topics,
      platform: 'douyin',
    });

    expect(overRes.status).toBe(402);
    expect(overRes.body.error || overRes.body?.billing?.message || '').toMatch(/配额|quota|超额/i);
  });
});
