import { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { auth } from "../auth.js";

const STATES = ["open", "doing", "done", "blocked"] as const;

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("onRequest", auth);

  app.get("/", async () => {
    const rows = (await db.query(
      `select t.id, t.title, t.body, t.state, t.priority, t.due_at, t.completed_at, t.created_by,
              coalesce(d.slug,'-') dept, coalesce(d.label,'-') dept_label, a.name assignee_name
       from tasks t left join departments d on d.id=t.dept_id
                    left join agents a on a.id=t.assignee
       order by array_position(array['open','doing','done','blocked'],t.state::text), t.due_at nulls last`)).rows;
    const counts = STATES.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {} as Record<string, number>);
    return { tasks: rows, counts, total: rows.length };
  });

  app.post<{ Body: { title: string; body?: string; dept?: string; priority?: number; due_at?: string } }>(
    "/", async (req, reply) => {
      const { title, body, dept, priority, due_at } = req.body ?? {};
      if (!title?.trim()) return reply.code(400).send({ error: "title required" });
      const row = (await db.query(
        `insert into tasks (title, body, dept_id, priority, due_at, created_by)
         values ($1,$2,(select id from departments where slug=$3),$4,$5,'operator')
         returning id`,
        [title.slice(0, 300), body ?? null, dept ?? null, priority ?? 2, due_at ?? null])).rows[0];
      return { id: row.id };
    });

  app.patch<{ Params: { id: string }; Body: { state: string } }>("/:id", async (req, reply) => {
    const { state } = req.body ?? {};
    if (!STATES.includes(state as any)) return reply.code(400).send({ error: `state must be one of ${STATES.join(",")}` });
    await db.query(
      // Cast once: $2 feeds both an enum column and a text comparison, and
      // Postgres refuses to deduce two types for one parameter.
      `update tasks set state=$2::task_state, completed_at = case when $2::task_state='done' then now() else null end
       where id=$1`,
      [req.params.id, state]);
    return { id: req.params.id, state };
  });
}
