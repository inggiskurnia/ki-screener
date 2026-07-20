import { loadConfig } from "./config.js";
import { DisclosureDatabase } from "./database.js";
import { createInitialHealth, startHealthServer } from "./health.js";
import { Logger, errorMessage } from "./logger.js";
import { Monitor } from "./monitor.js";
import { PollScheduler } from "./schedule.js";
import { PlaywrightIdxSource } from "./source.js";
import { TelegramNotifier } from "./telegram.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const health = createInitialHealth();
  const database = new DisclosureDatabase(config.databasePath);
  const source = new PlaywrightIdxSource({
    url: config.idxUrl,
    profilePath: config.browserProfilePath,
    staleAfterHours: config.staleAfterHours,
    headless: config.headless,
    logger
  });
  const notifier = new TelegramNotifier(config.telegramBotToken, config.telegramChatId, logger);
  const monitor = new Monitor({
    source,
    database,
    notifier,
    keywords: config.keywords,
    catchUpPageLimit: config.catchUpPageLimit,
    health,
    logger
  });
  const healthServer = startHealthServer(config.healthPort, health);
  const scheduler = new PollScheduler(
    config.timezone,
    config.pollIntervalMinutes,
    () => monitor.poll(),
    logger,
    (active) => { health.schedulerActive = active; }
  );
  scheduler.start();
  logger.info("IDX Telegram monitor started", {
    timezone: config.timezone,
    intervalMinutes: config.pollIntervalMinutes,
    keywordCount: config.keywords.length,
    healthPort: config.healthPort
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });
    scheduler.stop();
    health.browserStatus = "closed";
    await source.close();
    database.close();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  };
  process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));
}

main().catch((error) => {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", message: "Startup failed", error: errorMessage(error) }));
  process.exitCode = 1;
});
