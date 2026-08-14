# Scheduled demo reset

> **Status: the schedule is switched off.** There is no deployed backend yet, so
> `DEMO_RESET_URL` and `DEMO_RESET_TOKEN` are not set and every scheduled run failed on
> the guard — four for four, from 11 August 2026, each in under ten seconds. The `cron`
> line is commented out in the workflow and `workflow_dispatch` is left enabled. Restore
> it in the same commit that sets the two secrets, in stage 3.4 of the deployment plan.
>
> Everything below describes the reset as it works once that happens.

The public demo is open to anyone. Visitors file reports, change statuses and delete
hazards, and uploaded photos accumulate on a small disk. A nightly reset returns the
deployment to its seeded state, so the demo is always presentable and the disk never
grows without bound.

Implemented as a **GitHub Actions schedule** — `.github/workflows/demo-reset.yml`.

## What the reset does

`POST /demo/reset` performs a factory reset back to the seeded fixtures:

| | |
|---|---|
| Deletes | every hazard, every uploaded photo file, every visitor account |
| Keeps | the demo's own accounts, so the guest login keeps working |
| Re-seeds | the 15 fixtures from `backend/src/data/demoFixtures.ts` |
| Emits | a `hazard:deleted` SSE event, so open map tabs refetch instead of showing rows that now 404 |

The response reports `hazardsRemoved`, `photosRemoved`, `usersRemoved`, `hazardsSeeded`
and `durationMs`.

## Why Actions and not n8n

The original plan put this in n8n. The hosting decision changed that: the demo runs on
an **Azure B1s with 1 GB of RAM** (750 hours a month free for 12 months under Azure for
Students, so the $100 credit is never touched). n8n alone wants roughly 400 MB, which
would not leave room for the backend, the AI service, the proxy and the OS.

GitHub Actions costs nothing on a public repository, and the backend endpoint is
identical either way — the CLI script and the HTTP endpoint both call
`DemoService.resetToSeed()`, so nothing in the application changes.

If n8n is wanted for the portfolio story, run it **locally** for demonstrations and
screenshots. It does not need to run 24/7 in production to be worth talking about.

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
standard 404 and gives no hint the feature exists. When enabled, every request must
carry the token, compared in constant time. The server refuses to start if the flag is
on without a token.

This is deliberately **not** keyed off `NODE_ENV`: the portfolio deployment runs the
production profile, so gating on that would either expose a destructive endpoint
everywhere or nowhere.

## Repository secrets

Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `DEMO_RESET_URL` | `https://<your-domain>/demo/reset` |
| `DEMO_RESET_TOKEN` | the same token as `DEMO_RESET_TOKEN` on the server |

Unlike the n8n approach, the call arrives from outside, so it does travel over the
public internet — which is why HTTPS is mandatory and the token lives in Actions
secrets rather than in the workflow file.

## Schedule

`0 1 * * *` — 01:00 UTC. GitHub cron is always UTC, so this lands at 04:00 Israel time
in summer and 03:00 in winter. Both are quiet hours, which is the point: a reset should
never fire while someone is mid-session looking at the demo.

**Currently commented out** — see the status note at the top of this file.

`workflow_dispatch` is enabled either way, so you can trigger a reset by hand from the
Actions tab right before showing the project to someone. Use it once, and confirm it
returns 200, before uncommenting the schedule and trusting it to run unattended.

**Caveat worth knowing:** GitHub disables scheduled workflows in a public repository
after 60 days without repository activity. If the project goes quiet for two months the
nightly reset stops silently. Either push occasionally or re-enable it from the Actions
tab.

## Rate limiting

The endpoint allows six calls per hour. The schedule needs one a day; the remainder
leaves room to trigger a reset by hand before a demo without opening the door to
hammering it. The test profile is exempt.

## Alternatives

Host cron, if the demo ever moves to a machine with room to spare:

```cron
0 4 * * * docker exec cityscan-backend npm run seed:demo -- --force
```

Or an n8n workflow — Schedule Trigger on `0 4 * * *` into an HTTP Request node posting
to `http://backend:5000/demo/reset` with the token header. The advantage there is that
the call stays inside the Docker network and the token never crosses the public
internet; the cost is the ~400 MB of RAM that made it unviable on the free tier.
