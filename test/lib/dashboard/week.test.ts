import { describe, expect, it } from "vitest";
import { addDays, weekDays } from "@/lib/dashboard/week";

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("weekDays", () => {
  it("runs from Monday to Sunday", () => {
    // 23 October 2026 is a Friday.
    expect(weekDays("2026-10-23")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(weekDays("2026-10-25")[0]).toBe("2026-10-19");
    expect(weekDays("2026-10-26")[0]).toBe("2026-10-26");
  });
});
