# Trend Calendar Tool

A lightweight publish-planning tool for content creators and small teams.

## Features

- Event model with platform/date/weight/tags
- 7-day publish plan generation
- Configurable planning strategy via settings (platforms/hours/limitPerDay)
- API endpoints:
  - `GET /api/plan`
  - `GET /api/events`
  - `POST /api/events`
  - `GET /api/settings`
  - `PUT /api/settings`
  - `POST /api/hotspots`
  - `GET /api/export?format=csv|md`
  - `GET /api/billing/summary`
- Minimal web UI grouped by platform
- Unit + API tests

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Test

```bash
npm test
```

## Strategy Configuration

Current version controls recommendation strategy through `/api/settings`:

- `platforms`: candidate platforms for scheduling
- `hours`: candidate publish hours (0~23)
- `limitPerDay`: max recommendations per day

These settings directly affect generated plan output (`GET /api/plan`).

### Example: switch to evening strategy

```bash
curl -X PUT http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{
    "platforms": ["douyin", "bilibili"],
    "hours": [20, 21, 22],
    "limitPerDay": 2
  }'
```

### Example: switch to daytime strategy

```bash
curl -X PUT http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{
    "platforms": ["wechat"],
    "hours": [8, 10, 12],
    "limitPerDay": 1
  }'
```

## Recommendation Explanation Fields

For recommendation transparency:

- Core plan items contain `score` and (in core layer) `tags`
- API plan items contain `score` and `eventId` for traceability

You can use these fields to explain why an item was ranked higher.

## 计费 / 配额

系统按“月配额”统计调用消耗，推荐使用以下接口进行自助核对：

- `GET /api/billing/summary`
  - 返回当前计费周期摘要（如 `period`）
  - 包含当前套餐与总配额（`plan.code`, `plan.monthlyQuota`）
  - 包含已用/剩余（`usage.used`, `usage.remaining`）

- 配额消耗入口（当前实现）
  - `POST /api/hotspots`：按 `topics.length` 计入配额消耗
  - `GET /api/export`：按导出行数计入配额消耗
  - 成功时会在响应中返回 `billing.ok=true` 与 `billing.consumedUnits`
  - 当请求消耗超过剩余额度时，接口返回 `402` 并拒绝本次操作

### 示例：查询账单摘要

```bash
curl http://localhost:3000/api/billing/summary
```

### 示例：通过热点导入消耗配额（2 单位）

```bash
curl -X POST http://localhost:3000/api/hotspots \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "douyin",
    "topics": ["热点A", "热点B"]
  }'
```
