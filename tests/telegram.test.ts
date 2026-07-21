import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Logger } from "../src/logger.js";
import { escapeTelegramHtml, formatDisclosureMessage, TelegramNotifier } from "../src/telegram.js";
import type { Disclosure } from "../src/types.js";

const disclosure: Disclosure = {
  fingerprint: "x",
  publishedAt: "2026-07-20T10:00:00+07:00",
  publishedLabel: "20 Juli 2026 10:00:00",
  title: "A & B <Material> [TEST]",
  ticker: "TEST",
  primaryUrl: "https://example.test/a?x=1&y=2",
  attachments: [{ name: "Report & notes.pdf", url: "https://example.test/report.pdf" }]
};

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Telegram messages", () => {
  it("escapes Telegram HTML and formats useful links", () => {
    expect(escapeTelegramHtml('A&B<"')).toBe("A&amp;B&lt;&quot;");
    const message = formatDisclosureMessage(disclosure, "A & B");
    expect(message).toContain("A &amp; B &lt;Material&gt;");
    expect(message).toContain("Matched: <code>A &amp; B</code>");
    expect(message).not.toContain("A & B <Material>");
  });

  it("does not double-encode an already encoded IDX document URL", () => {
    const primaryUrl = "https://www.idx.co.id/StaticData/Exchange/Peng-Batas%20Akhir%20Perdagangan.pdf";
    const message = formatDisclosureMessage({ ...disclosure, primaryUrl }, "material");
    expect(message).toContain(`href="${primaryUrl}"`);
    expect(message).not.toContain("%2520");
  });

  it("retries a partial API failure and eventually succeeds", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(requests === 1 ? 500 : 200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: requests > 1 }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const notifier = new TelegramNotifier("token", "chat", new Logger("error"), `http://127.0.0.1:${address.port}`);
    await notifier.sendDisclosure(disclosure, "material");
    expect(requests).toBe(2);
    expect(notifier.lastDeliveryStatus).toBe("ok");
  });
});
