import { createServer, type Server } from "node:http";
import type { HealthState } from "./types.js";

export function createInitialHealth(): HealthState {
  return {
    startedAt: new Date().toISOString(),
    schedulerActive: false,
    pollInProgress: false,
    lastPollAttempt: null,
    lastSuccessfulPoll: null,
    consecutiveFailures: 0,
    browserStatus: "idle",
    telegramStatus: "never",
    lastError: null
  };
}

export function startHealthServer(port: number, health: HealthState): Server {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const healthy = health.consecutiveFailures < 3;
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      ...health
    }));
  });
  server.listen(port, "0.0.0.0");
  return server;
}
