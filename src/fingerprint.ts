import { createHash } from "node:crypto";

export function normalizeTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

export function createFingerprint(publishedAt: string, title: string, ticker: string | undefined, primaryUrl: string): string {
  return createHash("sha256")
    .update([publishedAt, normalizeTitle(title), ticker?.trim().toUpperCase() ?? "", primaryUrl.trim()].join("\u001f"))
    .digest("hex");
}
