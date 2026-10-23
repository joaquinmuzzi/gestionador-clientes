import { describe, expect, it } from "vitest";
import {
  TINTS,
  activitySummary,
  describeActivity,
  initials,
  timeAgo,
  tintFor,
} from "@/lib/dashboard/display";

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initials("Estudio Contable Ferreyra")).toBe("EF");
    expect(initials("ferretería")).toBe("F");
    expect(initials("Clínica · Del Parque")).toBe("CP");
    expect(initials("  ")).toBe("?");
  });
});

describe("tintFor", () => {
  it("always gives a customer the same tint", () => {
    const id = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";
    expect(tintFor(id)).toBe(tintFor(id));
    expect(TINTS).toContain(tintFor(id));
  });
});

describe("describeActivity", () => {
  it("says what happened in words", () => {
    expect(describeActivity("CREATE", "device")).toBe("Se agregó el dispositivo");
    expect(describeActivity("DELETE", "agenda-item")).toBe("Se borró la tarea");
    expect(describeActivity("REVEAL", "device-field")).toBe("Se vio un secreto");
    expect(describeActivity("UPDATE", "device-field")).toBe("Se cambió un campo de un dispositivo");
    expect(describeActivity("UPDATE", "something-new")).toBe("Se cambió un registro");
  });
});

describe("activitySummary", () => {
  it("never shows a field's name, which may be a secret field's", () => {
    expect(activitySummary("device-field", "NAS · Clave del panel")).toBe("");
    expect(activitySummary("device", "NAS")).toBe("NAS");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-23T15:00:00Z");
  it("rounds to minutes, hours and days", () => {
    expect(timeAgo(new Date("2026-10-23T14:59:50Z"), now)).toBe("recién");
    expect(timeAgo(new Date("2026-10-23T14:55:00Z"), now)).toBe("hace 5 min");
    expect(timeAgo(new Date("2026-10-23T12:00:00Z"), now)).toBe("hace 3 h");
    expect(timeAgo(new Date("2026-10-21T15:00:00Z"), now)).toBe("hace 2 d");
    expect(timeAgo(new Date("2026-08-01T12:00:00Z"), now)).toMatch(/^\d\d\/08\/2026$/);
  });
});
