import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { db } from "../src/db.js";
import { agentOsRoutes } from "../src/routes/agent-os.js";
import { createHermesAdapter } from "../src/integrations/hermes.js";

const originalQuery = db.query;
const originalToken = process.env.OPERATOR_TOKEN;
const headers = { authorization: "Bearer synthetic-agent-os-token" };
let results: Record<string, unknown>[][] = [];
let reads = 0;

beforeEach(() => {
  process.env.OPERATOR_TOKEN = "synthetic-agent-os-token";
  results = []; reads = 0;
  db.query = (async () => ({ rows: results[reads++] ?? [] })) as typeof db.query;
});
afterEach(() => {
  db.query = originalQuery;
  if (originalToken === undefined) delete process.env.OPERATOR_TOKEN;
  else process.env.OPERATOR_TOKEN = originalToken;
});
after(async () => { await db.end(); });

async function appForOverview() {
  const app = Fastify();
  await app.register(agentOsRoutes, { prefix: "/api/v1/agent-os" });
  return app;
}

test("overview rejects invalid authorization before reading workspace state", async () => {
  const app = await appForOverview();
  try {
    for (const authorization of ["", "synthetic-agent-os-token", "Bearer wrong"]) {
      assert.equal((await app.inject({ url: "/api/v1/agent-os/overview", headers: { authorization } })).statusCode, 401);
    }
    assert.equal(reads, 0);
  } finally { await app.close(); }
});

test("overview reuses records without turning configured-live identities into running agents", async () => {
  results = [
    [{ slug: "example", name: "Example", configured_status: "live", last_finished_at: "2026-11-01T00:00:00.000Z" }],
    [{ state: "open", count: 3 }, { state: "blocked", count: 1 }],
    [{ type: "note", count: 7 }], [{ count: 2 }],
  ];
  const app = await appForOverview();
  try {
    const response = await app.inject({ url: "/api/v1/agent-os/overview", headers });
    const body = response.json();
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(body.agents[0].configured_status, "live");
    assert.equal(body.agents[0].runtime_state, "unverified");
    assert.deepEqual(body.tasks, { counts: { open: 3, doing: 0, done: 0, blocked: 1 }, total: 4 });
    assert.equal(body.memory.counts[0].count, 7);
    assert.equal(body.memory.hermesLinked, false);
    assert.equal(body.pendingApprovals, 2);
    assert.equal(body.hermes.state, "disabled");
    assert.equal(body.hermes.executionEnabled, false);
    assert.equal(body.hermes.runningVersion, null);
  } finally { await app.close(); }
});

test("an empty registry is different from an unavailable database", async () => {
  const app = await appForOverview();
  try {
    const empty = await app.inject({ url: "/api/v1/agent-os/overview", headers });
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json().agents, []);
    db.query = (async () => { throw new Error("synthetic-private-connection-string"); }) as typeof db.query;
    const unavailable = await app.inject({ url: "/api/v1/agent-os/overview", headers });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.body.includes("synthetic-private-connection-string"), false);
    assert.equal("agents" in unavailable.json(), false);
  } finally { await app.close(); }
});

const now = Date.parse("2026-11-02T12:00:00Z");
const evidence = { installedVersion: "0.22.5", runningVersion: "0.22.5", responding: true, observedAt: new Date(now).toISOString() };

test("Hermes defaults to disabled and cannot probe without an explicit transport", async () => {
  let calls = 0;
  const adapter = createHermesAdapter({ probe: async () => { calls++; return evidence; }, now: () => now });
  assert.equal((await adapter.status()).state, "disabled");
  assert.equal(calls, 0);
  assert.equal((await createHermesAdapter({ enabled: true }).status()).state, "unconfigured");
});

test("installation, stale evidence and future timestamps never establish live runtime health", async () => {
  for (const [patch, state] of [
    [{ responding: false, runningVersion: null }, "unverified"],
    [{ observedAt: new Date(now - 61000).toISOString() }, "stale"],
    [{ observedAt: new Date(now + 6000).toISOString() }, "unverified"],
    [{ observedAt: "invalid" }, "unverified"],
    [{ installedVersion: "secret-bearing-invalid-output" }, "unverified"],
  ] as const) {
    const adapter = createHermesAdapter({ enabled: true, now: () => now, probe: async () => ({ ...evidence, ...patch }) });
    assert.equal((await adapter.status()).state, state);
  }
  const fresh = await createHermesAdapter({ enabled: true, now: () => now, probe: async () => evidence }).status();
  assert.equal(fresh.state, "connected");
  assert.equal(fresh.executionEnabled, false);
  assert.equal(fresh.memoryLinked, false);
});

test("a stalled Hermes metadata probe times out and is aborted without leaking transport errors", async () => {
  let signal: AbortSignal | undefined;
  const adapter = createHermesAdapter({ enabled: true, timeoutMs: 5, probe: s => {
    signal = s; return new Promise(() => {});
  } });
  assert.equal((await adapter.status()).state, "unreachable");
  assert.equal(signal?.aborted, true);
  const failing = await createHermesAdapter({ enabled: true, probe: async () => { throw new Error("synthetic-secret"); } }).status();
  assert.equal(failing.state, "unreachable");
  assert.equal(JSON.stringify(failing).includes("synthetic-secret"), false);
});
