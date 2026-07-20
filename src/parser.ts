import { load } from "cheerio";
import { createFingerprint } from "./fingerprint.js";
import type { Attachment, Disclosure } from "./types.js";

const monthNumbers: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
};

export class PageChallengeError extends Error {}
export class PageParseError extends Error {}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseIdxPublishedAt(label: string): string {
  const normalized = normalizeWhitespace(label).toLocaleLowerCase("id-ID");
  const match = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) throw new PageParseError(`Unrecognized IDX timestamp: ${label}`);
  const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match;
  const month = monthNumbers[monthText ?? ""];
  if (!month) throw new PageParseError(`Unrecognized Indonesian month in timestamp: ${label}`);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${yearText}-${pad(month)}-${pad(Number(dayText))}T${hourText}:${minuteText}:${secondText}+07:00`;
}

function absoluteUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    throw new PageParseError(`Invalid disclosure URL: ${href}`);
  }
}

function tickerFromTitle(title: string): string | undefined {
  return /\[\s*([A-Z0-9]{2,8})\s*\]\s*$/i.exec(title)?.[1]?.toUpperCase();
}

export interface ParsedPage {
  records: Disclosure[];
  malformedCount: number;
}

export function detectChallenge(html: string): void {
  const lower = html.toLocaleLowerCase("en-US");
  const challengePhrases = [
    "attention required! | cloudflare",
    "sorry, you have been blocked",
    "verify you are human",
    "cf-chl-"
  ];
  if (challengePhrases.some((phrase) => lower.includes(phrase))) {
    throw new PageChallengeError("IDX returned a Cloudflare challenge or block page");
  }
}

export function parseIdxPage(html: string, pageUrl: string): ParsedPage {
  detectChallenge(html);
  const $ = load(html);
  const records: Disclosure[] = [];
  let malformedCount = 0;

  $("main time").each((_index, element) => {
    try {
      const time = $(element);
      let container = time.parent();
      while (container.length && container.find("h6").length === 0) container = container.parent();
      if (!container.length || container.is("main") || container.find("time").length !== 1) {
        throw new PageParseError("Could not isolate disclosure container");
      }

      const heading = container.find("h6").first();
      const primaryAnchor = heading.find("a[href]").first();
      const title = normalizeWhitespace(heading.text());
      const publishedLabel = normalizeWhitespace(time.text());
      const primaryHref = primaryAnchor.attr("href")?.trim();
      if (!title || !publishedLabel || !primaryHref) throw new PageParseError("Disclosure is missing title, timestamp, or primary link");

      const publishedAt = parseIdxPublishedAt(publishedLabel);
      const primaryUrl = absoluteUrl(primaryHref, pageUrl);
      const attachments: Attachment[] = [];
      container.find("a[href]").each((_linkIndex, linkElement) => {
        const anchor = $(linkElement);
        const href = anchor.attr("href")?.trim();
        if (!href) return;
        const url = absoluteUrl(href, pageUrl);
        if (url === primaryUrl) return;
        const name = normalizeWhitespace(anchor.text()).replace(/^[^\p{L}\p{N}]+/u, "");
        if (name) attachments.push({ name, url });
      });

      const ticker = tickerFromTitle(title);
      records.push({
        fingerprint: createFingerprint(publishedAt, title, ticker, primaryUrl),
        publishedAt,
        publishedLabel,
        title,
        ticker,
        primaryUrl,
        attachments
      });
    } catch {
      malformedCount += 1;
    }
  });

  if (records.length === 0) {
    throw new PageParseError("No valid disclosures were found in the rendered IDX page");
  }
  return { records, malformedCount };
}
