import { after, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { taskRoutes } from '../src/routes/tasks.js';
import { alertRoutes } from '../src/routes/alerts.js';

const id = 'aaaabbbb-1111-2222-3333-444455556666';
const headers = { authorization: 'Bearer synthetic-test-token' };
const originalQuery = db.query;
const originalToken = process.env.OPERATOR_TOKEN;
let rows: Record<string, unknown>[] = [];
let calls: unknown[][] = [];
let fail = false;

beforeEach(() => {
  process.env.OPERATOR_TOKEN = 'synthetic-test-token';
  rows = []; calls = []; fail = false;
  db.query = (async (...args: unknown[]) => {
    calls.push(args);
    if (fail) throw new Error('synthetic database failure');
    return { rows };
  }) as typeof db.query;
});
afterEach(() => {
  db.query = originalQuery;
  if (originalToken === undefined) delete process.env.OPERATOR_TOKEN;
  else process.env.OPERATOR_TOKEN = originalToken;
});
after(async () => { await db.end(); });

const targets = [
  { register: taskRoutes, prefix: '/tasks', suffix: '', payload: { state: 'done' }, row: { id, state: 'done' } },
  { register: alertRoutes, prefix: '/alerts', suffix: '/resolve', payload: undefined, row: { id, resolved: true } },
];

test('mutations reject malformed UUIDs without touching the database', async () => {
  for (const target of targets) {
    const app = Fastify(); await app.register(target.register, { prefix: target.prefix });
    try {
      for (const invalid of ['task-1', 'not-a-uuid', id + '-extra', 'aaaaaaaa111122223333444455556666']) {
        const r = await app.inject({ method: 'PATCH', url: target.prefix + '/' + invalid + target.suffix, headers, payload: target.payload });
        assert.equal(r.statusCode, 400);
      }
    } finally { await app.close(); }
  }
  assert.equal(calls.length, 0);
});

test('an update that matched no row is a 404, not an acknowledgment', async () => {
  for (const target of targets) {
    const app = Fastify(); await app.register(target.register, { prefix: target.prefix });
    try {
      const r = await app.inject({ method: 'PATCH', url: target.prefix + '/' + id + target.suffix, headers, payload: target.payload });
      assert.equal(r.statusCode, 404);
      assert.equal(r.json().id, undefined);
    } finally { await app.close(); }
  }
  assert.equal(calls.length, targets.length);
});

test('successful mutations return the stored row, including canonical UUID casing', async () => {
  for (const target of targets) {
    rows = [target.row];
    const app = Fastify(); await app.register(target.register, { prefix: target.prefix });
    try {
      const r = await app.inject({ method: 'PATCH', url: target.prefix + '/' + id.toUpperCase() + target.suffix, headers, payload: target.payload });
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), target.row);
      assert.equal((calls.at(-1)![1] as unknown[])[0], id.toUpperCase());
    } finally { await app.close(); }
  }
});

test('database failures cannot produce success acknowledgments', async () => {
  fail = true;
  for (const target of targets) {
    const app = Fastify(); await app.register(target.register, { prefix: target.prefix });
    try {
      const r = await app.inject({ method: 'PATCH', url: target.prefix + '/' + id + target.suffix, headers, payload: target.payload });
      assert.equal(r.statusCode, 500);
      assert.equal(r.json().id, undefined);
    } finally { await app.close(); }
  }
});

test('authentication still precedes mutation validation and database access', async () => {
  for (const target of targets) {
    const app = Fastify(); await app.register(target.register, { prefix: target.prefix });
    try {
      const r = await app.inject({ method: 'PATCH', url: target.prefix + '/invalid' + target.suffix, payload: target.payload });
      assert.equal(r.statusCode, 401);
    } finally { await app.close(); }
  }
  assert.equal(calls.length, 0);
});
