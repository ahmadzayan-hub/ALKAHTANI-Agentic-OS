"use client";

import { useEffect, useRef, useState } from "react";

interface Overview {
  observedAt: string;
  source: string;
  agents: { slug: string; name: string; role: string; crew: string; configured_status: string; runtime_state: string; last_finished_at: string | null }[];
  tasks: { counts: Record<string, number>; total: number };
  memory: { counts: { type: string; count: number }[]; hermesLinked: false };
  pendingApprovals: number;
  hermes: { state: string; installedVersion: string | null; runningVersion: string | null };
}

const panel = "border border-[var(--line)] bg-black/30 p-5";

export default function AgentOsPage() {
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<Overview | null>(null);
  const [state, setState] = useState<"disconnected" | "loading" | "loaded" | "error">("disconnected");
  const [message, setMessage] = useState("Load the workspace to inspect its recorded state.");
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => request.current?.abort(), []);

  function disconnect() {
    generation.current++;
    request.current?.abort();
    setToken(""); setSnapshot(null); setState("disconnected");
    setMessage("Disconnected. The token and snapshot have been cleared from this view.");
  }

  async function load(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    const timeout = setTimeout(() => controller.abort(), 5000);
    setSnapshot(null); setState("loading"); setMessage("Reading workspace records…");
    try {
      const base = process.env.NEXT_PUBLIC_API || window.location.origin;
      const url = new URL("/api/v1/agent-os/overview", base);
      if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("configuration");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
      });
      if (current !== generation.current) return;
      if (response.status === 401) {
        setToken(""); throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as Overview;
      if (current !== generation.current) return;
      if (data.source !== "project-database" || !Array.isArray(data.agents) || !data.tasks?.counts ||
          !Array.isArray(data.memory?.counts) || !data.hermes?.state) throw new Error("unavailable");
      setSnapshot(data); setState("loaded");
      setMessage("Workspace snapshot loaded. Runtime connections are shown separately.");
    } catch (error) {
      if (current !== generation.current) return;
      setState("error");
      setMessage(error instanceof Error && error.message === "unauthorized"
        ? "Access denied. Use an existing operator token for this workspace."
        : "Workspace unavailable. Check the API connection and try again.");
    } finally { clearTimeout(timeout); }
  }

  return <main className="gridbg min-h-screen p-5 md:p-8 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-xs tracking-widest text-zinc-500">ALKAHTANI / OPERATOR WORKSPACE</div>
        <h1 className="text-3xl font-bold mt-2">AGENT OS <span className="text-[var(--cli)]">/ JARVIS</span></h1>
        <p className="text-sm text-zinc-400 mt-3 max-w-2xl">Your agent registry, tasks and project memory in one view. Every connection starts with verified evidence.</p>
      </div>
      <span className="border border-zinc-700 px-3 py-2 text-xs uppercase">{state === "loaded" ? "Snapshot loaded" : state}</span>
    </header>

    <section className={panel} aria-labelledby="access-title">
      <h2 id="access-title" className="text-sm font-bold">Operator access</h2>
      <form onSubmit={load} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-400 flex-1 min-w-48">Existing operator token
          <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off"
            className="block w-full mt-2 border border-zinc-600 bg-black p-2 text-white" />
        </label>
        <button disabled={!token.trim() || state === "loading"} className="border border-[var(--cli)] px-4 py-2 text-sm disabled:opacity-40">{state === "loading" ? "Loading…" : "Load workspace"}</button>
        <button type="button" onClick={disconnect} className="border border-zinc-600 px-4 py-2 text-sm">Disconnect</button>
      </form>
      <p className="mt-3 text-xs text-zinc-500">The token stays in this tab. Loading reads records; it does not run agents.</p>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-zinc-300">{message}</p>
      {snapshot && <p className="mt-2 text-xs text-zinc-500">Snapshot: <time dateTime={snapshot.observedAt}>{snapshot.observedAt}</time> · Project database · Refresh manually</p>}
    </section>

    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
      <section className={panel} aria-labelledby="hermes-title">
        <div className="flex items-center gap-6">
          <div aria-hidden="true" className="shrink-0 h-24 w-24 rounded-full border border-cyan-400/40 grid place-items-center bg-cyan-400/5">
            <div className="h-16 w-16 rounded-full border border-cyan-300/50 grid place-items-center"><div className="h-7 w-7 rounded-full bg-cyan-300/30" /></div>
          </div>
          <div><h2 id="hermes-title" className="text-lg font-bold">Hermes</h2>
            <p className="mt-2 text-[var(--cli)]">{snapshot?.hermes.state ?? "Not connected"}</p>
            <p className="mt-2 text-xs text-zinc-400">Installed: {snapshot?.hermes.installedVersion ?? "Not verified"}<br />Running: {snapshot?.hermes.runningVersion ?? "Not verified"}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mt-5">Runtime access is disabled. This workspace has no Hermes execution or memory connection.</p>
        <button disabled className="mt-4 border border-zinc-700 px-3 py-2 text-xs text-zinc-500">Voice controls unavailable</button>
      </section>

      <section className={panel} aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="font-bold">Task state</h2>
        <div className="grid grid-cols-2 gap-3 mt-4">{["open", "doing", "done", "blocked"].map(key =>
          <div key={key} className="border border-[var(--line)] p-3"><div className="text-xs uppercase text-zinc-400">{key}</div><div className="text-2xl mt-1">{snapshot?.tasks.counts[key] ?? "—"}</div></div>)}</div>
        <p className="mt-3 text-xs text-zinc-400">Pending approvals: {snapshot?.pendingApprovals ?? "Not loaded"}</p>
      </section>
    </div>

    <section className={panel} aria-labelledby="agents-title">
      <h2 id="agents-title" className="font-bold">Agent registry {snapshot && <span className="font-normal text-zinc-400">· {snapshot.agents.length} identities</span>}</h2>
      <p className="text-xs text-zinc-400 mt-2">Registry settings and past runs do not establish that an agent is running now.</p>
      {!snapshot ? <p className="mt-5 text-sm text-zinc-500">Registry not loaded.</p> : snapshot.agents.length === 0 ? <p className="mt-5 text-sm">No registered identities.</p> :
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">{snapshot.agents.map(agent =>
          <article key={agent.slug} className="border border-[var(--line)] p-4">
            <h3 className="font-bold">{agent.name}</h3><p className="text-xs text-zinc-400 mt-1">{agent.crew} · {agent.role}</p>
            <p className="mt-3 text-xs">Configured: {agent.configured_status}</p><p className="text-xs text-amber-300 mt-1">Runtime: {agent.runtime_state}</p>
            <p className="text-xs text-zinc-500 mt-3">Last completed run: {agent.last_finished_at ?? "No recorded completion"}</p>
          </article>)}</div>}
    </section>

    <section className={panel} aria-labelledby="memory-title">
      <h2 id="memory-title" className="font-bold">Project memory / G-Brain</h2>
      <p className="text-sm text-zinc-400 mt-2">Existing project records only. Hermes profiles and private files have not been linked.</p>
      <div className="flex flex-wrap gap-3 mt-4">{snapshot ? snapshot.memory.counts.length ? snapshot.memory.counts.map(row =>
        <span key={row.type} className="border border-zinc-700 p-2 text-xs">{row.type}: {row.count}</span>) : <span className="text-sm text-zinc-500">No project memory records.</span>
        : <span className="text-sm text-zinc-500">Memory counts not loaded.</span>}</div>
    </section>
  </main>;
}
