"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { ErrorPanel, Loading } from "../../components/ApiState";

type Summary = {
  pipeline: { open_usd: number; open_count: number; stalled_oldest: { title: string; value_usd: number | null; stall_days: number } | null };
  closed_won: { usd: number; count: number };
  monthly_usd: number | null;
  funnel: { total: number; stages: { stage: string; count: number }[] };
  workforce: {
    live: number; total: number; run_success: number | null; runs_today: number;
    by_dept: { slug: string; label: string; color: string; live: number; total: number }[];
  };
  tasks: { open: number; doing: number; done: number; blocked: number; total: number };
};
type Task = { id: string; title: string; state: string; dept_label: string; assignee_name: string | null };

const fmtUsd = (n: number | null) => n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
const STAGE_LABEL: Record<string, string> = {
  first_touch: "First touch", engaged: "Engaged", nurtured: "Nurtured", opted_in: "Opted in", converted: "Converted",
};

export default function DashboardPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    Promise.all([
      apiFetch<Summary>("/dashboard/summary"),
      apiFetch<{ tasks?: Task[] }>("/tasks"),
    ])
      .then(([summary, t]) => { setS(summary); setTasks(t.tasks?.slice(0, 8) ?? []); })
      .catch(setError);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <main className="gridbg min-h-screen p-6"><ErrorPanel error={error} onRetry={load} /></main>;
  if (!s) return <main className="gridbg min-h-screen p-6"><Loading /></main>;

  const max = s.funnel.stages[0]?.count || 1;

  return (
    <main className="gridbg min-h-screen p-6 space-y-4">
      <header>
        <div className="text-xs text-zinc-500 tracking-widest">// EXECUTIVE DASHBOARD</div>
        <h1 className="neon text-3xl font-bold mt-1">BUSINESS DASHBOARD</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <Label>PIPELINE — OPEN{s.pipeline.stalled_oldest && <Pill>STALLED</Pill>}</Label>
          <Big>{fmtUsd(s.pipeline.open_usd)} <Small>· {s.pipeline.open_count} live deals</Small></Big>
          {s.pipeline.stalled_oldest && (
            <Sub>oldest stall: {s.pipeline.stalled_oldest.title} · {s.pipeline.stalled_oldest.stall_days}d</Sub>
          )}
        </Card>
        <Card>
          <Label>CLOSED — WON</Label>
          <Big>{fmtUsd(s.closed_won.usd)} <Small>/ {s.closed_won.count} deals</Small></Big>
          <div className="h-2 bg-[#152019] mt-2 relative">
            <div className="absolute inset-y-0 left-0 bg-[var(--fin)]"
                 style={{ width: `${s.funnel.total ? Math.round((s.closed_won.count / s.funnel.total) * 100) : 0}%` }} />
          </div>
          <Sub>{s.funnel.total ? Math.round((s.closed_won.count / s.funnel.total) * 100) : 0}% of journeys convert</Sub>
        </Card>
        <Card>
          <Label>MONTHLY</Label>
          <Big>{fmtUsd(s.monthly_usd)} <Small>MRR</Small></Big>
        </Card>
      </div>

      <Card>
        <Label>FUNNEL <span className="text-zinc-300 normal-case tracking-normal">{s.funnel.total} JOURNEYS</span></Label>
        <div className="mt-3 space-y-2">
          {s.funnel.stages.map((st, i) => (
            <div key={st.stage} className="grid grid-cols-[120px_1fr_60px] items-center gap-3 text-sm">
              <span>{STAGE_LABEL[st.stage] ?? st.stage}</span>
              <div className="h-4 bg-[rgba(21,32,25,.6)] relative">
                <div className="absolute inset-y-0 left-0 bg-[var(--fin)]"
                     style={{ width: `${Math.round((st.count / max) * 100)}%`, opacity: (0.95 - i * 0.13).toFixed(2) }} />
              </div>
              <span className="text-right font-mono">{st.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <Label>WORKFORCE <span className="text-zinc-300 normal-case tracking-normal">{s.workforce.live}/{s.workforce.total} LIVE</span></Label>
          <div className="flex items-baseline gap-3 mt-2">
            <b className="text-4xl font-extrabold text-[var(--fin)] neon">
              {s.workforce.run_success != null ? `${Math.round(s.workforce.run_success * 100)}%` : "—"}
            </b>
            <span className="text-[10px] text-zinc-500 tracking-widest leading-relaxed">
              RUN SUCCESS<br />{s.workforce.runs_today} RUNS TODAY
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {s.workforce.by_dept.map(d => (
              <div key={d.slug} className="grid grid-cols-[10px_120px_34px_1fr] items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}` }} />
                <span>{d.label}</span>
                <span className="text-right text-zinc-400 font-mono">{d.live}/{d.total}</span>
                <div className="h-1 bg-[#1a2420] relative">
                  <div className="absolute inset-y-0 left-0 bg-zinc-300"
                       style={{ width: `${d.total ? Math.round((d.live / d.total) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Label>TASK BOARD <span className="text-zinc-300 normal-case tracking-normal">{s.tasks.total} TOTAL</span></Label>
          <div className="flex gap-0.5 h-6 mt-2 text-[9.5px] font-bold tracking-widest">
            <Seg n={s.tasks.open} label="OPEN" cls="bg-[rgba(255,176,32,.16)] text-[var(--warn,#ffb020)] border-[rgba(255,176,32,.5)]" />
            <Seg n={s.tasks.doing} label="DOING" cls="bg-white/10 text-white border-white/30" />
            <Seg n={s.tasks.done} label="DONE" cls="bg-[rgba(46,224,110,.14)] text-[var(--fin)] border-[rgba(46,224,110,.5)]" />
          </div>
          <div className="mt-3 divide-y divide-[var(--line)]">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className={`text-[8px] font-bold tracking-widest px-1.5 py-0.5 border shrink-0 ${
                  t.state === "open" ? "border-[rgba(255,176,32,.55)] text-[var(--warn,#ffb020)]"
                  : t.state === "done" ? "border-[rgba(46,224,110,.55)] text-[var(--fin)]"
                  : "border-white/40 text-white"}`}>{t.state.toUpperCase()}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[9px] text-zinc-500 shrink-0">{t.dept_label}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border border-[var(--line)] bg-black/20 p-4">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] tracking-widest text-zinc-500 flex items-center gap-2 uppercase">{children}</div>;
}
function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-3xl font-extrabold mt-2 font-mono">{children}</div>;
}
function Small({ children }: { children: React.ReactNode }) {
  return <small className="text-sm text-zinc-500 font-normal">{children}</small>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 text-[9.5px] text-zinc-600">{children}</div>;
}
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="text-[8.5px] font-bold px-1.5 py-0.5 bg-[var(--warn,#ffb020)] text-black">{children}</span>;
}
function Seg({ n, label, cls }: { n: number; label: string; cls: string }) {
  if (!n) return null;
  return <i className={`flex items-center justify-center border not-italic ${cls}`} style={{ flex: n }}>{n} {label}</i>;
}
