import { describe, expect, it } from "vitest";
import {
  FIELD_SUGGESTIONS,
  fieldOrderSchema,
  fieldUpdateSchema,
  fieldValueContext,
  newFieldSchema,
  remainingSuggestions,
  revealSchema,
} from "@/lib/devices/input";
import { DEVICE_TYPES, firstIssue } from "@/lib/map/input";

const ID_A = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";
const ID_B = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

describe("newFieldSchema", () => {
  it("collapses spaces in the name, keeps the value's spaces and stores LF line breaks", () => {
    const input = {
      id: ID_A,
      deviceId: ID_B,
      name: "  IP   LAN ",
      value: " interface ge0\r\n  ip 192.0.2.1 \r\n",
      isSecret: false,
    };
    expect(newFieldSchema.parse(input)).toEqual({
      ...input,
      name: "IP LAN",
      value: " interface ge0\n  ip 192.0.2.1 \n",
    });
  });

  it("rejects an empty name, a huge value and bad ids", () => {
    const valid = { id: ID_A, deviceId: ID_B, name: "IP", value: "", isSecret: true };
    expect(newFieldSchema.safeParse(valid).success).toBe(true);
    expect(newFieldSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(newFieldSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(newFieldSchema.safeParse({ ...valid, value: "x".repeat(20_001) }).success).toBe(false);
    expect(newFieldSchema.safeParse({ ...valid, id: "1" }).success).toBe(false);
    expect(newFieldSchema.safeParse({ ...valid, deviceId: "x" }).success).toBe(false);
    expect(newFieldSchema.safeParse({ ...valid, isSecret: "yes" }).success).toBe(false);
  });

  it("explains an empty name in Spanish", () => {
    const result = newFieldSchema.safeParse({
      id: ID_A,
      deviceId: ID_B,
      name: " ",
      value: "",
      isSecret: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toBe("Poné un nombre al campo.");
  });
});

describe("fieldUpdateSchema", () => {
  it("allows leaving the value out, which keeps the stored one", () => {
    expect(fieldUpdateSchema.parse({ id: ID_A, name: "Clave", isSecret: true })).toEqual({
      id: ID_A,
      name: "Clave",
      isSecret: true,
    });
  });
});

describe("fieldOrderSchema and revealSchema", () => {
  it("need at least one field and a known purpose", () => {
    expect(fieldOrderSchema.safeParse({ deviceId: ID_B, fieldIds: [ID_A] }).success).toBe(true);
    expect(fieldOrderSchema.safeParse({ deviceId: ID_B, fieldIds: [] }).success).toBe(false);
    expect(revealSchema.safeParse({ id: ID_A, purpose: "copy" }).success).toBe(true);
    expect(revealSchema.safeParse({ id: ID_A, purpose: "print" }).success).toBe(false);
  });
});

describe("fieldValueContext", () => {
  it("names the row and the column, as documented on DeviceField", () => {
    expect(fieldValueContext(ID_A)).toBe(`device-field:${ID_A}:value`);
  });
});

describe("remainingSuggestions", () => {
  it("has suggestions for every type, with no repeated names", () => {
    for (const type of DEVICE_TYPES) {
      const names = FIELD_SUGGESTIONS[type].map((suggestion) => suggestion.name.toLowerCase());
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("leaves out the names already used, ignoring case and spaces", () => {
    const names = remainingSuggestions("ACCESS_POINT", [" ssid ", "Notas"]).map((s) => s.name);
    expect(names).toEqual(["IP", "Clave Wi-Fi"]);
  });

  it("marks passwords as secret", () => {
    const password = FIELD_SUGGESTIONS.ROUTER.find((suggestion) => suggestion.name === "Contraseña");
    expect(password?.secret).toBe(true);
  });
});
