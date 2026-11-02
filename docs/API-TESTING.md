# API contract regression gate

Run `npm ci` and `npm test --workspace apps/api` from the repository root.
The PR workflow runs this gate on Node 22, independently of the Pages deploy.

These tests inject HTTP requests into the actual Fastify task, funnel and system
routes. They check authorization denial before database access, invalid input,
parameter binding and reconciliation of task/funnel responses. Database query
results are synthetic and stubbed; no services, secrets or external calls run.
Importing the production bootstrap is deliberately avoided because it starts
the scheduler, vault synchronization and tmux sessions.

The tests found two issues: bare tokens were accepted without a Bearer scheme,
and non-string task titles produced HTTP 500. Those now return 401 and 400.

This is the initial API contract gate, not completion of M1–M6. Live PostgreSQL
schema/transactions, scheduler/runner execution, approval consumption, connector
access, voice/LLM inference, backups and browser milestones still need their
own integration acceptance. The planned `/api/*` paths in PLAN.md predate the
current `/api/v1/*` implementation; these tests cover current routes.
