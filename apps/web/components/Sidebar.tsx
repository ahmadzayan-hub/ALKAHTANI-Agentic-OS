const NAV: [string, string[]][] = [
  ["OPERATE", ["Home","Dashboard","Comms","Funnel","Workflows","Social","Content","Finances"]],
  ["AGENTS", ["Agent OS","Agents","Tasks","Skills","Org Chart"]],
  ["INTELLIGENCE", ["G-Brain"]],
  ["SYSTEM", ["Connections","Roadmap","Analytics","Reference Model"]],
  ["VARIANTS", ["Personas"]],
];
export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-[var(--line)] p-4 space-y-4">
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
  );
}
