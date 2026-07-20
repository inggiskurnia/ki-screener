import { describe, expect, it } from "vitest";
import { isWithinMonitoringWindow, timeParts } from "../src/schedule.js";

describe("Jakarta monitoring schedule", () => {
  it("converts time using Asia/Jakarta instead of host timezone", () => {
    expect(timeParts(new Date("2026-07-20T00:55:00Z"), "Asia/Jakarta")).toMatchObject({
      date: "2026-07-20", weekday: "Mon", hour: 7, minute: 55
    });
  });

  it("includes weekday boundaries", () => {
    expect(isWithinMonitoringWindow(new Date("2026-07-20T00:55:00Z"))).toBe(true);
    expect(isWithinMonitoringWindow(new Date("2026-07-20T09:15:00Z"))).toBe(true);
    expect(isWithinMonitoringWindow(new Date("2026-07-20T00:54:00Z"))).toBe(false);
    expect(isWithinMonitoringWindow(new Date("2026-07-20T09:16:00Z"))).toBe(false);
  });

  it("excludes weekends", () => {
    expect(isWithinMonitoringWindow(new Date("2026-07-19T03:00:00Z"))).toBe(false);
  });
});
