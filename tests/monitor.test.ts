import { describe, expect, it } from "vitest";
import { DisclosureDatabase } from "../src/database.js";
import { createInitialHealth } from "../src/health.js";
import { Logger } from "../src/logger.js";
import { Monitor } from "../src/monitor.js";
import type { Disclosure, DisclosureSource, FetchResult, NotificationSender } from "../src/types.js";

function record(fingerprint: string, title: string, publishedAt: string): Disclosure {
  return {
    fingerprint,
    publishedAt,
    publishedLabel: "20 Juli 2026 10:00:00",
    title,
    primaryUrl: `https://example.test/${fingerprint}.pdf`,
    attachments: []
  };
}

class FakeSource implements DisclosureSource {
  browserHealthy = true;
  constructor(private readonly results: Array<FetchResult | Error>) {}
  async fetchSince(): Promise<FetchResult> {
    const result = this.results.shift();
    if (!result) throw new Error("No scripted source result");
    if (result instanceof Error) {
      this.browserHealthy = false;
      throw result;
    }
    this.browserHealthy = true;
    return result;
  }
  async close(): Promise<void> {}
}

class FakeNotifier implements NotificationSender {
  lastDeliveryStatus: "never" | "ok" | "failed" = "never";
  disclosures: Array<{ fingerprint: string; keyword: string }> = [];
  operational: string[] = [];
  async sendDisclosure(disclosure: Disclosure, keyword: string): Promise<void> {
    this.disclosures.push({ fingerprint: disclosure.fingerprint, keyword });
    this.lastDeliveryStatus = "ok";
  }
  async sendOperational(message: string): Promise<void> {
    this.operational.push(message);
    this.lastDeliveryStatus = "ok";
  }
}

function result(records: Disclosure[], reachedKnownRecord = true): FetchResult {
  return { records, reachedKnownRecord, pagesVisited: 1, newestPublishedAt: records[0]?.publishedAt };
}

describe("monitor processing", () => {
  it("baselines silently, alerts only new matches, and never resends", async () => {
    const baseline = record("old", "Existing acquisition [OLD]", "2026-07-20T09:00:00+07:00");
    const matching = record("new-match", "New material transaction [NEW]", "2026-07-20T10:00:00+07:00");
    const nonmatching = record("new-other", "Routine report [OTH]", "2026-07-20T10:01:00+07:00");
    const source = new FakeSource([
      result([baseline], false),
      result([nonmatching, matching, baseline]),
      result([nonmatching, matching, baseline])
    ]);
    const database = new DisclosureDatabase(":memory:");
    const notifier = new FakeNotifier();
    const health = createInitialHealth();
    const monitor = new Monitor({
      source, database, notifier, keywords: ["material transaction"], catchUpPageLimit: 20,
      health, logger: new Logger("error")
    });

    await monitor.poll();
    expect(notifier.disclosures).toHaveLength(0);
    expect(database.count()).toBe(1);
    await monitor.poll();
    expect(notifier.disclosures).toEqual([{ fingerprint: "new-match", keyword: "material transaction" }]);
    expect(database.count()).toBe(3);
    await monitor.poll();
    expect(notifier.disclosures).toHaveLength(1);
    expect(health.consecutiveFailures).toBe(0);
    database.close();
  });

  it("warns after three failures and reports recovery", async () => {
    const baseline = record("old", "Existing report", "2026-07-20T09:00:00+07:00");
    const source = new FakeSource([
      result([baseline], false),
      new Error("IDX unavailable"),
      new Error("IDX unavailable"),
      new Error("IDX unavailable"),
      result([baseline])
    ]);
    const database = new DisclosureDatabase(":memory:");
    const notifier = new FakeNotifier();
    const health = createInitialHealth();
    const monitor = new Monitor({
      source, database, notifier, keywords: ["material"], catchUpPageLimit: 20,
      health, logger: new Logger("error")
    });

    await monitor.poll();
    await expect(monitor.poll()).rejects.toThrow("IDX unavailable");
    await expect(monitor.poll()).rejects.toThrow("IDX unavailable");
    await expect(monitor.poll()).rejects.toThrow("IDX unavailable");
    expect(health.consecutiveFailures).toBe(3);
    expect(notifier.operational[0]).toContain("failed 3 times");
    await monitor.poll();
    expect(health.consecutiveFailures).toBe(0);
    expect(notifier.operational[1]).toContain("recovered");
    database.close();
  });
});
