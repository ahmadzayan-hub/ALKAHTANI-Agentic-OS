const NAV: [string, string[]][] = [
  ["OPERATE", ["Home","Dashboard","Comms","Funnel","Workflows","Social","Content","Finances"]],
  ["AGENTS", ["Agent OS","Agents","Tasks","Skills","Org Chart"]],
  ["INTELLIGENCE", ["G-Brain"]],
  ["SYSTEM", ["Connections","Roadmap","Analytics","Reference Model"]],
  ["VARIANTS", ["Personas"]],
];
export default function Sidebar() {
  return (
    <>
    <aside className="hidden md:block w-56 shrink-0 border-r border-[var(--line)] p-4 space-y-4">
      <div className="neon text-[var(--fin)] font-bold">ALKAHTANI OS · v3</div>
      {NAV.map(([sec, items]) => (
        <div key={sec}>
          <div className="text-[10px] tracking-widest text-zinc-500">{sec}</div>
          {items.map(i => (
            <a key={i} href={`/${i.toLowerCase().replace(/\s/g,"-")}`}
               className="block px-2 py-1 hover:bg-white/10 hover:text-white">{i}</a>
          ))}
        </div>
      ))}
      <div className="text-[10px] text-zinc-500">Runtime connections require verification</div>
    </aside>
    <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 inset-x-0 z-50 flex justify-around gap-1 border-t border-[var(--line)] bg-[#080e13] px-2 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-[10px]">
      {[["Home", "/"], ["Agent OS", "/agent-os"], ["Tasks", "/tasks"], ["G-Brain", "/g-brain"]].map(([label, href]) =>
        <a key={href} href={href} className="px-2 py-2 text-cyan-100 focus-visible:outline focus-visible:outline-cyan-300">{label}</a>)}
      <details className="relative">
        <summary className="cursor-pointer px-2 py-2 text-cyan-100">More</summary>
        <div className="absolute bottom-full right-0 mb-3 max-h-[60vh] w-56 overflow-y-auto rounded border border-[var(--line)] bg-[#080e13] p-3 shadow-xl">
          {NAV.map(([section, items]) => <div key={section} className="mb-3">
            <p className="px-2 text-[9px] tracking-widest text-zinc-500">{section}</p>
            {items.map(label => <a key={label} href={`/${label.toLowerCase().replace(/\s/g, "-")}`} className="block px-2 py-2 text-cyan-100 hover:bg-white/10">{label}</a>)}
          </div>)}
        </div>
      </details>
    </nav>
    </>
  );
}
