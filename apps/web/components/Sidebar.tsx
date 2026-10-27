"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Only pages that exist in apps/web/app. Screens that are still mockups live
// in design/mockups and are listed separately so nothing here is a dead link.
const NAV: [string, { label: string; href: string }[]][] = [
  ["OPERATE", [
    { label: "Home", href: "/" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Funnel", href: "/funnel" },
  ]],
  ["AGENTS", [{ label: "Tasks", href: "/tasks" }]],
  ["INTELLIGENCE", [{ label: "G-Brain", href: "/g-brain" }]],
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <aside className="md:w-56 md:shrink-0 border-b md:border-b-0 md:border-r border-[var(--line)] p-4 md:min-h-screen">
      <div className="flex items-center justify-between">
        <Link href="/" className="neon text-[var(--fin)] font-bold">ALKAHTANI OS · v3</Link>
        <button
          type="button"
          className="md:hidden px-2 py-1 border border-zinc-600 text-xs"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen(v => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <nav id="primary-nav" aria-label="Primary" className={`${open ? "block" : "hidden"} md:block mt-4 space-y-4`}>
        {NAV.map(([sec, items]) => (
          <div key={sec}>
            <div className="text-[10px] tracking-widest text-zinc-500">{sec}</div>
            {items.map(i => {
              const active = i.href === "/" ? pathname === "/" : pathname?.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`block px-2 py-1.5 md:py-1 hover:bg-white/10 hover:text-white ${
                    active ? "bg-white/10 text-[var(--fin)] border-l-2 border-[var(--fin)]" : "border-l-2 border-transparent"
                  }`}
                >
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="text-[10px] text-zinc-600 leading-relaxed">
          More screens (comms, workflows, connections, org chart, personas) exist as
          design mockups in design/mockups, not as pages yet.
        </div>
      </nav>
    </aside>
  );
}
