import type { Disclosure } from "./types.js";

export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

export function findMatchingKeyword(disclosure: Disclosure, keywords: readonly string[]): string | undefined {
  const haystack = normalizeForMatch([
    disclosure.title,
    disclosure.ticker ?? "",
    ...disclosure.attachments.map((attachment) => attachment.name)
  ].join("\n"));

  return keywords.find((keyword) => haystack.includes(normalizeForMatch(keyword)));
}
