import { describe, expect, it } from "vitest";
import { createFingerprint } from "../src/fingerprint.js";
import { findMatchingKeyword, normalizeForMatch } from "../src/matching.js";
import type { Disclosure } from "../src/types.js";

const disclosure: Disclosure = {
  fingerprint: "fingerprint",
  publishedAt: "2026-07-20T10:00:00+07:00",
  publishedLabel: "20 Juli 2026 10:00:00",
  title: "Laporan Informasi dan Fakta Material [BBCA]",
  ticker: "BBCA",
  primaryUrl: "https://example.test/primary.pdf",
  attachments: [{ name: "Rencana_AKUISISI.pdf", url: "https://example.test/attachment.pdf" }]
};

describe("matching and fingerprints", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeForMatch("  Transaksi   MATERIAL ")).toBe("transaksi material");
  });

  it("matches title, ticker, and attachment filename", () => {
    expect(findMatchingKeyword(disclosure, ["fakta material"])).toBe("fakta material");
    expect(findMatchingKeyword(disclosure, ["bbca"])).toBe("bbca");
    expect(findMatchingKeyword(disclosure, ["akuisisi"])).toBe("akuisisi");
    expect(findMatchingKeyword(disclosure, ["dividen"])).toBeUndefined();
  });

  it("creates stable but discriminating fingerprints", () => {
    const first = createFingerprint(disclosure.publishedAt, disclosure.title, disclosure.ticker, disclosure.primaryUrl);
    const normalized = createFingerprint(disclosure.publishedAt, `  ${disclosure.title.toUpperCase()}  `, disclosure.ticker, disclosure.primaryUrl);
    const corrected = createFingerprint(disclosure.publishedAt, `${disclosure.title} (KOREKSI)`, disclosure.ticker, disclosure.primaryUrl);
    expect(first).toBe(normalized);
    expect(corrected).not.toBe(first);
  });
});
