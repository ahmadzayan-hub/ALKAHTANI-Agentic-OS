// Static export for GitHub Pages only (see ../../.github/workflows/nextjs.yml,
// the only place that sets NEXT_BASE_PATH). Everywhere else — local dev,
// docker-compose, a real host like Vercel — this must stay a normal server
// build: apps/web/Dockerfile runs `next build && next start`, which needs
// the server output, not a static export.
//
// In a server build the browser calls /api/v1 on its own origin and Next
// forwards it to the API. Target: API_URL, else NEXT_PUBLIC_API, else (in
// `next dev` only) http://localhost:8080. Rewrites are fixed at build time, so
// set API_URL before `next build`. With no target, /api/v1 returns 404 and the
// pages show an "API not reachable" panel.
const apiTarget =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API ||
  (process.env.NODE_ENV !== "production" ? "http://localhost:8080" : "");

/** @type {import('next').NextConfig} */
const nextConfig = process.env.NEXT_BASE_PATH
  ? { output: "export", basePath: process.env.NEXT_BASE_PATH, images: { unoptimized: true } }
  : {
      async rewrites() {
        if (!apiTarget) return [];
        return [{ source: "/api/v1/:path*", destination: `${apiTarget.replace(/\/$/, "")}/api/v1/:path*` }];
      },
    };

export default nextConfig;
