export default function Home() {
  return (
    <main className="gridbg min-h-screen p-8">
      <div className="text-xs text-zinc-500 tracking-widest">// AGENTIC OPERATING SYSTEM</div>
      <h1 className="neon text-3xl font-bold mt-1">ALKAHTANI OS</h1>
      <p className="mt-4 text-sm text-zinc-400 max-w-lg">
        One Operator, a CONDUCTOR and a registry of agent identities. Inspect recorded state in{" "}
        <a className="text-cyan-400 underline" href="/agent-os">Agent OS</a>, browse{" "}
        <a className="text-emerald-400 underline" href="/g-brain">G-Brain</a> or the{" "}
        <a className="text-emerald-400 underline" href="/dashboard">Dashboard</a>.
      </p>
    </main>
  );
}
