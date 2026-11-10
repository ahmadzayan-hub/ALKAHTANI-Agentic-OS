# Changelog

## 2026-11-10 - Confirm task and incident updates

- Task status updates and incident resolution return 404 when no row exists,
  rather than acknowledging the requested change. Success returns the actual
  updated row through `UPDATE ... RETURNING`.
- Malformed UUIDs return 400 before querying PostgreSQL; authentication still
  runs first. Five new HTTP regression tests cover both routes, including
  database failures and canonical returned IDs.

## 2026-08-20 — M6: Hardening — alerts, standup visibility, backups, docs
- **Alerts** (`services/alerts.ts`): a single `raiseIncident()` writes to
  `incidents` and, if `ALERT_WEBHOOK_URL` is set, best-effort POSTs a
  Slack/Discord-style webhook (unset → DB-only, never blocks the caller).
  Wired into both incident sources: agent run failures (`runtime/runner.ts`
  now raises one on catch, previously silent beyond `agent_runs.error`) and
  connector status drops (`connectors/index.ts`, refactored to use the same
  helper instead of its own inline insert).
- Routes: `GET /api/v1/alerts?resolved=` (list, joins agent/connector slugs),
  `PATCH /api/v1/alerts/{id}/resolve`. `GET /api/v1/conductor/standup/latest`
  surfaces the nightly Conductor standup banner (already scheduled at 07:00
  since M3) without re-running it.
- **Backups**: `scripts/backup_db.sh` — `pg_dump` to `$BACKUP_DIR`, gzipped,
  timestamped, prunes down to `$BACKUP_RETAIN` (default 14). Meant to run on
  a host cron / CronJob, not a new long-running service.
- **Docs**: `docs/API.md` rewritten to document the API as actually built
  (previous version was the pre-M1 aspirational contract) — implemented
  routes vs. what's still planned (Comms reply flow, Workflows/Personas
  CRUD, an approvals list/decide endpoint, any WS transport) called out
  explicitly rather than left ambiguous.
- Verified `GET /api/v1/alerts` query directly against the live seeded
  Supabase instance. Gate: `scripts/smoke/m6.sh`.

## 2026-08-19 — M5: Dashboard / Funnel / Tasks — live APIs + UI
- **API**: `GET /api/v1/dashboard/summary` (pipeline open/stalled, closed-won,
  monthly MRR from the latest `kpi_daily` snapshot, funnel reached-stage
  cascade, workforce live/total per department, task counts) —
  `GET|POST /api/v1/funnel*` (stage cascade with carry %, active journeys) —
  `GET|POST|PATCH /api/v1/tasks*` (board with counts, create, state moves).
  Reached-stage cascade is computed from `journeys.stage` (a journey at
  `converted` implicitly passed every earlier stage), which reproduces the
  seed's 34→28→20→15→7 numbers exactly rather than hardcoding them.
- Run-success/runs-today prefers live `agent_runs` for the current day and
  only falls back to the `kpi_daily` snapshot when nothing has run yet today
  — real activity always wins over the seeded demo numbers.
- **Web**: `/dashboard`, `/funnel`, `/tasks` pages (Next.js + Tailwind,
  matching the mockups' layout and dept palette) — Tasks includes an add box
  and one-click column moves wired to the new endpoints.
- Gate: `scripts/smoke/m5.sh`.

## 2026-08-18 — M4: MCP connector health probes
- **`connectors/`**: one real HTTP probe per named MCP connector — Attio, Stripe,
  PayPal, Square, Whop, Slack, Gmail, WhatsApp, ManyChat, Notion, GoHighLevel hit
  their actual account/self endpoints (Stripe balance, Slack `auth.test`, Gmail via
  a live OAuth refresh-token exchange, PayPal client-credentials grant, etc.); PAVA
  has no documented public health endpoint, so it reports "key present, validity
  unconfirmed" rather than faking a check. Every probe times out at 6s, classifies
  slow-but-ok responses as `degraded`, and turns any network/HTTP failure into an
  `offline` result — a probe never throws or crashes the health-check pass. An
  unset env key short-circuits to `offline` with no network call at all.
- Status transitions land in `connectors` (`status`, `latency_ms`, `last_sync_at`,
  `health` jsonb) and open an `incidents` row on any drop out of `live`.
- Routes: `GET /api/v1/connectors`, `POST /api/v1/connectors/:slug/check`,
  `POST /api/v1/connectors/check-all`. Scheduler runs `check-all` on a 5-minute
  BullMQ repeatable job (Redis down degrades the same way the agent cron does).
- Security note: the Gmail probe's OAuth access token is used in-memory only and
  never written into a `ProbeResult.detail` — that field is persisted to
  `connectors.health` and returned over the API, so no token can leak through it.
- Gate: `scripts/smoke/m4.sh`.

## 2026-08-14 — LLM provider: Grok API (xAI)
- New `services/llm.ts`: chat/JSON generation goes to the Grok API
  (`api.x.ai/v1/chat/completions`, `GROK_MODEL` default `grok-4`,
  `response_format: json_object`); local Ollama is the automatic fallback when
  `XAI_API_KEY` is unset or Grok errors. `/system/status` now reports the
  active provider+model.
- Embeddings stay local (`bge-m3`, 1024-dim — xAI has no embeddings endpoint),
  so `embeddings vector(1024)` and G-Brain search are unchanged. Whisper stays.
- Sweep: schema defaults, all 35 vault identities + seed, openclaw template,
  compose env, `.env.example`, and the Org Chart / Workflows / Personas mockup
  model labels now read `grok-4`.

## 2026-08-14 — M3: agent runtime
- **Vault loader** (`runtime/vault.ts`): parses AGENT CONTRACT frontmatter +
  sections, syncs identities → `agents` (vault owns identity fields, DB keeps
  runtime status so approvals survive re-sync). `POST /agents/sync`.
- **Runner** (`runtime/runner.ts`): identity + top-k pgvector context → local
  LLM (JSON plan) → tasks/approvals → output markdown to
  `crews/<crew>/notes/` → `agent_runs` row (success/fail powers run-success %).
  Disabled agents only run with `trigger=shadow`.
- **Scheduler** (`runtime/scheduler.ts`): BullMQ repeatable job per
  `schedule_cron` + the 07:00 Conductor standup; Redis down degrades
  gracefully instead of killing the API.
- **tmux crews** (`runtime/tmux.ts`): one `os-<crew>` session per crew;
  list/ensure/restart; tmux added to the api image.
- **Conductor** (`runtime/conductor.ts`): daily standup (failures, stalled
  deals, overdue tasks, comms unread>24h → ≤3 tasks/crew + 10-line banner into
  `kpi_daily`, standup note in `notes/standups/`), operator chat, `broadcast`,
  `openclaw` (ad-hoc shadow sub-agent, one immediate run, never live without
  approval). Deterministic fallbacks when the local LLM is unreachable.
- Routes: `/api/v1/agents/*`, `/api/v1/conductor/*` (chat, broadcast, spawn,
  standup, tmux, runs). Enable-to-live gated on an `agent_enable` approval.
- Whole API typechecks clean under strict TS; `scripts/smoke/m3.sh` is the gate.

## 2026-08-14 — Design system + M1/M2 integration
- **Design:** 10 hi-fi mockups as real HTML/SVG (`design/mockups/`), rendered to
  3360×1890 PNGs: G-Brain, Org Chart, Dashboard, Sales sub-graph, Comms, Funnel,
  Workflows, Connections, Personas, hero shot. Single token sheet (`base.css`),
  JetBrains Mono embedded, dept palette validated on the dark surface
  (TECH shifted to #D05CFF for CVD separation from Comms blue; every dept color
  always ships with a text label).
- **Copy fixes vs AI reference renders:** "Furlesen"→removed, "Enganed"→Engaged,
  "WhatsAmp"→WhatsApp, "Ravb"→PAVA, "Savc"→Slack, "qwan3.6"→qwen3.6-hermes;
  funnel corrected to a monotonic cascade 34→28→20→15→7 (derived from the
  journeys seed; the reference's 34/34/26/30/7 was a render artifact).
- **Schema v3** (Operator deliverable) adopted at `schema.sql` with fixes:
  `uuid pk`→`uuid primary key`; dept seed colors aligned to design tokens.
- **Seed:** `scripts/generate_vault_and_seed.py` (fixed: f-string quoting,
  `'a'||b` Python concat, `s.title` call, conductor insert) → 35 vault
  identities + `seed.sql` (114 nodes, 22 connectors 18 live, dashboard KPIs).
- **M1 skeleton:** docker-compose (pgvector, redis, ollama, whisper profile,
  api, web), Fastify API with operator bearer auth + `/system/status`,
  Next.js shell with exact S4 sidebar.
- **M2 G-Brain:** ingest pipeline (text/voice/upload → markdown vault → chunk
  → bge-m3 embed → graph edges), `/gbrain/{graph,subgraph,search,stats}`,
  radial web page. Fixes vs draft: `embeddings.note_id` join in search,
  `db` extracted to `db.ts` (no route↔bootstrap circular import), LLM
  classifier falls back to keywords when Ollama is down.

## 2026-08-13 — Pre-M1 planning
- Repo tree, initial schema draft, API contract, milestone checklist, env vars
  (`docs/PLAN.md`). Superseded where noted by schema v3.
