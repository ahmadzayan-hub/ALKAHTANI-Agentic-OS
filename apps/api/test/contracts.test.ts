import { after, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { taskRoutes } from '../src/routes/tasks.js';
import { funnelRoutes } from '../src/routes/funnel.js';
import { systemRoutes } from '../src/routes/system.js';

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

async function appFor(register: typeof taskRoutes, prefix: string) {
  const app = Fastify();
  await app.register(register, { prefix });
  return app;
}

test('all covered API groups deny missing, malformed and incorrect credentials before querying', async () => {
  for (const [register, path] of [[taskRoutes, '/tasks/'], [funnelRoutes, '/funnel/'], [systemRoutes, '/system/status']] as const) {
    const app = await appFor(register, '/' + path.split('/')[1]);
    try {
      for (const authorization of ['', 'synthetic-test-token', 'Basic synthetic-test-token', 'Bearer wrong']) {
        const response = await app.inject({ url: path, headers: { authorization } });
        assert.equal(response.statusCode, 401, `${path} ${authorization}`);
      }
      assert.equal(calls.length, 0);
    } finally { await app.close(); }
  }
});
test('an unconfigured operator token fails closed', async () => {
  delete process.env.OPERATOR_TOKEN;
  const app = await appFor(taskRoutes, '/tasks');
  try { assert.equal((await app.inject({ url: '/tasks/', headers })).statusCode, 401); }
  finally { await app.close(); }
});
test('task board totals reconcile with its returned rows', async () => {
  rows = [{ id: 'a', state: 'open' }, { id: 'b', state: 'done' }, { id: 'c', state: 'open' }];
  const app = await appFor(taskRoutes, '/tasks');
  try {
    const response = await app.inject({ url: '/tasks/', headers });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().counts, { open: 2, doing: 0, done: 1, blocked: 0 });
    assert.equal(response.json().total, response.json().tasks.length);
  } finally { await app.close(); }
});
test('task creation rejects invalid titles without writes and binds valid user data', async () => {
  const app = await appFor(taskRoutes, '/tasks');
  try {
    for (const title of [undefined, '', '  ', 42, {}, []]) {
      assert.equal((await app.inject({ method: 'POST', url: '/tasks/', headers, payload: { title } })).statusCode, 400);
    }
    assert.equal(calls.length, 0);
    rows = [{ id: 'new-task' }];
    const title = "Review O'Brien's decision";
    const response = await app.inject({ method: 'POST', url: '/tasks/', headers, payload: { title, dept: 'tech' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { id: 'new-task' });
    assert.equal(calls[0].sql.includes(title), false);
    assert.deepEqual(calls[0].values, [title, null, 'tech', 2, null]);
  } finally { await app.close(); }
});
test('invalid task transitions are rejected before writes', async () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const app = await appFor(taskRoutes, '/tasks');
  try {
    const response = await app.inject({ method: 'PATCH', url: '/tasks/' + id, headers, payload: { state: 'invented' } });
    assert.equal(response.statusCode, 400);
    assert.equal(calls.length, 0);
    rows = [{ id, state: 'done' }];
    const valid = await app.inject({ method: 'PATCH', url: '/tasks/' + id, headers, payload: { state: 'done' } });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(calls[0].values, [id, 'done']);
  } finally { await app.close(); }
});
test('funnel conversion uses cumulative reached counts and handles empty data', async () => {
  const app = await appFor(funnelRoutes, '/funnel');
  try {
    let response = await app.inject({ url: '/funnel/', headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 0);
    assert.ok(response.json().stages.every((s: { carry_pct: unknown }) => s.carry_pct === null));
    rows = [{ stage: 'first_touch', n: '5' }, { stage: 'engaged', n: '3' }, { stage: 'converted', n: '2' }];
    response = await app.inject({ url: '/funnel/', headers });
    assert.equal(response.json().total, 10);
    assert.deepEqual(response.json().stages.map((s: { count: number }) => s.count), [10, 5, 2, 2, 2]);
    assert.deepEqual(response.json().stages.map((s: { carry_pct: unknown }) => s.carry_pct), [null, 50, 40, 100, 100]);
  } finally { await app.close(); }
});
