import Fastify from "fastify";
import { systemRoutes } from "./routes/system.js";
import { gbrainRoutes } from "./routes/gbrain.js";
import { agentRoutes } from "./routes/agents.js";
import { conductorRoutes } from "./routes/conductor.js";
import { connectorRoutes } from "./routes/connectors.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { funnelRoutes } from "./routes/funnel.js";
import { taskRoutes } from "./routes/tasks.js";
import { alertRoutes } from "./routes/alerts.js";
import { agentOsRoutes } from "./routes/agent-os.js";
import { syncVault } from "./runtime/vault.js";
import { startScheduler } from "./runtime/scheduler.js";
import { ensureSessions } from "./runtime/tmux.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, ts: Date.now() }));
app.register(systemRoutes, { prefix: "/api/v1/system" });
app.register(gbrainRoutes, { prefix: "/api/v1/gbrain" });
app.register(agentRoutes, { prefix: "/api/v1/agents" });
app.register(conductorRoutes, { prefix: "/api/v1/conductor" });
app.register(connectorRoutes, { prefix: "/api/v1/connectors" });
app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
app.register(funnelRoutes, { prefix: "/api/v1/funnel" });
app.register(taskRoutes, { prefix: "/api/v1/tasks" });
app.register(alertRoutes, { prefix: "/api/v1/alerts" });
app.register(agentOsRoutes, { prefix: "/api/v1/agent-os" });

// boot: vault → agents table, tmux crews, cron scheduler (each degrades gracefully)
(async () => {
  try { app.log.info({ synced: await syncVault() }, "vault sync"); }
  catch (e) { app.log.warn(e, "vault sync failed"); }
  app.log.info(await ensureSessions(), "tmux");
  app.log.info(await startScheduler(), "scheduler");
})();

app.listen({ port: 8080, host: "0.0.0.0" });
