"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { ErrorPanel, Loading } from "../../components/ApiState";

type Stage = { stage: string; count: number; carry_pct: number | null };
type Journey = { id: string; contact: string; campaign: string | null; stage: string; entered_at: string; converted_at: string | null };

const STAGE_LABEL: Record<string, string> = {
  first_touch: "First touch", engaged: "Engaged", nurtured: "Nurtured", opted_in: "Opted in", converted: "Converted",
};
const STAGE_COLOR: Record<string, string> = {
  first_touch: "#93a6a0", engaged: "#a3e635", nurtured: "#22d3ee", opted_in: "#3f8cff", converted: "#2ee06e",
};

export default function FunnelPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [total, setTotal] = useState(0);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    Promise.all([
      apiFetch<{ stages?: Stage[]; total?: number }>("/funnel"),
      apiFetch<{ journeys?: Journey[] }>("/funnel/journeys"),
    ])
      .then(([f, j]) => { setStages(f.stages ?? []); setTotal(f.total ?? 0); setJourneys(j.journeys ?? []); setLoaded(true); })
      .catch(setError);
  }, []);
  useEffect(() => { load(); }, [load]);

  const max = stages[0]?.count || 1;

  if (error) return <main className="gridbg min-h-screen p-6"><ErrorPanel error={error} onRetry={load} /></main>;
  if (!loaded) return <main className="gridbg min-h-screen p-6"><Loading /></main>;

  return (
    <main className="gridbg min-h-screen p-6 space-y-4">
      <header>
        <div className="text-xs text-zinc-500 tracking-widest">// JOURNEYS</div>
        <h1 className="neon text-3xl font-bold mt-1">FUNNEL</h1>
      </header>

      <div className="border border-[var(--line)] bg-black/20 p-4">
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
          STAGE CASCADE <span className="text-zinc-300">{total} JOURNEYS</span>
        </div>
        <div className="mt-3 space-y-1">
          {stages.map((st, i) => (
            <div key={st.stage}>
              {st.carry_pct != null && (
                <div className="text-[9px] text-zinc-600 ml-[100px] sm:ml-[168px]">
                  ↳ <b className="text-[var(--fin)] font-normal">{st.carry_pct}%</b> carry from previous stage
                </div>
              )}
              <div className="grid grid-cols-[88px_1fr_64px] sm:grid-cols-[150px_1fr_150px] items-center gap-3">
                <span className="text-sm">{STAGE_LABEL[st.stage] ?? st.stage}</span>
                <div className="h-[30px] bg-[rgba(21,32,25,.55)] relative">
                  <div className="absolute inset-y-0 left-0 flex items-center px-3 text-xs font-bold text-black"
                       style={{ width: `${Math.round((st.count / max) * 100)}%`, background: `rgba(46,224,110,${(0.95 - i * 0.14).toFixed(2)})` }}>
                    {Math.round((st.count / max) * 100)}%
                  </div>
                </div>
                <span className="text-right"><b className="text-xl font-extrabold">{st.count}</b> <span className="hidden sm:inline text-zinc-500 text-xs">journeys</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase mb-2">ACTIVE JOURNEYS — NEWEST MOVEMENT FIRST</div>
        {journeys.length === 0 && <p className="text-sm text-zinc-500">No active journeys yet.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {journeys.map(j => (
            <div key={j.id} className="border border-[var(--line)] bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <b className="flex-1 truncate text-sm">{j.contact}</b>
                <span className="text-[7.5px] font-bold px-1.5 py-0.5 border shrink-0"
                      style={{ color: STAGE_COLOR[j.stage], borderColor: STAGE_COLOR[j.stage] + "77" }}>
                  {(STAGE_LABEL[j.stage] ?? j.stage).toUpperCase()}
                </span>
              </div>
              <div className="text-[8.5px] text-zinc-600 mt-1">{j.campaign ? j.campaign.toUpperCase() : "—"}</div>
              <div className="text-[8.5px] text-zinc-500 mt-2 pt-2 border-t border-[var(--line)]">
                entered {new Date(j.entered_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
