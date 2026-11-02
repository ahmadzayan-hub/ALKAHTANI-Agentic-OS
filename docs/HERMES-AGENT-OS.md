# Agent OS / Hermes local milestone

This work builds on ALKAHTANI-Agentic-OS, based on draft PR #5 at
`dd4aa479e1379856aa43c890eadfe958a45ca788`. PR #5 is not merged or edited.
The local branch is `codex/hermes-agent-os-local`. No deployment is included.

## Implemented boundary

- `/agent-os` presents a manually loaded snapshot of existing agent registry,
  task states, pending approval count, and G-Brain node counts.
- `GET /api/v1/agent-os/overview` uses the existing operator authentication and
  existing database tables. It does not start the runner, scheduler, connector
  probes, ingestion, embeddings, or model calls.
- A configured `live` identity is labeled as a registry setting. Runtime state
  remains unverified. Database records may include seed data; counts are not
  proof of active production workloads.
- The new page uses an existing operator token held only in component memory.
  It makes no request before the operator loads the workspace, rejects redirects,
  has a five-second timeout, clears stale snapshots before reload, and aborts on
  disconnect. It does not introduce a credential, login service, or persisted token.
  `NEXT_PUBLIC_API` must already identify the trusted API origin; absent that, the
  page uses its current origin. A host/proxy must permit the existing authenticated
  request. This change does not add CORS permissions or a public network listener.
- `createHermesAdapter` is a bounded, metadata-only interface. Production creates
  it disabled, with no transport. Setting an environment variable cannot enable it.
  Future code must explicitly inject a reviewed transport. A stale, malformed,
  missing or unresponsive probe cannot report a connected runtime. Even a valid
  metadata probe does not grant execution or shared-memory access.
- Voice controls are unavailable. No microphone, camera, wake word, speech model,
  device-control bridge, file index, schedule, or external communication is enabled.

## Preserved boundaries

The existing task, registry, approvals and G-Brain tables stay authoritative.
No schema migration, seed regeneration, sync, or cross-profile memory merge occurs.
Hermes profiles (`default`, `aconex`, `branding`, `zoz`) remain outside this project.
Later sharing needs explicit project/profile scope, provenance, retention and
revocation; full session histories, secrets and unapproved RTA/private files are
not candidates for automatic sharing.

This is an original implementation. It does not include the reel author's private
Agent OS code and does not claim that 35 identity documents are 35 running agents.

## Validation and rollback

Observed locally on 2026-11-02 with Node 24.14.0:

- Locked install completed: 163 packages; lifecycle scripts and audit disabled.
- All 12 API/adapter tests passed (the six PR #5 tests plus six new tests).
- API and web TypeScript checks passed; `git diff --check` passed.
- The frontend alone compiled `/agent-os` and returned HTTP 200. Desktop browser
  inspection confirmed the disconnected state, disabled Load button with an
  empty token, unavailable-runtime labels and disabled voice control.
- A synthetic token against the frontend-only host produced the expected
  unavailable-API state (HTTP 404, because no API service was started).
  Disconnect cleared the token, restored the disabled Load button and kept
  all runtime/memory connections disconnected. The temporary preview was stopped.
- No production build, mobile layout check, live authenticated API connection,
  real database, model call or deployment was tested. Node 22 CI was not rerun
  remotely; no branch was pushed.

Run `npm ci --ignore-scripts --no-audit --no-fund`, then
`npm test --workspace apps/api`. Tests register the routes directly with synthetic
database results and fake metadata probes. They never import the production
bootstrap, which starts scheduler/vault/tmux work.

Type-check API and web separately using their existing TypeScript configurations.
Do not start the API bootstrap, Docker stack, scheduler, live runner, or provider
services for this milestone. Browser inspection can use the web frontend alone;
it starts disconnected and performs no automatic API request.

Rollback is local: preserve any later edits, then switch away from the isolated
branch or revert only this milestone's commit. The base branch, PR #5, Hermes
installation, credentials and database are unaffected by these application edits.

Not validated here: live Postgres transactions, actual Hermes transport, model
responses, task execution, voice, deployment, provider connectivity, or production
authentication/session integration. Existing legacy pages still use their earlier
development-token flow; this milestone does not claim that all application auth
or all M1–M6 gates have been completed.
