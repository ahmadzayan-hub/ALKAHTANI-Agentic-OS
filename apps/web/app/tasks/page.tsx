"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, describeError } from "../../lib/api";
import { ErrorPanel, Loading } from "../../components/ApiState";

type Task = { id: string; title: string; state: string; dept: string; dept_label: string; assignee_name: string | null };
const COLUMNS = ["open", "doing", "done"] as const;

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    return apiFetch<{ tasks?: Task[] }>("/tasks")
      .then(j => { setTasks(j.tasks ?? []); setLoaded(true); })
      .catch(setLoadError);
  }, []);
  useEffect(() => { load(); }, [load]);

  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await fn(); await load(); return true; }
    catch (e) { setActionError(describeError(e).title + " " + describeError(e).hint); return false; }
    finally { setBusy(false); }
  };
  const addTask = async () => {
    if (!title.trim() || busy) return;
    const ok = await mutate(() => apiFetch("/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }));
    if (ok) setTitle("");
  };
  const move = (id: string, state: string) => mutate(() => apiFetch(`/tasks/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  }));

  if (loadError) return <main className="gridbg min-h-screen p-6"><ErrorPanel error={loadError} onRetry={load} /></main>;
  if (!loaded) return <main className="gridbg min-h-screen p-6"><Loading /></main>;

  return (
    <main className="gridbg min-h-screen p-6 space-y-4">
      <header>
        <div className="text-xs text-zinc-500 tracking-widest">// WORK MANAGEMENT</div>
        <h1 className="neon text-3xl font-bold mt-1">TASKS</h1>
      </header>

      <div className="flex gap-2 max-w-xl">
        <input value={title} onChange={e => setTitle(e.target.value)}
               onKeyDown={e => e.key === "Enter" && addTask()}
               aria-label="New task title"
               placeholder="new task..." className="flex-1 min-w-0 bg-black/40 border border-zinc-600 px-3 py-2 text-sm" />
        <button onClick={addTask} disabled={busy || !title.trim()}
                className="px-3 py-2 border border-zinc-600 text-sm disabled:opacity-40">{busy ? "Saving…" : "Add"}</button>
      </div>
      {actionError && <p role="alert" className="text-xs text-[#ffb020] max-w-xl">{actionError}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map(col => (
          <div key={col} className="border border-[var(--line)] bg-black/20 p-3">
            <div className="text-[10px] tracking-widest text-zinc-500 uppercase mb-2">
              {col} <span className="text-zinc-300">{tasks.filter(t => t.state === col).length}</span>
            </div>
            <div className="space-y-2">
              {tasks.filter(t => t.state === col).length === 0 && <p className="text-xs text-zinc-600">Nothing here.</p>}
              {tasks.filter(t => t.state === col).map(t => (
                <div key={t.id} className="border border-[var(--line)] p-2 text-sm">
                  <div>{t.title}</div>
                  <div className="text-[9px] text-zinc-500 mt-1">{t.dept_label}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</div>
                  <div className="flex gap-1 mt-2">
                    {COLUMNS.filter(c => c !== col).map(c => (
                      <button key={c} onClick={() => move(t.id, c)} disabled={busy}
                              className="text-[10px] px-2 py-1 border border-zinc-700 hover:border-zinc-400 disabled:opacity-40">
                        → {c}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
