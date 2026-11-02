"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "presence" | "core" | "registry";
type Identity = { slug: string; name: string };
const MODES: Mode[] = ["presence", "core", "registry"];
const COUNT = 1100;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Original parametric geometry. No portrait, model, donor code or external asset.
function geometry(mode: Mode): Float32Array {
  const points = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const headCount = 850;
    const t = i / COUNT;
    let y = 1 - 2 * (i + 0.5) / COUNT;
    const radius = Math.sqrt(1 - y * y);
    let x = Math.cos(i * GOLDEN_ANGLE) * radius;
    let z = Math.sin(i * GOLDEN_ANGLE) * radius;
    if (mode === "presence") {
      if (i < headCount) {
        const v = 2 * ((i % 670) + 0.5) / 670 - 1;
        const r = Math.sqrt(1 - v * v);
        x = Math.cos(i * GOLDEN_ANGLE) * r * 0.51 * (1 - 0.23 * Math.max(0, v));
        z = Math.sin(i * GOLDEN_ANGLE) * r * 0.40;
        y = v * 0.78 - 0.27;
        if (z > 0) {
          const bump = (cx: number, cy: number, sx: number, sy: number) =>
            Math.exp(-((x - cx) ** 2 / sx + (y - cy) ** 2 / sy));
          z += 0.26 * bump(0, -0.23, 0.012, 0.12); // nose bridge
          z += 0.15 * bump(0, -0.02, 0.022, 0.008);
          z -= 0.13 * (bump(-0.20, -0.36, 0.012, 0.008) + bump(0.20, -0.36, 0.012, 0.008));
          z += 0.04 * (bump(-0.22, -0.48, 0.022, 0.003) + bump(0.22, -0.48, 0.022, 0.003));
          z -= 0.08 * bump(0, 0.19, 0.036, 0.0015); // mouth contour
        }
        // Sparse facial contours make the front readable without a mesh asset.
        if (i >= 670) {
          const feature = Math.floor((i - 670) / 30);
          const u = ((i - 670) % 30) / 29;
          if (feature < 2) {
            x = (feature ? 0.20 : -0.20) + Math.cos(u * Math.PI * 2) * 0.105;
            y = -0.36 + Math.sin(u * Math.PI * 2) * 0.047;
          } else if (feature === 2) {
            x = 0.022 * Math.sin(u * Math.PI);
            y = -0.42 + u * 0.47;
          } else if (feature === 3) {
            x = (u - 0.5) * 0.32;
            y = 0.19 + Math.sin(u * Math.PI) * 0.025;
          } else {
            x = (feature === 4 ? -0.20 : 0.20) + (u - 0.5) * 0.24;
            y = -0.48 - Math.sin(u * Math.PI) * 0.025;
          }
          const v = (y + 0.27) / 0.78;
          const halfWidth = 0.51 * (1 - 0.23 * Math.max(0, v));
          z = 0.40 * Math.sqrt(Math.max(0, 1 - v * v - (x / halfWidth) ** 2)) + 0.018;
          if (feature === 2) z += 0.25 * Math.sin(u * Math.PI * 0.7);
        }
      } else {
        const v = (i - headCount) / (COUNT - headCount);
        const angle = i * GOLDEN_ANGLE;
        const width = 0.19 + 0.87 * v;
        x = Math.cos(angle) * width;
        z = Math.sin(angle) * (0.18 + 0.11 * v);
        y = 0.48 + 0.51 * v + 0.13 * Math.abs(x);
      }
    } else {
      const scale = mode === "registry" ? 0.28 : 0.79;
      x *= scale; y *= scale; z *= scale;
      if (mode === "core") y += 0.025 * Math.sin(t * 16);
    }
    points.set([x, y, z], i * 3);
  }
  return points;
}

export default function JarvisPresence({ agents }: { agents: Identity[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const displayed = useRef<Float32Array | null>(null);
  const [mode, setMode] = useState<Mode>("presence");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !host || !context) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = geometry(mode);
    const from = displayed.current?.slice() ?? target.slice();
    const current = new Float32Array(target.length);
    const identities = agents?.slice(0, 8) ?? [];
    let width = 0, height = 0, frame = 0, last = 0, started = 0;
    let visible = true, reduce = media.matches, disposed = false;
    setReduced(reduce);

    function draw(now: number, still: boolean) {
      if (!context || !canvas) return;
      const blend = still ? 1 : Math.min(1, (now - started) / 1100);
      const ease = blend * blend * (3 - 2 * blend);
      const time = still ? 0 : now * 0.00035;
      const yaw = mode === "presence" ? -0.17 + Math.sin(time) * 0.12 : time * 0.42;
      const scale = Math.min(width * 0.35, height * 0.37);
      const cx = width * 0.5, cy = height * 0.48;
      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.38);
      glow.addColorStop(0, "rgba(239,175,71,0.12)");
      glow.addColorStop(0.48, "rgba(54,174,187,0.035)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.lineWidth = 0.7;
      context.strokeStyle = "rgba(100,213,228,0.13)";
      context.beginPath();
      context.ellipse(cx, height * 0.90, scale * 0.91, scale * 0.095, 0, 0, Math.PI * 2);
      context.stroke();
      if (mode !== "presence") {
        for (let ring = 0; ring < 3; ring++) {
          context.strokeStyle = ring === 0 ? "rgba(229,177,82,0.65)" : "rgba(96,222,236,0.21)";
          context.beginPath();
          context.ellipse(cx, cy, scale * (0.94 + ring * 0.11), scale * (0.24 + ring * 0.17),
            -0.40 + ring * 0.43 + Math.sin(time) * 0.08, 0, Math.PI * 2);
          context.stroke();
        }
      }
      const stride = width < 480 ? 2 : 1;
      for (let i = 0; i < COUNT; i++) {
        const offset = i * 3;
        for (let axis = 0; axis < 3; axis++) current[offset + axis] = from[offset + axis] * (1 - ease) + target[offset + axis] * ease;
        if (i % stride || (mode === "registry" && i % 3)) continue;
        const x = current[offset], y = current[offset + 1], z = current[offset + 2];
        const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
        const rz = z * Math.cos(yaw) - x * Math.sin(yaw);
        const perspective = 3.8 / (3.8 - rz);
        const gold = Math.abs(x) < 0.17 && z > 0.20 && i % 3 === 0;
        context.globalAlpha = Math.max(0.13, Math.min(0.9, 0.45 + rz * 0.7));
        context.fillStyle = gold ? "#f8ca78" : "#85e8f2";
        context.beginPath();
        context.arc(cx + rx * scale * perspective, cy + y * scale * perspective,
          (gold ? 1.22 : 0.85) * perspective, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (mode === "registry") {
        identities.forEach((agent, index) => {
          const angle = index * Math.PI * 2 / identities.length - Math.PI / 2;
          const x = cx + Math.cos(angle) * scale * 1.07;
          const y = cy + Math.sin(angle) * scale * 0.95;
          context.strokeStyle = "rgba(104,218,231,0.28)";
          context.beginPath(); context.moveTo(cx, cy); context.lineTo(x, y); context.stroke();
          context.fillStyle = "#07161b"; context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
          context.strokeStyle = "#73c8d5"; context.stroke();
          context.fillStyle = "#acbcc3"; context.font = "10px ui-monospace, monospace"; context.textAlign = "center";
          context.fillText(agent.name.slice(0, 17), x, y + 22);
        });
        if (!identities.length) {
          context.fillStyle = "#83959d"; context.font = "11px ui-monospace, monospace"; context.textAlign = "center";
          context.fillText(agents === null ? "Load the registry to map identities" : "No registered identities", cx, cy + scale * 0.65);
        }
      }
      displayed.current = current;
    }
    function tick(now: number) {
      if (disposed || !visible || document.hidden) { frame = 0; return; }
      if (!started) started = now;
      if (now - last >= 1000 / 24) { draw(now, false); last = now; }
      frame = requestAnimationFrame(tick);
    }
    function restart() {
      cancelAnimationFrame(frame); frame = 0;
      if (!width || disposed) return;
      if (paused || reduce) { draw(performance.now(), true); return; }
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    }
    function resize() {
      if (!canvas || !host || !context) return;
      width = host.clientWidth; height = host.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      restart();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; restart(); });
    intersection.observe(host);
    function motionChanged() { reduce = media.matches; setReduced(reduce); restart(); }
    media.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", restart);
    resize();
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      observer.disconnect(); intersection.disconnect();
      media.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [mode, paused, agents]);

  return <section className="presence-stage" aria-label="Jarvis ambient visualization">
    <div className="presence-caption"><span>VISUAL INTERFACE / 01</span><span>NO RUNTIME CONNECTION</span></div>
    <div ref={hostRef} className="presence-canvas"><canvas ref={canvasRef} aria-hidden="true" /></div>
    <div className="presence-axis" aria-hidden="true"><span>+ </span><span>ALKAHTANI / J</span><span> +</span></div>
    <div className="presence-controls">
      <div className="presence-modes" role="group" aria-label="Visualization mode">
        {MODES.map(value => <button key={value} type="button" aria-pressed={value === mode} onClick={() => setMode(value)}>{value}</button>)}
      </div>
      <button type="button" className="motion-control" aria-pressed={paused} disabled={reduced} onClick={() => setPaused(value => !value)}>
        {reduced ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}
      </button>
    </div>
    <p className="presence-note">{mode === "registry"
      ? "Registry map · recorded identities, runtime unverified" + (agents && agents.length > 8 ? " · first 8 shown" : "")
      : "Ambient visualization · does not listen, think or execute"}</p>
  </section>;
}
