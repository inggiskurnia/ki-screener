import type { DisclosureDatabase } from "./database.js";
import { findMatchingKeyword } from "./matching.js";
import type { Logger } from "./logger.js";
import { errorMessage } from "./logger.js";
import type { DisclosureSource, HealthState, NotificationSender } from "./types.js";

export interface MonitorOptions {
  source: DisclosureSource;
  database: DisclosureDatabase;
  notifier: NotificationSender;
  keywords: readonly string[];
  catchUpPageLimit: number;
  health: HealthState;
  logger: Logger;
}

export class Monitor {
  private warningSent = false;

  constructor(private readonly options: MonitorOptions) {}

  async poll(): Promise<void> {
    if (this.options.health.pollInProgress) {
      this.options.logger.warn("Skipping overlapping poll");
      return;
    }
    this.options.health.pollInProgress = true;
    this.options.health.lastPollAttempt = new Date().toISOString();

    try {
      const initialized = this.options.database.isInitialized();
      const known = initialized ? this.options.database.recentFingerprints() : new Set<string>();
      const result = await this.options.source.fetchSince(known, initialized ? this.options.catchUpPageLimit : 1);

      if (!initialized) {
        this.options.database.initializeBaseline(result.records);
        this.options.logger.info("Initial IDX baseline recorded without notifications", { records: result.records.length });
      } else {
        const unseen = result.records
          .filter((record) => !this.options.database.has(record.fingerprint))
          .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt));

        for (const record of unseen) {
          const keyword = findMatchingKeyword(record, this.options.keywords);
          if (keyword) await this.options.notifier.sendDisclosure(record, keyword);
          this.options.database.save(record, Boolean(keyword));
        }
        if (!result.reachedKnownRecord && result.pagesVisited >= this.options.catchUpPageLimit) {
          this.options.logger.warn("Catch-up stopped at configured page limit before reaching a known record", {
            pageLimit: this.options.catchUpPageLimit
          });
        }
        this.options.logger.info("IDX poll completed", {
          fetched: result.records.length,
          unseen: unseen.length,
          pagesVisited: result.pagesVisited
        });
      }

      const previousFailures = this.options.health.consecutiveFailures;
      this.options.health.lastSuccessfulPoll = new Date().toISOString();
      this.options.health.consecutiveFailures = 0;
      this.options.health.lastError = null;
      this.options.health.browserStatus = this.options.source.browserHealthy ? "healthy" : "failed";
      this.options.health.telegramStatus = this.options.notifier.lastDeliveryStatus;

      if (this.warningSent && previousFailures > 0) {
        try {
          await this.options.notifier.sendOperational(`Monitoring recovered after ${previousFailures} consecutive failures.`);
          this.warningSent = false;
        } catch (error) {
          this.options.logger.error("Unable to send recovery notification", { error: errorMessage(error) });
        }
      }
    } catch (error) {
      this.options.health.consecutiveFailures += 1;
      this.options.health.lastError = errorMessage(error);
      this.options.health.browserStatus = this.options.source.browserHealthy ? "healthy" : "failed";
      this.options.health.telegramStatus = this.options.notifier.lastDeliveryStatus;
      this.options.logger.error("IDX poll failed", {
        failures: this.options.health.consecutiveFailures,
        error: errorMessage(error)
      });
      if (this.options.health.consecutiveFailures >= 3 && !this.warningSent) {
        try {
          await this.options.notifier.sendOperational(
            `Monitoring has failed ${this.options.health.consecutiveFailures} times. Latest error: ${errorMessage(error)}`
          );
          this.warningSent = true;
        } catch (notificationError) {
          this.options.logger.error("Unable to send operational failure notification", {
            error: errorMessage(notificationError)
          });
        }
      }
      throw error;
    } finally {
      this.options.health.pollInProgress = false;
    }
  }
}
