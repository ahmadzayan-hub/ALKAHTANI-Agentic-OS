import { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { auth } from "../auth.js";
import { runAgent } from "../runtime/runner.js";
import { identityFor, syncVault } from "../runtime/vault.js";

export async function agentRoutes(app: FastifyInstance) {
  app.addHook("onRequest", auth);

  app.get("/", async () => ({
    agents: (await db.query(
      `select a.slug, a.name, coalesce(d.slug,'-') crew, a.role, a.model, a.status,
              a.schedule_cron, a.tools,
              (select max(started_at) from agent_runs r where r.agent_id=a.id) last_run,
              (select bool_and(success) from agent_runs r where r.agent_id=a.id
                 and r.started_at > now() - interval '24 hours') day_green
       from agents a left join departments d on d.id=a.dept_id
       order by crew, a.slug`)).rows,
  }));

  app.get("/:slug", async (req) => {
    const { slug } = req.params as any;
    const a = (await db.query(`select * from agents where slug=$1`, [slug])).rows[0];
    if (!a) throw { statusCode: 404, error: "unknown agent" };
    const runs = (await db.query(
      `select id, started_at, finished_at, success, error from agent_runs
       where agent_id=$1 order by started_at desc limit 20`, [a.id])).rows;
    return { agent: a, identity_md: identityFor(slug)?.raw ?? null, runs };
  });

  app.post("/:slug/run", async (req) => {
    const { slug } = req.params as any;
    const { trigger = "operator", context = "" } = (req.body ?? {}) as any;
    return runAgent(slug, trigger, context);
  });

  // Enabling consumes one Operator approval in the same transaction as the
  // status update. The agent row serializes retries and concurrent transitions.
  app.patch("/:slug", async (req) => {
    const { slug } = req.params as any;
    const { status } = (req.body ?? {}) as any;
    if (!["disabled", "shadow", "live", "degraded"].includes(status))
      throw { statusCode: 422, error: "bad status" };
    const client = await db.connect();
    let releaseError: Error | undefined;
    try {
      await client.query("begin");
      const a = (await client.query(
        `select id,status from agents where slug=$1 for update`, [slug])).rows[0];
      if (!a) throw { statusCode: 404, error: "unknown agent" };
      if (status === "live" && a.status !== "live") {
        const approved = (await client.query(
          `select id from approvals where kind='agent_enable' and state='approved'
             and requested_by=$2 and payload->>'agent'=$1
             and payload->>'requested_status'='live' and not (payload ? 'consumed_at')
           order by created_at, id limit 1 for update`, [slug, a.id])).rows[0];
        if (!approved) {
          await client.query(
            `insert into approvals (kind,requested_by,payload)
             select 'agent_enable',$1,$2 where not exists (
               select 1 from approvals where kind='agent_enable' and state='pending'
                 and requested_by=$1 and payload->>'agent'=$3
                 and payload->>'requested_status'='live')`,
            [a.id, JSON.stringify({ agent: slug, requested_status: "live" }), slug]);
          await client.query("commit");
          return { agent: slug, status: a.status, pending_approval: true };
        }
        // Preserve the approval decision and its provenance as an audit record.
        await client.query(
          `update approvals set payload=jsonb_set(payload,'{consumed_at}',to_jsonb(clock_timestamp()))
           where id=$1`, [approved.id]);
      }
      const updated = (await client.query(
        `update agents set status=$2 where id=$1 returning slug,status`, [a.id, status])).rows[0];
      await client.query("commit");
      return { agent: updated.slug, status: updated.status };
    } catch (error) {
      try { await client.query("rollback"); }
      catch (rollbackError) {
        // Never return an uncertain transaction to the pool.
        releaseError = rollbackError instanceof Error ? rollbackError : new Error("rollback failed");
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  });

  app.post("/sync", async () => ({ synced: await syncVault() }));
}
