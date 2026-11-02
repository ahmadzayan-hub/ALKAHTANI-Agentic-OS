"use client";

import { useEffect, useRef, useState } from "react";
import JarvisPresence from "../../components/JarvisPresence";
import "./jarvis.css";

interface Overview {
  observedAt: string;
  source: string;
  agents: { slug: string; name: string; role: string; crew: string; configured_status: string; runtime_state: string; last_finished_at: string | null }[];
  tasks: { counts: Record<string, number>; total: number };
  memory: { counts: { type: string; count: number }[]; hermesLinked: false };
  pendingApprovals: number;
  hermes: { state: string; installedVersion: string | null; runningVersion: string | null };
}



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

  return <main className="jarvis-page">
    <header className="jarvis-top">
      <div className="jarvis-wordmark"><div className="jarvis-mark" aria-hidden="true">J</div><div>
        <div className="jarvis-kicker">ALKAHTANI / AGENT OS</div><div className="jarvis-brand">JARVIS INTERFACE</div>
      </div></div>
      <span className="jarvis-state">{state === "loaded" ? "Snapshot loaded" : state}</span>
    </header>

    <div className="jarvis-intro">
      <div><div className="jarvis-kicker">A workspace with presence</div>
        <h1>Your agents.<br /><em>One clear view.</em></h1>
        <p>A quiet center for your agent registry, work and memory.<br />You stay in control of every connection.</p>
      </div>
      <div className="jarvis-edition">PERSONAL WORKSPACE<br />LOCAL PREVIEW / 01</div>
    </div>

    <div className="jarvis-hero">
      <JarvisPresence agents={snapshot?.agents ?? null} />
      <aside className="jarvis-telemetry" aria-label="Connection state">
        <div><h2>Runtime / Hermes</h2>
          <div className="j-status-row"><span>Connection</span><strong className="j-amber">{snapshot?.hermes.state ?? "Not connected"}</strong></div>
          <div className="j-status-row"><span>Execution</span><strong>Disabled</strong></div>
          <p className="jarvis-version">Installed: {snapshot?.hermes.installedVersion ?? "Not verified"}<br />Running: {snapshot?.hermes.runningVersion ?? "Not verified"}</p>
        </div>
        <div className="jarvis-voice"><h2>Voice interface</h2>
          <div className="j-status-row"><span>Microphone</span><strong>Not enabled</strong></div>
          <button disabled>Voice controls unavailable</button>
          <p>The visualization does not listen or respond. No Hermes execution or memory connection is enabled.</p>
        </div>
      </aside>
    </div>

    <section className="j-stats" aria-label="Recorded workspace totals">
      <div className="j-stat"><span>Registered identities</span><strong>{snapshot?.agents.length ?? "—"}</strong><small>Runtime unverified</small></div>
      <div className="j-stat"><span>Open tasks</span><strong>{snapshot?.tasks.counts.open ?? "—"}</strong><small>Project records</small></div>
      <div className="j-stat"><span>In progress</span><strong>{snapshot?.tasks.counts.doing ?? "—"}</strong><small>Recorded task state</small></div>
      <div className="j-stat"><span>Approvals</span><strong>{snapshot?.pendingApprovals ?? "—"}</strong><small>Awaiting review</small></div>
    </section>

    <section className="jarvis-section" aria-labelledby="access-title">
      <div className="j-section-heading"><h2 id="access-title">Connect your workspace</h2><span>Read only</span></div>
      <p className="j-section-description">Load your existing project records. Connecting here does not start an agent.</p>
      <form onSubmit={load} className="j-access-form">
        <label>Existing operator token<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
        <button disabled={!token.trim() || state === "loading"}>{state === "loading" ? "Loading…" : "Load workspace ↗"}</button>
        <button type="button" className="secondary" onClick={disconnect}>Disconnect</button>
      </form>
      <p role="status" aria-live="polite" className="j-message">{message}</p>
      <p className="j-fineprint">Your token stays in this tab and is cleared when you disconnect.</p>
      {snapshot && <p className="j-fineprint">Snapshot: <time dateTime={snapshot.observedAt}>{snapshot.observedAt}</time> · Project database · Refresh manually</p>}
    </section>

    <section className="jarvis-section" aria-labelledby="agents-title">
      <div className="j-section-heading"><h2 id="agents-title">Agent registry</h2><span>{snapshot ? snapshot.agents.length + " identities" : "Not loaded"}</span></div>
      <p className="j-section-description">Registered identities are not a count of running agents. Runtime connections require separate verification.</p>
      {!snapshot || snapshot.agents.length === 0 ? <div className="j-empty"><span className="j-empty-symbol" aria-hidden="true">+</span>
        <span>{snapshot ? "No registered identities." : "Connect the workspace to see your registry."}</span></div> :
        <div className="j-agent-grid">{snapshot.agents.map(agent =>
          <article key={agent.slug} className="j-agent">
            <h3>{agent.name}</h3><p>{agent.crew} · {agent.role}</p>
            <p>Configured: {agent.configured_status}</p><p className="runtime">Runtime: {agent.runtime_state}</p>
            <p>Last completed run: {agent.last_finished_at ?? "No recorded completion"}</p>
          </article>)}</div>}
      {snapshot && <p className="j-fineprint">Task records · Done: {snapshot.tasks.counts.done ?? 0} · Blocked: {snapshot.tasks.counts.blocked ?? 0}</p>}
    </section>

    <section className="jarvis-section" aria-labelledby="memory-title">
      <div className="j-section-heading"><h2 id="memory-title">Project memory / G-Brain</h2><span>Project scope</span></div>
      <p className="j-section-description">Your existing project memory. Private files and Hermes profiles remain unlinked.</p>
      <div className="j-memory">{snapshot ? snapshot.memory.counts.length ? snapshot.memory.counts.map(row =>
        <span key={row.type}>{row.type}: {row.count}</span>) : <p>No project memory records.</p> : <p>Memory counts not loaded.</p>}</div>
    </section>
    <footer className="jarvis-footer"><span>ALKAHTANI / HUMAN IN CONTROL</span><span>NO AUTONOMOUS ACTIONS ENABLED</span></footer>
  </main>;
}