import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Disclosure } from "./types.js";

export class DisclosureDatabase {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS disclosures (
        fingerprint TEXT PRIMARY KEY,
        published_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        notified_at TEXT,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_disclosures_published_at
        ON disclosures(published_at DESC);
    `);
  }

  isInitialized(): boolean {
    return this.database.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get() !== undefined;
  }

  initializeBaseline(records: readonly Disclosure[]): void {
    const save = this.database.prepare(`
      INSERT OR IGNORE INTO disclosures(fingerprint, published_at, observed_at, notified_at, data_json)
      VALUES (@fingerprint, @publishedAt, @observedAt, NULL, @dataJson)
    `);
    const metadata = this.database.prepare(`
      INSERT INTO metadata(key, value) VALUES ('initialized', @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    this.database.transaction(() => {
      const observedAt = new Date().toISOString();
      for (const record of records) {
        save.run({
          fingerprint: record.fingerprint,
          publishedAt: record.publishedAt,
          observedAt,
          dataJson: JSON.stringify(record)
        });
      }
      metadata.run({ value: observedAt });
    })();
  }

  has(fingerprint: string): boolean {
    return this.database.prepare("SELECT 1 FROM disclosures WHERE fingerprint = ?").get(fingerprint) !== undefined;
  }

  recentFingerprints(limit = 2_000): Set<string> {
    const rows = this.database.prepare("SELECT fingerprint FROM disclosures ORDER BY published_at DESC LIMIT ?")
      .all(limit) as Array<{ fingerprint: string }>;
    return new Set(rows.map((row) => row.fingerprint));
  }

  save(record: Disclosure, notified: boolean): void {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT OR IGNORE INTO disclosures(fingerprint, published_at, observed_at, notified_at, data_json)
      VALUES (@fingerprint, @publishedAt, @observedAt, @notifiedAt, @dataJson)
    `).run({
      fingerprint: record.fingerprint,
      publishedAt: record.publishedAt,
      observedAt: now,
      notifiedAt: notified ? now : null,
      dataJson: JSON.stringify(record)
    });
  }

  count(): number {
    return (this.database.prepare("SELECT COUNT(*) AS count FROM disclosures").get() as { count: number }).count;
  }

  close(): void {
    this.database.close();
  }
}
