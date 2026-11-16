import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { agentRoutes } from '../src/routes/agents.js';

const app = Fastify();
const headers = { authorization: 'Bearer synthetic-approval-test' };
let agentId: string;

before(async () => {
  assert.ok(process.env.APPROVAL_TEST_CLUSTER, 'use scripts/test-agent-approval-postgres.py');
  assert.equal(process.env.PGHOST, '127.0.0.1');
  const actual = (await db.query('show data_directory')).rows[0].data_directory;
  assert.equal(path.resolve(actual), path.resolve(process.env.APPROVAL_TEST_CLUSTER!));
  // Use the production DDL for the exact tables/enums under test. Vector,
  // inference and unrelated milestone tables are outside this fixture.
  const schema = fs.readFileSync(new URL('../../../schema.sql', import.meta.url), 'utf8');
  for (const name of ['agent_status', 'approval_kind', 'approval_state']) {
    const ddl = schema.match(new RegExp(`create type ${name}\\s+as enum[^;]+;`));
    assert.ok(ddl, `production enum ${name}`);
    await db.query(ddl[0]);
  }
  for (const name of ['departments', 'agents', 'approvals']) {
    const ddl = schema.match(new RegExp(`create table ${name} \\([\\s\\S]+?;`));
    assert.ok(ddl, `production table ${name}`);
    await db.query(ddl[0]);
  }
  await app.register(agentRoutes, { prefix: '/agents' });
});

beforeEach(async () => {
  await db.query('truncate approvals, agents cascade');
  agentId = (await db.query(`insert into agents (slug,name,identity_path,status)
    values ('fixture','Synthetic agent','/synthetic/fixture.md','disabled') returning id`)).rows[0].id;
});

after(async () => { await app.close(); await db.end(); });

function change(status: string, slug = 'fixture') {
  return app.inject({ method: 'PATCH', url: '/agents/' + slug, headers, payload: { status } });
}

async function approval(overrides: Record<string, unknown> = {}) {
  const payload = { agent: 'fixture', requested_status: 'live', ...overrides };
  return (await db.query(`insert into approvals (kind,requested_by,payload,state,decided_by,decided_at)
    values ('agent_enable',$1,$2,'approved','synthetic operator',now()) returning id`,
    [agentId, JSON.stringify(payload)])).rows[0].id;
}

async function storedStatus() {
  return (await db.query(`select status from agents where id=$1`, [agentId])).rows[0].status;
}

test('unauthorized, invalid and missing-agent requests cannot create approvals', async () => {
  assert.equal((await app.inject({ method: 'PATCH', url: '/agents/fixture', payload: { status: 'live' } })).statusCode, 401);
  assert.equal((await change('invalid')).statusCode, 422);
  assert.equal((await change('live', 'missing')).statusCode, 404);
  assert.equal((await db.query('select count(*)::int n from approvals')).rows[0].n, 0);
  assert.equal(await storedStatus(), 'disabled');
});

test('concurrent unapproved enable requests create one pending request and never enable', async () => {
  const replies = await Promise.all(Array.from({ length: 6 }, () => change('live')));
  for (const response of replies) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().pending_approval, true);
  }
  assert.equal(await storedStatus(), 'disabled');
  const rows = (await db.query('select state, payload from approvals')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'pending');
});

test('one approval enables once and cannot re-enable after disable through a fresh HTTP app', async () => {
  const id = await approval();
  assert.equal((await change('live')).json().status, 'live');
  const receipt = (await db.query('select payload, state, decided_by from approvals where id=$1', [id])).rows[0];
  assert.ok(receipt.payload.consumed_at);
  assert.equal(receipt.state, 'approved');
  assert.equal(receipt.decided_by, 'synthetic operator');
  assert.equal((await change('disabled')).json().status, 'disabled');
  // A fresh HTTP app must still honor the consumed database approval.
  const restarted = Fastify();
  await restarted.register(agentRoutes, { prefix: '/agents' });
  try {
    const response = await restarted.inject({ method: 'PATCH', url: '/agents/fixture', headers, payload: { status: 'live' } });
    assert.equal(response.json().pending_approval, true);
  } finally { await restarted.close(); }
  assert.equal(await storedStatus(), 'disabled');
});

test('wrong target, status, decision, agent instance and consumed approval are all ineligible', async () => {
  await approval({ agent: 'other' });
  await approval({ requested_status: 'disabled' });
  await approval({ consumed_at: '2026-01-01T00:00:00Z' });
  const pending = await approval();
  await db.query("update approvals set state='pending' where id=$1", [pending]);
  const rejected = await approval();
  await db.query("update approvals set state='rejected' where id=$1", [rejected]);
  const unbound = await approval();
  await db.query('update approvals set requested_by=null where id=$1', [unbound]);
  assert.equal((await change('live')).json().pending_approval, true);
  assert.equal(await storedStatus(), 'disabled');
});

test('concurrent retries consume only one of two approvals and preserve the second', async () => {
  await approval(); await approval();
  const replies = await Promise.all(Array.from({ length: 6 }, () => change('live')));
  assert.ok(replies.every(r => r.statusCode === 200 && r.json().status === 'live'));
  const consumed = () => db.query("select count(*)::int n from approvals where payload ? 'consumed_at'");
  assert.equal((await consumed()).rows[0].n, 1);
  await change('disabled');
  assert.equal((await change('live')).json().status, 'live');
  assert.equal((await consumed()).rows[0].n, 2);
});

test('an agent-update failure rolls approval consumption back and leaves it usable', async () => {
  const id = await approval();
  await db.query(`create function reject_fixture_enable() returns trigger language plpgsql as $$
    begin if new.status='live' then raise exception 'synthetic update failure'; end if; return new; end $$`);
  await db.query(`create trigger reject_fixture before update on agents
    for each row execute function reject_fixture_enable()`);
  try {
    assert.equal((await change('live')).statusCode, 500);
    assert.equal(await storedStatus(), 'disabled');
    assert.equal((await db.query('select payload from approvals where id=$1', [id])).rows[0].payload.consumed_at, undefined);
  } finally {
    await db.query('drop trigger reject_fixture on agents');
    await db.query('drop function reject_fixture_enable()');
  }
  assert.equal((await change('live')).json().status, 'live');
});
