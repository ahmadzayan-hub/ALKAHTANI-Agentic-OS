import { db } from "../db.js";
import { CONNECTOR_PROBES } from "./probes.js";
import { raiseIncident } from "../services/alerts.js";
import type { ProbeResult } from "./types.js";

export { CONNECTOR_PROBES } from "./probes.js";

export async function runProbe(slug: string): Promise<ProbeResult & { slug: string }> {
  const probe = CONNECTOR_PROBES[slug];
  if (!probe) throw new Error(`no probe registered for connector "${slug}"`);

  const prior = (await db.query(`select id, status from connectors where slug=$1`, [slug])).rows[0];
  const r = await probe();

  await db.query(
    `update connectors set status=$2, latency_ms=$3, last_sync_at=now(),
       health=jsonb_build_object('detail',$4::text,'checked_at',now())
     where slug=$1`,
    [slug, r.status, r.latency_ms, r.detail]);

  if (prior && prior.status !== r.status && r.status !== "live") {
    await raiseIncident({
      connectorId: prior.id, severity: r.status === "offline" ? 2 : 1,
      message: `${slug}: ${prior.status} -> ${r.status} (${r.detail})`,
    });
  }

  return { slug, ...r };
}

export async function runAllProbes(): Promise<{ checked: number; results: (ProbeResult & { slug: string })[] }> {
  const results = await Promise.all(
    Object.keys(CONNECTOR_PROBES).map(slug =>
      runProbe(slug).catch(e => ({ slug, status: "offline" as const, latency_ms: null, detail: String(e?.message ?? e) }))));
  return { checked: results.length, results };
}
