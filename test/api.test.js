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

  it('GET /api/export?format=csv 返回可下载CSV', async () => {
    const res = await request(BASE_URL).get('/api/export?format=csv');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/csv');
    expect(res.text.startsWith('date,platform,time,title,score')).toBe(true);
  });
});
