# n8n — nightly demo reset

The public demo is open to anyone. Visitors file reports, change statuses and delete
hazards, and uploaded photos accumulate on a small disk. This workflow returns the
deployment to its seeded state every night, so the demo is always presentable and the
disk never grows without bound.

Set up during Phase 3, once n8n is running on the VPS.

## What the reset does

`POST /demo/reset` performs a factory reset back to the seeded fixtures:

| | |
|---|---|
| Deletes | every hazard, every uploaded photo file, every visitor account |
| Keeps | the demo's own accounts, so the guest login keeps working |
| Re-seeds | the 15 fixtures from `backend/src/data/demoFixtures.ts` |
| Emits | a `hazard:deleted` SSE event, so open map tabs refetch instead of showing rows that now 404 |

Response body reports `hazardsRemoved`, `photosRemoved`, `usersRemoved`, `hazardsSeeded`
and `durationMs`.

## Backend configuration

On the demo host only:

```
DEMO_RESET_ENABLED=true
DEMO_RESET_TOKEN=<32+ random characters>
```

Generate the token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Two independent guards protect it. The route is **not registered at all** unless
`DEMO_RESET_ENABLED` is exactly `true` — on any other deployment the path returns the
standard 404 and gives no hint the feature exists. When it is enabled, every request
must carry the token, compared in constant time. The server refuses to start if the
flag is on without a token.

Note this is deliberately **not** keyed off `NODE_ENV`: the portfolio deployment runs
the production profile, so gating on that would either expose a destructive endpoint
everywhere or nowhere.

## The workflow

Two nodes.

**1. Schedule Trigger** — Cron, `0 4 * * *` (04:00 daily). Low-traffic hour, so a reset
never lands mid-session while someone is looking at the demo.

**2. HTTP Request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `http://backend:5000/demo/reset` |
| Header | `X-Demo-Reset-Token: {{ $env.DEMO_RESET_TOKEN }}` |
| Timeout | `60000` |

Use the internal Docker service name (`http://backend:5000`), not the public domain.
The request then never leaves the Docker network, so the token is not carried over the
public internet and does not appear in proxy logs.

Optionally add a third node — Slack, email, or n8n's own error workflow — on the failure
branch, so a silently broken reset does not go unnoticed for weeks.

## Rate limiting

The endpoint allows six calls per hour. The schedule needs one a day; the remainder
leaves room to trigger a reset by hand before a demo without opening the door to
hammering it.

## Doing it without n8n

The same thing as a host cron entry:

```cron
0 4 * * * docker exec cityscan-backend npm run seed:demo -- --force
```

Both paths run identical code — the CLI script and the HTTP endpoint both call
`DemoService.resetToSeed()`. n8n is preferred because the schedule is visible and
adjustable without a redeploy, and because it gives the automation layer a real job
rather than an ornamental one.
