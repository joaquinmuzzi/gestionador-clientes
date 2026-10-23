import { describe, expect, it } from "vitest";
import {
  defaultDeviceName,
  deviceMovesSchema,
  firstIssue,
  mapDeletionSchema,
  newConnectionSchema,
  newDeviceSchema,
} from "@/lib/map/input";

const ID_A = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";
const ID_B = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

describe("newDeviceSchema", () => {
  it("collapses spaces in the name and keeps the position", () => {
    const input = { id: ID_A, type: "ROUTER", name: "  Router   WAN ", x: -10.5, y: 20 };
    expect(newDeviceSchema.parse(input)).toEqual({ ...input, name: "Router WAN" });
  });

  it("rejects an unknown type, an empty name, a bad id and absurd coordinates", () => {
    const valid = { id: ID_A, type: "NAS", name: "NAS", x: 0, y: 0 };
    expect(newDeviceSchema.safeParse(valid).success).toBe(true);
    expect(newDeviceSchema.safeParse({ ...valid, type: "TOASTER" }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, id: "1" }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, x: Number.NaN }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, y: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(newDeviceSchema.safeParse({ ...valid, x: 2_000_000 }).success).toBe(false);
  });

  it("explains an empty name in Spanish", () => {
    const result = newDeviceSchema.safeParse({ id: ID_A, type: "PC", name: " ", x: 0, y: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toBe("Poné un nombre al dispositivo.");
  });
});

describe("newConnectionSchema", () => {
  it("accepts an empty label and collapses spaces in a label", () => {
    const input = { id: ID_A, sourceId: ID_A, targetId: ID_B, label: " VLAN   20 " };
    expect(newConnectionSchema.parse(input).label).toBe("VLAN 20");
    expect(newConnectionSchema.safeParse({ ...input, label: "" }).success).toBe(true);
  });

  it("rejects a device connected to itself and a too long label", () => {
    const base = { id: ID_A, sourceId: ID_A, targetId: ID_B, label: "" };
    expect(newConnectionSchema.safeParse({ ...base, targetId: ID_A }).success).toBe(false);
    expect(newConnectionSchema.safeParse({ ...base, label: "x".repeat(61) }).success).toBe(false);
  });
});

describe("batches", () => {
  it("need at least one move and cap how many elements a request touches", () => {
    expect(deviceMovesSchema.safeParse([]).success).toBe(false);
    const moves = Array.from({ length: 501 }, () => ({ id: ID_A, x: 0, y: 0 }));
    expect(deviceMovesSchema.safeParse(moves).success).toBe(false);
    expect(mapDeletionSchema.safeParse({ deviceIds: [ID_A], connectionIds: [] }).success).toBe(
      true,
    );
    expect(
      mapDeletionSchema.safeParse({ deviceIds: ["not-an-id"], connectionIds: [] }).success,
    ).toBe(false);
  });
});

describe("defaultDeviceName", () => {
  it("uses the type's label, numbered when it is taken, ignoring case", () => {
    expect(defaultDeviceName("SERVER", [])).toBe("Servidor");
    expect(defaultDeviceName("SERVER", ["servidor"])).toBe("Servidor 2");
    expect(defaultDeviceName("SERVER", ["Servidor", "Servidor 2", "Servidor 4"])).toBe(
      "Servidor 3",
    );
    expect(defaultDeviceName("ACCESS_POINT", ["Router"])).toBe("Access point");
  });
});
