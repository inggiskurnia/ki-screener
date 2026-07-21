import { mkdirSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { Logger } from "./logger.js";
import { errorMessage } from "./logger.js";
import { detectChallenge, parseIdxPage, PageParseError } from "./parser.js";
import { withRetry } from "./retry.js";
import type { Disclosure, DisclosureSource, FetchResult } from "./types.js";

export interface PlaywrightSourceOptions {
  url: string;
  profilePath: string;
  staleAfterHours: number;
  headless: boolean;
  logger: Logger;
}

export class PlaywrightIdxSource implements DisclosureSource {
  browserHealthy = false;
  private context?: BrowserContext;
  private page?: Page;

  constructor(private readonly options: PlaywrightSourceOptions) {}

  async fetchSince(knownFingerprints: ReadonlySet<string>, pageLimit: number): Promise<FetchResult> {
    return withRetry(() => this.fetchOnce(knownFingerprints, pageLimit), {
      attempts: 3,
      initialDelayMs: 1_000,
      maximumDelayMs: 5_000,
      onRetry: (error, attempt, delayMs) => this.options.logger.warn("IDX page attempt failed; retrying", {
        attempt, delayMs, error: errorMessage(error)
      })
    });
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    mkdirSync(this.options.profilePath, { recursive: true });
    this.context = await chromium.launchPersistentContext(this.options.profilePath, {
      headless: this.options.headless,
      channel: "chromium",
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
      viewport: { width: 1440, height: 1000 },
      locale: "id-ID",
      timezoneId: "Asia/Jakarta"
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    this.browserHealthy = true;
    return this.page;
  }

  private async loadFirstPage(page: Page): Promise<void> {
    if (page.url() === this.options.url) await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    else await page.goto(this.options.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    try {
      await this.waitForStableDisclosureList(page, undefined, 30_000);
    } catch (error) {
      detectChallenge(await page.content());
      const title = (await page.title()).trim() || "untitled page";
      throw new PageParseError(`IDX disclosure list did not render (page title: ${title}): ${errorMessage(error)}`);
    }
  }

  private async disclosureSignature(page: Page): Promise<string | undefined> {
    return page.evaluate(() => {
      const entries: string[][] = [];
      for (const time of Array.from(document.querySelectorAll("main time"))) {
        let container = time.parentElement;
        while (container && container.querySelectorAll("h6").length === 0) container = container.parentElement;
        if (!container || container.tagName === "MAIN" || container.querySelectorAll("time").length !== 1) continue;
        const anchor = container.querySelector("h6 a[href]") as HTMLAnchorElement | null;
        const label = time.textContent?.replace(/\s+/g, " ").trim();
        if (anchor?.href && label) entries.push([label, anchor.href]);
      }
      return entries.length > 0 ? JSON.stringify(entries) : undefined;
    });
  }

  private async waitForStableDisclosureList(
    page: Page,
    previousSignature: string | undefined,
    timeoutMs: number
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let lastSignature: string | undefined;
    let consecutiveMatches = 0;

    while (Date.now() < deadline) {
      const signature = await this.disclosureSignature(page);
      if (signature && signature !== previousSignature) {
        consecutiveMatches = signature === lastSignature ? consecutiveMatches + 1 : 1;
        lastSignature = signature;
        if (consecutiveMatches >= 2) return signature;
      } else {
        consecutiveMatches = 0;
        lastSignature = signature;
      }
      await page.waitForTimeout(250);
    }

    detectChallenge(await page.content());
    throw new PageParseError("IDX disclosure list did not become complete and stable before the timeout");
  }

  private async fetchOnce(knownFingerprints: ReadonlySet<string>, pageLimit: number): Promise<FetchResult> {
    try {
      const page = await this.ensurePage();
      await this.loadFirstPage(page);
      const collected: Disclosure[] = [];
      const collectedFingerprints = new Set<string>();
      let reachedKnownRecord = false;
      let pagesVisited = 0;
      let pageSignature = await this.disclosureSignature(page);

      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        pagesVisited = pageNumber;
        const parsed = parseIdxPage(await page.content(), this.options.url);
        if (parsed.malformedCount > 0) {
          this.options.logger.warn("IDX page contained malformed disclosure entries", { pageNumber, count: parsed.malformedCount });
        }
        for (const record of parsed.records) {
          if (knownFingerprints.has(record.fingerprint)) reachedKnownRecord = true;
          if (!collectedFingerprints.has(record.fingerprint)) {
            collected.push(record);
            collectedFingerprints.add(record.fingerprint);
          }
        }
        if (reachedKnownRecord) break;

        const next = page.locator('button[aria-label="Go to next page"]');
        if (await next.count() !== 1 || await next.isDisabled()) break;
        const previousSignature = pageSignature;
        await next.click();
        pageSignature = await this.waitForStableDisclosureList(page, previousSignature, 20_000);
      }

      const newestPublishedAt = collected[0]?.publishedAt;
      if (!newestPublishedAt) throw new PageParseError("IDX returned no disclosure records");
      const ageHours = (Date.now() - new Date(newestPublishedAt).getTime()) / 3_600_000;
      if (ageHours > this.options.staleAfterHours) {
        throw new PageParseError(`Newest IDX disclosure is stale (${Math.floor(ageHours)} hours old)`);
      }
      this.browserHealthy = true;
      return { records: collected, reachedKnownRecord, pagesVisited, newestPublishedAt };
    } catch (error) {
      this.browserHealthy = false;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
    this.browserHealthy = false;
  }
}
