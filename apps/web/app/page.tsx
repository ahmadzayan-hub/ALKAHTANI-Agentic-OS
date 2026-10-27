import Link from "next/link";

export default function Home() {
  return (
    <main className="gridbg min-h-screen p-6 md:p-8">
      <div className="text-xs text-zinc-500 tracking-widest">// AGENTIC OPERATING SYSTEM</div>
      <h1 className="neon text-3xl font-bold mt-1">ALKAHTANI OS</h1>
      <p className="mt-4 text-sm text-zinc-400 max-w-lg">
        One Operator · one CONDUCTOR · 35 agents · six crews. Start at{" "}
        <Link className="text-emerald-400 underline" href="/g-brain">G-Brain</Link> or the{" "}
        <Link className="text-emerald-400 underline" href="/dashboard">Dashboard</Link>.
      </p>
    </main>
  );
}
