export interface HermesEvidence {
  installedVersion: string | null;
  runningVersion: string | null;
  observedAt: string;
  responding: boolean;
}

export interface HermesStatus {
  state: "disabled" | "unconfigured" | "unreachable" | "unverified" | "stale" | "connected";
  installedVersion: string | null;
  runningVersion: string | null;
  observedAt: string | null;
  checkedAt: string;
  executionEnabled: false;
  memoryLinked: false;
}

interface Options {
  enabled?: boolean;
  probe?: (signal: AbortSignal) => Promise<HermesEvidence>;
  now?: () => number;
  timeoutMs?: number;
}

// A metadata boundary only. Production has no process, network or filesystem probe.
// A future transport must be reviewed before it is injected here.
export function createHermesAdapter({ enabled = false, probe, now = Date.now, timeoutMs = 1000 }: Options = {}) {
  return {
    async status(): Promise<HermesStatus> {
      const checkedAt = new Date(now()).toISOString();
      const empty = (state: HermesStatus["state"]): HermesStatus => ({
        state, installedVersion: null, runningVersion: null, observedAt: null,
        checkedAt, executionEnabled: false, memoryLinked: false,
      });
      if (!enabled) return empty("disabled");
      if (!probe) return empty("unconfigured");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const evidence = await Promise.race([
          Promise.resolve().then(() => probe(controller.signal)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("metadata probe timeout"));
            }, Math.min(2000, Math.max(1, timeoutMs)));
          }),
        ]);
        const version = (value: unknown): value is string | null => value === null ||
          (typeof value === "string" && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/.test(value));
        if (!evidence || !version(evidence.installedVersion) || !version(evidence.runningVersion) ||
            typeof evidence.observedAt !== "string" || typeof evidence.responding !== "boolean") return empty("unverified");
        const observed = Date.parse(evidence.observedAt);
        const age = now() - observed;
        if (!Number.isFinite(observed) || age < -5000) return empty("unverified");
        return {
          ...empty(age > 60000 ? "stale" : evidence.responding && evidence.runningVersion ? "connected" : "unverified"),
          installedVersion: evidence.installedVersion,
          runningVersion: evidence.runningVersion,
          observedAt: new Date(observed).toISOString(),
        };
      } catch {
        // Provider errors can contain paths or credentials; they never enter the API response.
        return empty("unreachable");
      } finally {
        if (timer) clearTimeout(timer);
        controller.abort();
      }
    },
  };
}
