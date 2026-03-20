import { describe, it, expect } from 'vitest';
import { buildWeeklyPlan, normalizeEvent, scoreSlot } from '../src/core.js';

describe('core: 评分 / 过滤 / 排序', () => {
  it('scoreSlot: 更匹配的平台/时段/标签应获得更高分', () => {
    const baseEvent = normalizeEvent({
      title: '普通内容',
      platform: 'douyin',
      weight: 0.6,
      tags: [],
      date: '2026-03-20',
    });

    const boostedEvent = normalizeEvent({
      title: '热点内容',
      platform: 'douyin',
      weight: 0.9,
      tags: ['hot', 'urgent'],
      date: '2026-03-20',
    });

    const low = scoreSlot(baseEvent, 'wechat', 8);
    const high = scoreSlot(boostedEvent, 'douyin', 20);

    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });

  it('buildWeeklyPlan: 仅纳入“事件日期 <= 当天”的候选（过滤）', () => {
    const plan = buildWeeklyPlan(
      [
        { id: 'e1', title: '今天可发', platform: 'douyin', date: '2026-03-20', weight: 0.8 },
        { id: 'e2', title: '未来才可发', platform: 'douyin', date: '2026-03-25', weight: 1 },
      ],
      {
        startDate: '2026-03-20',
        days: 1,
        platforms: ['douyin'],
        hours: [20],
        limitPerDay: 5,
      },
    );

    const ids = plan.map((x) => x.eventId);
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
  });

  it('buildWeeklyPlan: 每日候选按分数降序（同分按小时升序）排序', () => {
    const plan = buildWeeklyPlan(
      [{ id: 'e1', title: '测试事件', platform: 'douyin', date: '2026-03-20', weight: 1, tags: ['hot'] }],
      {
        startDate: '2026-03-20',
        days: 1,
        platforms: ['douyin'],
        hours: [8, 20],
        limitPerDay: 2,
      },
    );

    expect(plan.length).toBe(2);
    expect(plan[0].score).toBeGreaterThanOrEqual(plan[1].score);

    if (plan[0].score === plan[1].score) {
      expect(plan[0].hour).toBeLessThanOrEqual(plan[1].hour);
    }
  });
});

describe('core: 策略相关', () => {
  it('策略切换会影响推荐输出（保守 vs 激进）', () => {
    const events = [
      { id: 'safe', title: '高权重常规内容', platform: 'douyin', date: '2026-03-20', weight: 0.9, tags: [] },
      { id: 'hot', title: '热点内容', platform: 'douyin', date: '2026-03-20', weight: 0.7, tags: ['hot'] },
    ];

    const conservativePlan = buildWeeklyPlan(events, {
      startDate: '2026-03-20',
      days: 1,
      platforms: ['douyin'],
      hours: [20],
      limitPerDay: 1,
      tagBoost: { hot: 0 },
      platformHourWeights: { douyin: { 20: 1 } },
    });

    const aggressivePlan = buildWeeklyPlan(events, {
      startDate: '2026-03-20',
      days: 1,
      platforms: ['douyin'],
      hours: [20],
      limitPerDay: 1,
      tagBoost: { hot: 1 },
      platformHourWeights: { douyin: { 20: 1 } },
    });

    expect(conservativePlan[0].eventId).toBe('safe');
    expect(aggressivePlan[0].eventId).toBe('hot');
  });

  it('推荐结果包含可解释字段（score/tags）', () => {
    const plan = buildWeeklyPlan(
      [{ id: 'e-reason', title: '可解释性测试', platform: 'douyin', date: '2026-03-20', weight: 0.8, tags: ['hot'] }],
      {
        startDate: '2026-03-20',
        days: 1,
        platforms: ['douyin'],
        hours: [20],
        limitPerDay: 1,
      },
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]).toMatchObject({
      eventId: 'e-reason',
      score: expect.any(Number),
      tags: expect.any(Array),
    });
    expect(plan[0].tags.length).toBeGreaterThan(0);
  });
});
