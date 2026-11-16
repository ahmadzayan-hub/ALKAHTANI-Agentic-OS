# Agent enable approval consumption

`PATCH /api/v1/agents/:slug` consumes one approved `agent_enable` request
when moving an agent from a non-live status to `live`. The approval must name
the same agent slug, bind `requested_by` to that agent's current database ID,
request `live`, and have no `payload.consumed_at` marker. Older incomplete or
unbound approvals are ineligible; the endpoint creates a new pending request.

The transaction locks the agent row, selects and locks one eligible approval,
records `payload.consumed_at`, and changes the agent status atomically. A failed
status update rolls consumption back. An already-live retry consumes nothing.
Concurrent pending requests through this route reuse one pending approval.
The approval's decision, operator, timestamp and original payload are retained.
No schema migration is required.

Historical approvals have no consumption history. A matching approved record
without the marker can be used once after this change; prior use cannot be
inferred retroactively. This change does not modify existing approval records
until the endpoint consumes them.

Disabling an agent does not erase consumed approvals. Re-enabling requires
another unconsumed approval. This gate covers this HTTP endpoint; it does not
claim to gate direct database changes, vault synchronization, scheduler actions
or other runtime permissions. It does not execute approval payloads.

## Native regression gate

From the repository root, install dependencies with `npm ci`, put PostgreSQL
`bin` on PATH, then run:

```sh
python scripts/test-agent-approval-postgres.py
npm test --workspace apps/api
npx tsc --noEmit --project apps/api/tsconfig.json
```

The runner initializes its own loopback-only cluster with a random synthetic
password, verifies the server data directory, invokes the actual Fastify route,
stops the server and removes only its temporary cluster. It ignores any supplied
`DATABASE_URL`; no existing database, real agent or external provider is used.
The fixture loads the relevant production enums and tables from `schema.sql`.
It covers unauthorized/invalid/missing requests, concurrent pending requests,
consumption and re-enable replay, ineligible approvals, concurrent retries with
multiple approvals, and rollback after a PostgreSQL trigger rejects the update.
CI runs the same command on PostgreSQL 16; local evidence uses PostgreSQL 17.

This closes a bounded approval-consumption defect. It does not establish full
M1–M6 acceptance, pgvector integration, scheduler operation or live deployment.
