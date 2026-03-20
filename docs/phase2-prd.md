# Phase 2 PRD：商业化最小闭环（套餐与配额）

> 项目：trend-calendar-tool  
> 目标：在不大改现有能力的前提下，快速上线可售卖版本（Free / Basic / Pro），实现“可限制、可提示、可升级”。

---

## 1. 商业化目标（MVP）

1. **把核心价值和付费点绑定**：
   - 免费可体验（能生成计划）
   - 付费可提升效率（更高配额、更强导出与策略）
2. **先做最小闭环**：
   - 能识别用户套餐
   - 能统计用量
   - 超限时能提示并引导升级
3. **尽量复用现有接口和设置结构**：
   - 已有 `/api/plan`、`/api/hotspots`、`/api/export`、`/api/settings`

---

## 2. 套餐设计（free/basic/pro）

> 计费周期按“月”设计，便于用户理解；后续可扩展年付。

### 2.1 套餐权益矩阵（建议）

| 功能/额度 | Free | Basic | Pro |
|---|---:|---:|---:|
| 月生成计划次数（/api/plan） | 30 | 300 | 2000 |
| 月热点导入次数（/api/hotspots） | 10 | 120 | 1000 |
| 可管理事件总数（events） | 200 | 2000 | 20000 |
| 导出次数（csv+md，/api/export） | 5/月 | 200/月 | 2000/月 |
| 可选平台数（settings.platforms） | 2 | 4 | 10 |
| 每日建议上限（effectiveLimitPerDay上限） | 2 | 8 | 20 |
| 策略模式（strategy） | balanced | balanced/conservative/aggressive | 全部 + future premium strategy |
| 团队协作/成员席位 | - | 1 | 3（可加购） |
| 商业用途许可 | 否（个人试用） | 是 | 是 |

### 2.2 定价建议（人民币）

- **Free**：¥0
- **Basic**：¥39/月（首月可 ¥29）
- **Pro**：¥129/月（建议提供 ¥1290/年，约 8.3 折）

---

## 3. 可落地字段设计

> 目标字段：`plan_limits`、`usage_counters`、`pricing_notes`。  
> 可先存入 settings 表（JSON），后续再拆正式 billing 表也可平滑迁移。

### 3.1 plan_limits（静态套餐配置）

用于定义每个套餐“理论上限”，建议以系统级配置维护。

```json
{
  "free": {
    "monthlyPlanRuns": 30,
    "monthlyHotspotImports": 10,
    "monthlyExports": 5,
    "maxEvents": 200,
    "maxPlatforms": 2,
    "maxLimitPerDay": 2,
    "allowedStrategies": ["balanced"],
    "seats": 1,
    "commercialUse": false
  },
  "basic": {
    "monthlyPlanRuns": 300,
    "monthlyHotspotImports": 120,
    "monthlyExports": 200,
    "maxEvents": 2000,
    "maxPlatforms": 4,
    "maxLimitPerDay": 8,
    "allowedStrategies": ["balanced", "conservative", "aggressive"],
    "seats": 1,
    "commercialUse": true
  },
  "pro": {
    "monthlyPlanRuns": 2000,
    "monthlyHotspotImports": 1000,
    "monthlyExports": 2000,
    "maxEvents": 20000,
    "maxPlatforms": 10,
    "maxLimitPerDay": 20,
    "allowedStrategies": ["balanced", "conservative", "aggressive"],
    "seats": 3,
    "commercialUse": true
  }
}
```

字段说明：
- `monthlyPlanRuns`：每月调用 `/api/plan` 的总次数
- `monthlyHotspotImports`：每月调用 `/api/hotspots` 次数
- `monthlyExports`：每月导出次数（csv+md共享）
- `maxEvents`：可存储事件总上限
- `maxPlatforms`：settings 中 platforms 可选数量上限
- `maxLimitPerDay`：`limitPerDay` 可设置上限
- `allowedStrategies`：可用策略白名单
- `seats`：席位数（阶段2可只展示，不做复杂权限）
- `commercialUse`：商业用途许可标识（用于条款与营销文案）

### 3.2 usage_counters（用户/工作区用量计数）

用于记录当前计费周期已使用量，支持超限拦截与提醒。

```json
{
  "scopeId": "workspace_123",
  "plan": "free",
  "period": "2026-03",
  "counters": {
    "planRuns": 12,
    "hotspotImports": 3,
    "exports": 1,
    "eventCount": 57
  },
  "seatsUsed": 1,
  "updatedAt": "2026-03-21T01:00:00+08:00"
}
```

字段说明：
- `scopeId`：计费主体（个人或团队工作区）
- `plan`：当前套餐
- `period`：计费周期（YYYY-MM）
- `counters.planRuns`：当月计划生成已使用次数
- `counters.hotspotImports`：当月热点导入已使用次数
- `counters.exports`：当月导出已使用次数
- `counters.eventCount`：当前事件总量（非月累计，实时值）
- `seatsUsed`：已占用席位

### 3.3 pricing_notes（前端展示与运营说明）

用于价格页/弹窗文案统一配置，避免硬编码。

```json
{
  "currency": "CNY",
  "plans": {
    "free": {
      "priceMonthly": 0,
      "badge": "免费体验",
      "tagline": "快速试用，适合个人轻量创作"
    },
    "basic": {
      "priceMonthly": 39,
      "originalPriceMonthly": 49,
      "badge": "推荐",
      "tagline": "稳定产出首选，适合个人创作者"
    },
    "pro": {
      "priceMonthly": 129,
      "priceYearly": 1290,
      "badge": "团队/专业",
      "tagline": "高频运营与小团队协作"
    }
  },
  "trial": {
    "enabled": true,
    "days": 7,
    "appliesTo": ["basic", "pro"]
  },
  "upgradeCta": {
    "default": "升级套餐，解锁更高配额",
    "limitReached": "本月额度已用尽，立即升级继续生成"
  },
  "legal": {
    "refundPolicy": "按平台订阅政策执行",
    "taxIncluded": true
  }
}
```

---

## 4. 接口与校验落点（供研发实现）

### 4.1 校验时机

1. `/api/plan` 前置校验 `planRuns`
2. `/api/hotspots` 前置校验 `hotspotImports`
3. `/api/export` 前置校验 `exports`
4. `POST /api/events` 前置校验 `eventCount <= maxEvents`
5. `PUT /api/settings` 校验：
   - `platforms.length <= maxPlatforms`
   - `limitPerDay <= maxLimitPerDay`
   - `strategy ∈ allowedStrategies`

### 4.2 超限返回建议

统一返回：`402 Payment Required`（或保持 403，但建议新增标准业务码）

```json
{
  "error": "PLAN_LIMIT_REACHED",
  "message": "本月计划生成额度已用尽",
  "plan": "free",
  "limitType": "monthlyPlanRuns",
  "current": 30,
  "limit": 30,
  "nextResetAt": "2026-04-01T00:00:00+08:00",
  "upgradeTo": ["basic", "pro"]
}
```

---

## 5. UI 文案建议（可直接用于前端）

### 5.1 套餐页卡片文案

**Free**
- 标题：免费版
- 副标题：先用起来，验证你的选题流程
- 要点：每月 30 次计划生成、5 次导出、2 平台
- 按钮：免费开始

**Basic（主推）**
- 标题：Basic
- 副标题：日更创作者的高性价比选择
- 要点：每月 300 次计划生成、200 次导出、4 平台
- 按钮：升级 Basic
- 角标：推荐

**Pro**
- 标题：Pro
- 副标题：高频运营与小团队协作
- 要点：每月 2000 次计划生成、团队席位、高配额
- 按钮：升级 Pro

### 5.2 配额进度条文案

- `本月计划生成：12 / 30`
- `本月导出：1 / 5`
- `事件容量：57 / 200`
- 低余量提醒（>=80%）：`你已使用 80% 的本月额度，建议提前升级避免中断。`

### 5.3 超限弹窗文案

标题：`本月额度已用尽`

正文（free 场景）：
`你已用完免费版本月计划生成额度（30 次）。升级 Basic 可提升至 300 次/月，继续生成发布计划。`

按钮：
- 主按钮：`立即升级`
- 次按钮：`查看套餐对比`

### 5.4 设置页能力锁文案

- 锁定策略项：`该策略需 Basic 及以上套餐`
- 锁定平台数：`当前套餐最多选择 2 个平台，升级后可扩展`
- 锁定 limitPerDay：`当前套餐每日建议上限为 2`

---

## 6. 埋点与关键指标（阶段2必看）

1. `paywall_view`：看到升级弹窗次数
2. `upgrade_click`：点击升级按钮次数
3. `limit_blocked_action`：被额度拦截次数（按 limitType 分组）
4. `plan_conversion`：free→basic、basic→pro 转化率
5. `retention_by_plan`：各套餐 7日/30日留存

---

## 7. 上线建议（最小路径）

1. 先接入 `plan_limits + usage_counters`，实现“可拦截、可提示”
2. 再补 `pricing_notes` 驱动前端套餐页
3. 最后增加试用与优惠（不阻塞首发）

> 这样可以在最少代码改动下完成阶段2商业闭环：**体验 → 触达限制 → 引导升级**。
