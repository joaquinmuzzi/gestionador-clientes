import { describe, expect, it } from "vitest";
import { endUserSchema } from "@/lib/end-users/input";

const ID = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";

const valid = {
  id: ID,
  name: "  Ana   Gómez ",
  role: " Administración ",
  contact: "ana@example.com\r\nInterno 12",
  technicalLevel: "Bajo",
  canTouch: "  Reinicia el router.  ",
  notes: "",
  isMainContact: true,
};

describe("endUserSchema", () => {
  it("tidies the one-line texts and keeps the line breaks of the others as LF", () => {
    expect(endUserSchema.parse(valid)).toEqual({
      ...valid,
      name: "Ana Gómez",
      role: "Administración",
      contact: "ana@example.com\nInterno 12",
      canTouch: "Reinicia el router.",
    });
  });

  it("only needs a name", () => {
    expect(
      endUserSchema.safeParse({
        ...valid,
        role: "",
        contact: "",
        technicalLevel: "",
        canTouch: "",
        isMainContact: false,
      }).success,
    ).toBe(true);
    expect(endUserSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(endUserSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(endUserSchema.safeParse({ ...valid, role: "x".repeat(201) }).success).toBe(false);
    expect(endUserSchema.safeParse({ ...valid, notes: "x".repeat(20_001) }).success).toBe(false);
    expect(endUserSchema.safeParse({ ...valid, id: "1" }).success).toBe(false);
  });
});
