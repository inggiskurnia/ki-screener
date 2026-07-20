import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectChallenge, PageChallengeError, PageParseError, parseIdxPage, parseIdxPublishedAt } from "../src/parser.js";

const fixture = readFileSync(new URL("./fixtures/disclosures.html", import.meta.url), "utf8");

describe("IDX parser", () => {
  it("parses records, tickers, URLs, and multiple attachments", () => {
    const parsed = parseIdxPage(fixture, "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi");
    expect(parsed.records).toHaveLength(3);
    expect(parsed.malformedCount).toBe(1);
    expect(parsed.records[0]).toMatchObject({
      ticker: "WISL",
      publishedAt: "2026-07-20T10:32:28+07:00",
      primaryUrl: "https://www.idx.co.id/StaticData/primary-wisl.pdf"
    });
    expect(parsed.records[0]?.attachments).toHaveLength(2);
    expect(parsed.records[1]?.ticker).toBeUndefined();
  });

  it("keeps corrected disclosures distinct from originals", () => {
    const parsed = parseIdxPage(fixture, "https://www.idx.co.id/");
    expect(new Set(parsed.records.map((record) => record.fingerprint)).size).toBe(3);
  });

  it("parses all Indonesian month names", () => {
    expect(parseIdxPublishedAt("1 Januari 2026 01:02:03")).toBe("2026-01-01T01:02:03+07:00");
    expect(parseIdxPublishedAt("31 Desember 2026 23:59:59")).toBe("2026-12-31T23:59:59+07:00");
  });

  it("rejects challenge pages and empty pages", () => {
    expect(() => detectChallenge("<title>Attention Required! | Cloudflare</title>")).toThrow(PageChallengeError);
    expect(() => parseIdxPage("<main></main>", "https://www.idx.co.id/")).toThrow(PageParseError);
  });
});
