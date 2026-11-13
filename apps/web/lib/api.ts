// Shared client for the ALKAHTANI OS API.
//
// The browser always calls the API on its own origin under /api/v1. In a server
// build, next.config.mjs rewrites those paths to the real API (API_URL), so the
// API needs no CORS setup. In the GitHub Pages static export there is no API,
// and every call fails with a clear "unreachable" error instead of hanging.

// M6: swap for a session token. This is the documented local dev token, not a secret.
const TOKEN = "local-dev-token";

export type ApiErrorKind = "unreachable" | "unauthorized" | "http";

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError("unreachable", 0, e instanceof Error ? e.message : "network error");
  }

  const type = res.headers.get("content-type") ?? "";
  if (res.status === 401) throw new ApiError("unauthorized", 401, "The API rejected the operator token.");
  // No proxy target, a static host, or a dead upstream: there is no API here.
  if ([404, 500, 502, 503, 504].includes(res.status) && !type.includes("json")) {
    throw new ApiError("unreachable", res.status, `No API answered (HTTP ${res.status}).`);
  }
  if (!type.includes("json")) throw new ApiError("unreachable", res.status, "The API did not return JSON.");

  const body = await res.json();
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `HTTP ${res.status}`;
    throw new ApiError("http", res.status, String(msg));
  }
  return body as T;
}

export function describeError(e: unknown): { title: string; hint: string } {
  if (e instanceof ApiError && e.kind === "unreachable") {
    return {
      title: "The API is not reachable.",
      hint: "Start apps/api on port 8080, or set API_URL for the web app so /api/v1 is forwarded to it. " + e.message,
    };
  }
  if (e instanceof ApiError && e.kind === "unauthorized") {
    return { title: "The API rejected the request.", hint: "Set OPERATOR_TOKEN on the API to the local dev token, or update the web client." };
  }
  return { title: "The request failed.", hint: e instanceof Error ? e.message : String(e) };
}
