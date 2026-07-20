import type { Logger } from "./logger.js";

export interface LocalTimeParts {
  date: string;
  weekday: string;
  hour: number;
  minute: number;
}

export function timeParts(date: Date, timezone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute"))
  };
}

export function isWithinMonitoringWindow(date: Date, timezone = "Asia/Jakarta"): boolean {
  const parts = timeParts(date, timezone);
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday)) return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 7 * 60 + 55 && minutes <= 16 * 60 + 15;
}

export class PollScheduler {
  private timer?: NodeJS.Timeout;
  private lastSlot?: string;

  constructor(
    private readonly timezone: string,
    private readonly intervalMinutes: number,
    private readonly operation: () => Promise<void>,
    private readonly logger: Logger,
    private readonly onActiveChange: (active: boolean) => void
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.onActiveChange(false);
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const active = isWithinMonitoringWindow(now, this.timezone);
    this.onActiveChange(active);
    if (!active) return;
    const local = timeParts(now, this.timezone);
    const slot = Math.floor((local.hour * 60 + local.minute) / this.intervalMinutes);
    const slotKey = `${local.date}:${slot}`;
    if (slotKey === this.lastSlot) return;
    this.lastSlot = slotKey;
    try {
      await this.operation();
    } catch (error) {
      this.logger.debug("Scheduled poll completed with an error already reported by monitor", { error: String(error) });
    }
  }
}
