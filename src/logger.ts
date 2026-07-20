export type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor(private readonly minimumLevel: LogLevel = "info") {}

  debug(message: string, details?: Record<string, unknown>): void { this.write("debug", message, details); }
  info(message: string, details?: Record<string, unknown>): void { this.write("info", message, details); }
  warn(message: string, details?: Record<string, unknown>): void { this.write("warn", message, details); }
  error(message: string, details?: Record<string, unknown>): void { this.write("error", message, details); }

  private write(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    if (priorities[level] < priorities[this.minimumLevel]) return;
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...details });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
