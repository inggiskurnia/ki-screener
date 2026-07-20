import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialHealth, startHealthServer } from "../src/health.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("health endpoint", () => {
  it("reports safe status and becomes degraded after three failures", async () => {
    const health = createInitialHealth();
    const server = startHealthServer(0, health);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Health server did not bind");
    const url = `http://127.0.0.1:${address.port}/health`;
    const initial = await fetch(url);
    expect(initial.status).toBe(200);
    const body = await initial.json() as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(JSON.stringify(body)).not.toContain("TOKEN");

    health.consecutiveFailures = 3;
    health.lastError = "failure";
    const degraded = await fetch(url);
    expect(degraded.status).toBe(503);
  });
});
