import { after, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { gbrainRoutes } from '../src/routes/gbrain.js';
import { conductorRoutes } from '../src/routes/conductor.js';
import { agentRoutes } from '../src/routes/agents.js';

const originalQuery = db.query;
const originalToken = process.env.OPERATOR_TOKEN;
const calls: { sql: string; values?: unknown[] }[] = [];
let results: Record<string, unknown>[][] = [];
const headers = { authorization: 'Bearer synthetic-test-token' };

beforeEach(() => {
  process.env.OPERATOR_TOKEN = 'synthetic-test-token';
  results = []; calls.length = 0;
  db.query = (async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows: results.shift() ?? [] };
  }) as typeof db.query;
});
afterEach(() => {
  db.query = originalQuery;
  if (originalToken === undefined) delete process.env.OPERATOR_TOKEN;
  else process.env.OPERATOR_TOKEN = originalToken;
});
after(async () => { await db.end(); });

async function appFor(register: unknown, prefix: string) {
  const app = Fastify();
  await app.register(register as never, { prefix });
  return app;
}

test('M2-M3 route groups deny every request without a valid operator token before any query or side effect', async () => {
  const targets = [
    [gbrainRoutes, '/gbrain', 'GET', '/gbrain/graph'],
    [gbrainRoutes, '/gbrain', 'GET', '/gbrain/stats'],
    [gbrainRoutes, '/gbrain', 'POST', '/gbrain/search'],
    [gbrainRoutes, '/gbrain', 'POST', '/gbrain/ingest'],
    [conductorRoutes, '/conductor', 'POST', '/conductor/chat'],
    [conductorRoutes, '/conductor', 'POST', '/conductor/standup'],
    [conductorRoutes, '/conductor', 'POST', '/conductor/tmux/ensure'],
    [conductorRoutes, '/conductor', 'GET', '/conductor/runs'],
    [agentRoutes, '/agents', 'GET', '/agents/'],
    [agentRoutes, '/agents', 'POST', '/agents/some-agent/run'],
    [agentRoutes, '/agents', 'PATCH', '/agents/some-agent'],
  ] as const;
  for (const [register, prefix, method, url] of targets) {
    const app = await appFor(register, prefix);
    try {
      for (const authorization of ['', 'synthetic-test-token', 'Basic synthetic-test-token', 'Bearer wrong']) {
        const response = await app.inject({ method, url, headers: { authorization } });
        assert.equal(response.statusCode, 401, `${method} ${url} [${authorization}]`);
      }
    } finally { await app.close(); }
  }
  assert.equal(calls.length, 0);
});

test('radial graph places departments on the unit circle and members on their ring, within their department sector', async () => {
  results = [
    [
      { id: 'd1', type: 'dept', label: 'Sales', dept_id: null },
      { id: 'd2', type: 'dept', label: 'Tech', dept_id: null },
      { id: 'a1', type: 'agent', label: 'Scout', dept_id: 'd1' },
      { id: 'n1', type: 'note', label: 'Note', dept_id: 'd1' },
    ],
    [{ src: 'a1', dst: 'n1', kind: 'wrote' }],
    [{ label: 'Sales', slug: 'sales' }, { label: 'Tech', slug: 'tech' }],
  ];
  const app = await appFor(gbrainRoutes, '/gbrain');
  try {
    const response = await app.inject({ url: '/gbrain/graph', headers });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.view, 'radial');
    assert.equal(body.links.length, 1);
    const byId = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));
    for (const id of ['d1', 'd2']) {
      assert.ok(Math.abs(Math.hypot(byId[id].x, byId[id].y) - 1) < 0.01, `${id} is on radius 1`);
    }
    assert.equal(byId.d1.slug, 'sales');
    assert.equal(byId.a1.slug, undefined);
    // Rings: note 1.7, agent 2.3.
    assert.ok(Math.abs(Math.hypot(byId.n1.x, byId.n1.y) - 1.7) < 0.01);
    assert.ok(Math.abs(Math.hypot(byId.a1.x, byId.a1.y) - 2.3) < 0.01);
    // With two departments Sales owns the right half (-90 to +90 degrees) and Tech the left.
    for (const id of ['a1', 'n1']) assert.ok(byId[id].x >= -0.001, `${id} sits in the first sector`);
    assert.ok(byId.d2.x < 0);
  } finally { await app.close(); }
});

test('neural view returns the raw nodes and links for client-side layout without positions', async () => {
  results = [[{ id: 'x', type: 'tool', label: 'T', dept_id: null }], [{ src: 'x', dst: 'x', kind: 'uses' }]];
  const app = await appFor(gbrainRoutes, '/gbrain');
  try {
    const body = (await app.inject({ url: '/gbrain/graph?view=neural', headers })).json();
    assert.equal(body.view, 'neural');
    assert.deepEqual(body.nodes, [{ id: 'x', type: 'tool', label: 'T', dept_id: null }]);
    assert.equal(calls.length, 2);
  } finally { await app.close(); }
});

test('a department subgraph binds the slug and never interpolates it into SQL', async () => {
  const hostile = "sales'; drop table nodes; --";
  results = [[{ id: 'n1' }], []];
  const app = await appFor(gbrainRoutes, '/gbrain');
  try {
    const response = await app.inject({ url: '/gbrain/depts/' + encodeURIComponent(hostile) + '/subgraph', headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().dept, hostile);
    assert.equal(calls[0].sql.includes('drop table'), false);
    assert.deepEqual(calls[0].values, [hostile]);
    assert.deepEqual(calls[1].values, [['n1']]);
  } finally { await app.close(); }
});

test('latest standup is an empty banner, not an error, before the first report exists', async () => {
  const app = await appFor(conductorRoutes, '/conductor');
  try {
    const response = await app.inject({ url: '/conductor/standup/latest', headers });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { day: null, banner: [] });
  } finally { await app.close(); }
});

test('the run log binds its agent filter and caps the page size at 200', async () => {
  const app = await appFor(conductorRoutes, '/conductor');
  try {
    assert.equal((await app.inject({ url: '/conductor/runs?agent=scout&limit=9999', headers })).statusCode, 200);
    assert.deepEqual(calls[0].values, ['scout', 200]);
    await app.inject({ url: '/conductor/runs', headers });
    assert.deepEqual(calls[1].values, [null, 50]);
  } finally { await app.close(); }
});
