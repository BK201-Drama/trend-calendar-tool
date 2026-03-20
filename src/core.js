/**
 * Trend Calendar Core
 *
 * 目标：
 * 1) 定义统一事件模型（平台、日期、权重、标签）
 * 2) 对“平台 + 时段”进行评分
 * 3) 生成未来 7 天的发布建议列表
 *
 * 说明：
 * - 使用纯 JS（ESM）
 * - 不依赖第三方库
 */

/** 默认平台清单（可通过 options.platforms 覆盖） */
export const DEFAULT_PLATFORMS = ["douyin", "xiaohongshu", "bilibili", "wechat"];

/**
 * 平台时段偏好权重（0~1）
 * 可在 options.platformHourWeights 中覆盖
 */
export const DEFAULT_PLATFORM_HOUR_WEIGHTS = {
  douyin: {
    8: 0.35,
    12: 0.65,
    18: 0.85,
    20: 1.0,
    22: 0.55,
  },
  xiaohongshu: {
    9: 0.45,
    12: 0.7,
    17: 0.9,
    20: 1.0,
    21: 0.85,
  },
  bilibili: {
    10: 0.5,
    14: 0.65,
    19: 0.95,
    21: 1.0,
    23: 0.6,
  },
  wechat: {
    8: 0.6,
    12: 0.75,
    18: 0.95,
    20: 0.8,
  },
};

/**
 * 标签系数（叠加影响）
 * 可在 options.tagBoost 覆盖
 */
export const DEFAULT_TAG_BOOST = {
  hot: 0.25,
  urgent: 0.2,
  campaign: 0.15,
  evergreen: -0.05,
};

/**
 * 策略模板：控制评分维度偏好
 * - balanced: 兼顾权重、平台、时段、标签（默认）
 * - conservative: 更重平台契合和高峰时段，降低标签波动影响
 * - aggressive: 更重事件权重和热点标签，放宽平台/时段约束
 */
export const STRATEGY_PROFILES = {
  balanced: {
    baseWeight: 70,
    platformWeight: 15,
    hourWeight: 15,
    tagWeight: 20,
  },
  conservative: {
    baseWeight: 65,
    platformWeight: 22,
    hourWeight: 20,
    tagWeight: 10,
  },
  aggressive: {
    baseWeight: 78,
    platformWeight: 12,
    hourWeight: 10,
    tagWeight: 30,
  },
};

/** 默认候选发布时段 */
const DEFAULT_HOURS = [8, 10, 12, 14, 17, 18, 19, 20, 21, 22];

/** 时间常量 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 工具：限制数值范围 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 将 Date 归一化到当天零点（本地时区）
 */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 将日期格式化为 YYYY-MM-DD
 */
function toDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 尝试解析日期输入
 * 支持：Date / 时间戳 / ISO 字符串 / YYYY-MM-DD
 */
function parseDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input);
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 解析策略配置：支持 strategyProfile 为字符串或覆盖对象 */
function resolveStrategy(options = {}) {
  const rawProfile = options.strategyProfile;
  const profileName = typeof rawProfile === "string" ? rawProfile.toLowerCase() : "balanced";
  const baseProfile = STRATEGY_PROFILES[profileName] || STRATEGY_PROFILES.balanced;

  if (rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)) {
    return {
      ...baseProfile,
      ...rawProfile,
    };
  }

  return baseProfile;
}

function explainSlot(event, platform, hour, options = {}) {
  const p = String(platform || "").toLowerCase();
  const h = clamp(Math.floor(Number(hour) || 0), 0, 23);

  const platformHourWeights = options.platformHourWeights || DEFAULT_PLATFORM_HOUR_WEIGHTS;
  const tagBoost = options.tagBoost || DEFAULT_TAG_BOOST;
  const strategy = resolveStrategy(options);

  const weightValue = clamp(Number(event?.weight ?? 0.5), 0, 1);
  const base = weightValue * Number(strategy.baseWeight ?? 70);

  let platformFit = 0.6;
  const ep = event?.platform;
  if (ep === "all") {
    platformFit = 0.85;
  } else if (Array.isArray(ep)) {
    platformFit = ep.includes(p) ? 1.0 : 0.4;
  } else if (typeof ep === "string") {
    platformFit = ep === p ? 1.0 : 0.35;
  }

  const hourWeight = platformHourWeights?.[p]?.[h] ?? 0.55;

  const tags = Array.isArray(event?.tags) ? event.tags : [];
  let tagScore = 0;
  for (const tag of tags) {
    tagScore += Number(tagBoost?.[tag] || 0);
  }

  const platformPart = platformFit * Number(strategy.platformWeight ?? 15);
  const hourPart = hourWeight * Number(strategy.hourWeight ?? 15);
  const tagPart = tagScore * Number(strategy.tagWeight ?? 20);

  const score = Math.round(clamp(base + platformPart + hourPart + tagPart, 0, 100));

  const reasonTags = [];
  const reasons = [];

  if (weightValue >= 0.75) {
    reasonTags.push("high_weight");
    reasons.push("事件优先级高");
  }

  if (platformFit >= 0.95) {
    reasonTags.push("platform_match");
    reasons.push("平台匹配度高");
  }

  if (hourWeight >= 0.9) {
    reasonTags.push("platform_peak");
    reasons.push("命中平台高峰时段");
  }

  if (tags.includes("hot")) {
    reasonTags.push("hot_tag");
    reasons.push("包含热点标签");
  }

  if (tags.includes("urgent")) {
    reasonTags.push("urgent_tag");
    reasons.push("具备时效性");
  }

  if (!reasonTags.length) {
    reasonTags.push("balanced_fit");
    reasons.push("综合匹配度稳定");
  }

  return { score, reasonTags, reasons };
}

/**
 * 归一化单个事件为统一模型
 *
 * 事件模型：
 * {
 *   id: string,
 *   title: string,
 *   platform: string | string[],
 *   date: 'YYYY-MM-DD',
 *   weight: number (0~1),
 *   tags: string[]
 * }
 */
export function normalizeEvent(raw, index = 0) {
  const safeRaw = raw && typeof raw === "object" ? raw : {};

  const title = typeof safeRaw.title === "string" && safeRaw.title.trim()
    ? safeRaw.title.trim()
    : `event-${index + 1}`;

  const id = typeof safeRaw.id === "string" && safeRaw.id.trim()
    ? safeRaw.id.trim()
    : `${title}-${index + 1}`;

  const dateObj = parseDate(safeRaw.date);
  const date = dateObj ? toDateKey(dateObj) : toDateKey(new Date());

  // platform 支持 string / string[]，统一保留原始语义
  let platform = safeRaw.platform;
  if (Array.isArray(platform)) {
    platform = platform.filter(Boolean).map((p) => String(p).toLowerCase());
  } else if (typeof platform === "string" && platform.trim()) {
    platform = platform.trim().toLowerCase();
  } else {
    platform = "all";
  }

  const weightRaw = Number(safeRaw.weight);
  const weight = Number.isFinite(weightRaw) ? clamp(weightRaw, 0, 1) : 0.5;

  const tags = Array.isArray(safeRaw.tags)
    ? safeRaw.tags.filter(Boolean).map((t) => String(t).toLowerCase())
    : [];

  return { id, title, platform, date, weight, tags };
}

/**
 * 计算单个“事件-平台-小时”槽位评分
 *
 * @param {object} event - 归一化事件模型
 * @param {string} platform - 平台名
 * @param {number} hour - 小时（0~23）
 * @param {object} [options]
 * @returns {number} 0~100
 */
export function scoreSlot(event, platform, hour, options = {}) {
  return explainSlot(event, platform, hour, options).score;
}

/**
 * 生成未来 7 天的发布建议列表
 *
 * @param {Array<object>} events - 原始事件数组
 * @param {object} [options]
 * @param {Date|string|number} [options.startDate] - 计划起始日，默认今天
 * @param {string[]} [options.platforms] - 候选平台列表
 * @param {number[]} [options.hours] - 候选小时列表
 * @param {number} [options.days] - 计划天数，默认 7
 * @param {number} [options.limitPerDay] - 每日建议条数，默认每平台 1 条
 * @returns {Array<object>}
 */
export function buildWeeklyPlan(events = [], options = {}) {
  const days = Math.max(1, Math.floor(Number(options.days) || 7));
  const platforms = Array.isArray(options.platforms) && options.platforms.length
    ? options.platforms.map((p) => String(p).toLowerCase())
    : DEFAULT_PLATFORMS;
  const hours = Array.isArray(options.hours) && options.hours.length
    ? options.hours.map((h) => clamp(Math.floor(Number(h) || 0), 0, 23))
    : DEFAULT_HOURS;

  const start = startOfDay(parseDate(options.startDate) || new Date());

  // 默认每天每个平台取 1 条；可通过 limitPerDay 调整
  const limitPerDay = Math.max(1, Math.floor(Number(options.limitPerDay) || platforms.length));

  const normalized = (Array.isArray(events) ? events : []).map((e, i) => normalizeEvent(e, i));
  const suggestions = [];

  for (let i = 0; i < days; i += 1) {
    const dayDate = new Date(start.getTime() + i * ONE_DAY_MS);
    const dayKey = toDateKey(dayDate);

    // 取“事件日 <= 当前日”的事件作为可发布候选
    const dayEvents = normalized.filter((e) => e.date <= dayKey);
    if (!dayEvents.length) continue;

    const dayCandidates = [];

    for (const event of dayEvents) {
      for (const platform of platforms) {
        for (const hour of hours) {
          const { score, reasonTags, reasons } = explainSlot(event, platform, hour, options);
          dayCandidates.push({
            date: dayKey,
            platform,
            hour,
            score,
            eventId: event.id,
            title: event.title,
            tags: event.tags,
            reasonTags,
            reasons,
          });
        }
      }
    }

    // 先按得分排序，再按时间早优先
    dayCandidates.sort((a, b) => b.score - a.score || a.hour - b.hour);

    // 去重策略：避免同一日同平台重复占满
    const selected = [];
    const usedPlatform = new Set();

    for (const item of dayCandidates) {
      if (selected.length >= limitPerDay) break;

      if (!usedPlatform.has(item.platform) || usedPlatform.size >= platforms.length) {
        selected.push(item);
        usedPlatform.add(item.platform);
      }
    }

    suggestions.push(...selected);
  }

  return suggestions;
}

export default {
  normalizeEvent,
  scoreSlot,
  buildWeeklyPlan,
  STRATEGY_PROFILES,
};
