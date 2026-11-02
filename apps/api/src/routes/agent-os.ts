import type { FastifyInstance } from "fastify";
import { auth } from "../auth.js";
import { db } from "../db.js";
import { createHermesAdapter } from "../integrations/hermes.js";

// Deliberately disabled: no environment flag can silently grant runtime access.
const hermes = createHermesAdapter();

export async function agentOsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", auth);
  app.get("/overview", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      // Sequential reads keep this operator-triggered snapshot inexpensive. Existing
      // records are reused; registry status is never interpreted as process health.
      const agents = (await db.query(
        `select a.slug, a.name, a.role, a.status configured_status, coalesce(d.label,'Unassigned') crew,
                (select max(finished_at) from agent_runs r where r.agent_id=a.id) last_finished_at
         from agents a left join departments d on d.id=a.dept_id order by crew, a.slug`)).rows;
      const tasks = (await db.query(`select state, count(*)::int count from tasks group by state`)).rows;
      const memory = (await db.query(`select type, count(*)::int count from nodes group by type order by type`)).rows;
      const approvals = (await db.query(`select count(*)::int count from approvals where state='pending'`)).rows;
      const counts = { open: 0, doing: 0, done: 0, blocked: 0 };
      for (const row of tasks) if (Object.hasOwn(counts, row.state)) counts[row.state as keyof typeof counts] = Number(row.count);
      return {
        observedAt: new Date().toISOString(), source: "project-database",
        agents: agents.map(a => ({ ...a, runtime_state: "unverified" })),
        tasks: { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
        memory: { source: "project-gbrain", counts: memory, hermesLinked: false },
        pendingApprovals: Number(approvals[0]?.count ?? 0),
        hermes: await hermes.status(),
      };
    } catch {
      return reply.code(503).send({ error: "Workspace data is unavailable. No live state has been verified." });
    }
  });
}
