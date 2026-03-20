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
