import { describe, expect, it } from "vitest";
import {
  agendaItemSchema,
  attentionReasons,
  formatDay,
  fromDay,
  incidentSchema,
  localDay,
  recordDeletionSchema,
  toDay,
  vulnerabilitySchema,
} from "@/lib/devices/records";

const ID_A = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";
const ID_B = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

describe("days", () => {
  it("stores a day as midnight UTC and reads the same day back", () => {
    const date = fromDay("2026-10-23");
    expect(date.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(toDay(date)).toBe("2026-10-23");
  });

  it("takes today from the local clock and writes days the Argentine way", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(formatDay("2026-01-05")).toBe("05/01/2026");
  });
});

describe("attentionReasons", () => {
  it("flags open incidents and overdue tasks, and nothing else", () => {
    const today = "2026-10-23";
    expect(attentionReasons({ openIncidents: 0, nextDueAt: null }, today)).toEqual([]);
    expect(attentionReasons({ openIncidents: 0, nextDueAt: today }, today)).toEqual([]);
    expect(attentionReasons({ openIncidents: 1, nextDueAt: "2026-10-22" }, today)).toEqual([
      "1 incidente abierto",
      "tareas vencidas",
    ]);
    expect(attentionReasons({ openIncidents: 3, nextDueAt: null }, today)).toEqual([
      "3 incidentes abiertos",
    ]);
  });

  it("does not call a task overdue before it knows the day", () => {
    expect(attentionReasons({ openIncidents: 0, nextDueAt: "2000-01-01" }, null)).toEqual([]);
  });
});

describe("incidentSchema", () => {
  const valid = {
    id: ID_A,
    deviceId: ID_B,
    occurredAt: "2026-10-20",
    title: "  Se cayó   la VPN ",
    description: "Sin túnel\r\ndesde las 9",
    resolution: "",
    closed: false,
  };

  it("collapses the title, stores LF line breaks and turns the day into a date", () => {
    expect(incidentSchema.parse(valid)).toEqual({
      ...valid,
      occurredAt: new Date("2026-10-20T00:00:00.000Z"),
      title: "Se cayó la VPN",
      description: "Sin túnel\ndesde las 9",
    });
  });

  it("rejects an empty title, a bad day, a huge text and bad ids", () => {
    expect(incidentSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, title: "x".repeat(201) }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, occurredAt: "" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, occurredAt: "2026-13-01" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, occurredAt: "20/10/2026" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, resolution: "x".repeat(20_001) }).success).toBe(
      false,
    );
    expect(incidentSchema.safeParse({ ...valid, deviceId: "x" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...valid, closed: "yes" }).success).toBe(false);
  });
});

describe("vulnerabilitySchema", () => {
  it("only takes the known severities", () => {
    const valid = {
      id: ID_A,
      deviceId: ID_B,
      title: "Firmware viejo",
      severity: "HIGH",
      description: "",
      closed: false,
    };
    expect(vulnerabilitySchema.parse(valid)).toEqual(valid);
    expect(vulnerabilitySchema.safeParse({ ...valid, severity: "URGENT" }).success).toBe(false);
  });
});

describe("agendaItemSchema", () => {
  it("needs a title and a day", () => {
    const valid = {
      id: ID_A,
      deviceId: ID_B,
      dueAt: "2026-11-01",
      title: "Probar el restore",
      notes: "",
      closed: true,
    };
    expect(agendaItemSchema.parse(valid).dueAt).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(agendaItemSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
    expect(agendaItemSchema.safeParse({ ...valid, dueAt: undefined }).success).toBe(false);
  });
});

describe("recordDeletionSchema", () => {
  it("only deletes the device's own kinds of record", () => {
    expect(recordDeletionSchema.safeParse({ kind: "incident", id: ID_A }).success).toBe(true);
    expect(recordDeletionSchema.safeParse({ kind: "device-field", id: ID_A }).success).toBe(false);
  });
});
