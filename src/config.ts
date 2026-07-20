import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LogLevel } from "./logger.js";

export interface AppConfig {
  telegramBotToken: string;
  telegramChatId: string;
  databasePath: string;
  browserProfilePath: string;
  timezone: string;
  idxUrl: string;
  keywordsPath: string;
  keywords: string[];
  pollIntervalMinutes: number;
  catchUpPageLimit: number;
  staleAfterHours: number;
  healthPort: number;
  logLevel: LogLevel;
  headless: boolean;
}

interface LoadOptions {
  requireTelegram?: boolean;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function loadKeywords(path: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read keyword configuration at ${path}: ${String(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Keyword configuration must be a JSON array");
  const keywords = [...new Set(parsed.map((value) => String(value).trim()).filter(Boolean))];
  if (keywords.length === 0) throw new Error("Keyword configuration must contain at least one non-empty keyword");
  return keywords;
}

export function loadConfig(options: LoadOptions = {}): AppConfig {
  const requireTelegram = options.requireTelegram ?? true;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (requireTelegram && (!telegramBotToken || !telegramChatId)) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  }

  const logLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  if (!["debug", "info", "warn", "error"].includes(logLevel)) throw new Error("LOG_LEVEL is invalid");
  const keywordsPath = resolve(process.env.KEYWORDS_PATH ?? "config/keywords.json");

  return {
    telegramBotToken,
    telegramChatId,
    databasePath: resolve(process.env.DATABASE_PATH ?? "data/idx-alerts.sqlite"),
    browserProfilePath: resolve(process.env.BROWSER_PROFILE_PATH ?? "browser-profile"),
    timezone: process.env.TZ?.trim() || "Asia/Jakarta",
    idxUrl: process.env.IDX_URL?.trim() || "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi",
    keywordsPath,
    keywords: loadKeywords(keywordsPath),
    pollIntervalMinutes: positiveInteger("POLL_INTERVAL_MINUTES", 5),
    catchUpPageLimit: positiveInteger("CATCH_UP_PAGE_LIMIT", 20),
    staleAfterHours: positiveInteger("STALE_AFTER_HOURS", 168),
    healthPort: positiveInteger("HEALTH_PORT", 3000),
    logLevel,
    headless: process.env.HEADLESS !== "false"
  };
}
