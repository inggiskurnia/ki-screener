import { loadConfig } from "./config.js";
import { errorMessage, Logger } from "./logger.js";
import { PlaywrightIdxSource } from "./source.js";

async function smoke(): Promise<void> {
  const config = loadConfig({ requireTelegram: false });
  const logger = new Logger(config.logLevel);
  const source = new PlaywrightIdxSource({
    url: config.idxUrl,
    profilePath: config.browserProfilePath,
    staleAfterHours: config.staleAfterHours,
    headless: config.headless,
    logger
  });
  try {
    const result = await source.fetchSince(new Set(), 1);
    console.log(JSON.stringify({
      pagesVisited: result.pagesVisited,
      newestPublishedAt: result.newestPublishedAt,
      records: result.records.map((record) => ({
        publishedAt: record.publishedAt,
        ticker: record.ticker,
        title: record.title,
        primaryUrl: record.primaryUrl,
        attachments: record.attachments.length
      }))
    }, null, 2));
  } finally {
    await source.close();
  }
}

smoke().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: errorMessage(error) }));
  process.exitCode = 1;
});
