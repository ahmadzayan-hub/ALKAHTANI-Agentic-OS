"use client";
import { describeError } from "../lib/api";

export function Loading({ label = "loading…" }: { label?: string }) {
  return (
    <div role="status" className="text-sm text-zinc-500 py-6">
      <span className="inline-block w-2 h-2 mr-2 bg-[var(--fin)] animate-pulse align-middle" />
      {label}
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, hint } = describeError(error);
  return (
    <div role="alert" className="border border-[rgba(255,176,32,.5)] bg-[rgba(255,176,32,.06)] p-4 max-w-2xl">
      <div className="text-[10px] tracking-widest text-[#ffb020] uppercase">// API OFFLINE</div>
      <p className="mt-2 text-sm text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 break-words">{hint}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 px-3 py-1.5 border border-zinc-600 text-sm hover:border-zinc-300">
          Retry
        </button>
      )}
    </div>
  );
}
