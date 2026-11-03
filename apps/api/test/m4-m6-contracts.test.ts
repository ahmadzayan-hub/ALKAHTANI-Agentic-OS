import { after, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { alertRoutes } from '../src/routes/alerts.js';
import { connectorRoutes } from '../src/routes/connectors.js';
import { dashboardRoutes } from '../src/routes/dashboard.js';
import { agentRoutes } from '../src/routes/agents.js';

const originalQuery = db.query;
const originalToken = process.env.OPERATOR_TOKEN;
const calls: { sql: string; values?: unknown[] }[] = [];
let rows: Record<string, unknown>[] = [];
const headers = { authorization: 'Bearer synthetic-test-token' };

beforeEach(() => {
  process.env.OPERATOR_TOKEN = 'synthetic-test-token';
  rows = []; calls.length = 0;
  db.query = (async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows };
  }) as typeof db.query;
});
afterEach(() => {
  db.query = originalQuery;
  if (originalToken === undefined) delete process.env.OPERATOR_TOKEN;
  else process.env.OPERATOR_TOKEN = originalToken;
});
after(async () => { await db.end(); });

async function appFor(register: Parameters<ReturnType<typeof Fastify>['register']>[0], prefix: string) {
  const app = Fastify();
  await app.register(register, { prefix });
  return app;
}

test('M4-M6 route groups deny every request without a valid operator token, reads and writes alike, before any query', async () => {
  const targets = [
    [alertRoutes, '/alerts', 'GET', '/alerts/'],
    [alertRoutes, '/alerts', 'PATCH', '/alerts/i-1/resolve'],
    [connectorRoutes, '/connectors', 'GET', '/connectors/'],
    [connectorRoutes, '/connectors', 'POST', '/connectors/check-all'],
    [dashboardRoutes, '/dashboard', 'GET', '/dashboard/summary'],
    [agentRoutes, '/agents', 'POST', '/agents/sync'],
  ] as const;
  for (const [register, prefix, method, url] of targets) {
    const app = await appFor(register as never, prefix);
    try {
      for (const authorization of ['', 'synthetic-test-token', 'Basic synthetic-test-token', 'Bearer wrong']) {
        const response = await app.inject({ method, url, headers: { authorization } });
        assert.equal(response.statusCode, 401, `${method} ${url} [${authorization}]`);
      }
    } finally { await app.close(); }
  }
  assert.equal(calls.length, 0);
});

test('alert list binds its filters, caps the page size at 200 and counts only unresolved incidents', async () => {
  rows = [{ id: '1', resolved: false }, { id: '2', resolved: true }, { id: '3', resolved: false }];
  const app = await appFor(alertRoutes as never, '/alerts');
  try {
    const response = await app.inject({ url: '/alerts/?resolved=all&limit=9999', headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().open, 2);
    assert.equal(response.json().incidents.length, 3);
    assert.deepEqual(calls[0].values, ['all', 200]);
    const injected = "false'; drop table incidents; --";
    await app.inject({ url: '/alerts/?resolved=' + encodeURIComponent(injected), headers });
    assert.equal(calls[1].sql.includes('drop table'), false);
    assert.equal(calls[1].values?.[0], injected);
    await app.inject({ url: '/alerts/?limit=abc', headers });
    assert.equal(calls[2].values?.[1], 50);
  } finally { await app.close(); }
});

test('resolving an incident writes only that incident by a bound id', async () => {
  const app = await appFor(alertRoutes as never, '/alerts');
  try {
    const response = await app.inject({ method: 'PATCH', url: '/alerts/inc-7/resolve', headers });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { id: 'inc-7', resolved: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].values, ['inc-7']);
    assert.equal(/where\s+id=\$1/i.test(calls[0].sql), true);
  } finally { await app.close(); }
});

test('an unknown connector is a 404 and never reaches the probe or the database', async () => {
  const app = await appFor(connectorRoutes as never, '/connectors');
  try {
    const response = await app.inject({ method: 'POST', url: '/connectors/not-a-connector/check', headers });
    assert.equal(response.statusCode, 404);
    assert.equal(calls.length, 0);
  } finally { await app.close(); }
});

test('connector list reports its row count as the total', async () => {
  rows = [{ slug: 'a' }, { slug: 'b' }];
  const app = await appFor(connectorRoutes as never, '/connectors');
  try {
    const response = await app.inject({ url: '/connectors/', headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 2);
    assert.equal(response.json().connectors.length, 2);
  } finally { await app.close(); }
});
