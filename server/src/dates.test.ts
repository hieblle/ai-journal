import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, isoWeek, monthRange, monthsInQuarter, previousKey, quarterKey, quarterRange, weekKey, weekRange } from "./dates.js";
import { parseMemoryFiles } from "./reports/prompts.js";
import { duePeriod } from "./scheduler.js";
import { defaultConfig } from "./config.js";

test("iso week boundaries", () => {
  assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 });
  assert.equal(weekKey(new Date(2026, 10, 3)), "2026-W45");
  const { start, end } = weekRange("2026-W45");
  assert.equal(start.toDateString(), new Date(2026, 10, 2).toDateString());
  assert.equal(end.toDateString(), new Date(2026, 10, 8).toDateString());
  assert.equal(daysBetween(start, end).length, 7);
});

test("month and quarter keys", () => {
  assert.equal(quarterKey(new Date(2026, 10, 3)), "2026-Q4");
  assert.deepEqual(monthsInQuarter("2026-Q4"), ["2026-10", "2026-11", "2026-12"]);
  assert.equal(monthRange("2026-02").end.getDate(), 28);
  assert.equal(quarterRange("2026-Q1").end.getDate(), 31);
  assert.equal(previousKey("weekly", "2026-W01"), "2025-W52");
  assert.equal(previousKey("monthly", "2026-01"), "2025-12");
  assert.equal(previousKey("quarterly", "2026-Q1"), "2025-Q4");
});

test("due periods", () => {
  const cfg = defaultConfig();
  // Tuesday 2026-11-03 22:00: daily for today is due (21:00 passed), weekly for last week (Sunday 20:00 passed)
  const t1 = new Date(2026, 10, 3, 22, 0);
  assert.equal(duePeriod("daily", cfg, t1), "2026-11-03");
  assert.equal(duePeriod("weekly", cfg, t1), "2026-W44");
  assert.equal(duePeriod("monthly", cfg, t1), "2026-10");
  assert.equal(duePeriod("quarterly", cfg, t1), "2026-Q3");
  // Tuesday 20:00: daily for yesterday
  assert.equal(duePeriod("daily", cfg, new Date(2026, 10, 3, 20, 0)), "2026-11-02");
  // Sunday 2026-11-08 20:30: weekly for the week that just ended
  assert.equal(duePeriod("weekly", cfg, new Date(2026, 10, 8, 20, 30)), "2026-W45");
  // Sunday 19:00: still last week
  assert.equal(duePeriod("weekly", cfg, new Date(2026, 10, 8, 19, 0)), "2026-W44");
  // Monday trigger reports the previous week
  cfg.schedule.weekly.weekday = 1;
  cfg.schedule.weekly.hour = 9;
  assert.equal(duePeriod("weekly", cfg, new Date(2026, 10, 9, 9, 30)), "2026-W45");
  assert.equal(duePeriod("weekly", cfg, new Date(2026, 10, 9, 8, 30)), "2026-W44");
  // Dec 1st 08:00: monthly trigger at 09:00 not yet passed -> October
  assert.equal(duePeriod("monthly", cfg, new Date(2026, 11, 1, 8, 0)), "2026-10");
  assert.equal(duePeriod("monthly", cfg, new Date(2026, 11, 1, 9, 0)), "2026-11");
  // Jan 1st 2027 10:00 -> Q4 2026
  assert.equal(duePeriod("quarterly", cfg, new Date(2027, 0, 1, 10, 0)), "2026-Q4");
  cfg.schedule.daily.enabled = false;
  assert.equal(duePeriod("daily", cfg, t1), null);
});

test("memory file parsing", () => {
  const txt = `Hier ist das Update.\n=== DATEI: themen.md ===\n# Themen\n\n| a | b |\n=== ENDE ===\n\n=== DATEI: muster.md ===\ntext\n=== ENDE ===`;
  const files = parseMemoryFiles(txt);
  assert.equal(files.length, 2);
  assert.equal(files[0].name, "themen.md");
  assert.equal(files[0].content, "# Themen\n\n| a | b |\n");
  assert.equal(files[1].content, "text\n");
  assert.equal(parseMemoryFiles("KEINE ÄNDERUNG").length, 0);
  assert.equal(parseMemoryFiles("=== DATEI: ../x.md ===\nbad\n=== ENDE ===").length, 0);
});
