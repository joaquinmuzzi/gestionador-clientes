import { describe, expect, it } from "vitest";
import { confirmsDeletion, customerInputSchema, parseCustomerForm } from "@/lib/customers/input";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("customerInputSchema", () => {
  it("collapses spaces in the name and stores notes with LF line breaks", () => {
    const input = { name: "  Ferretería   Demo ", notes: "a\r\nb\r\n" };
    expect(customerInputSchema.parse(input)).toEqual({ name: "Ferretería Demo", notes: "a\nb" });
  });

  it("rejects an empty or too long name and too long notes", () => {
    expect(customerInputSchema.safeParse({ name: "   ", notes: "" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "x".repeat(121), notes: "" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "x", notes: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("parseCustomerForm", () => {
  it("returns a Spanish message per field and keeps what was typed", () => {
    const result = parseCustomerForm(form({ name: " ", notes: "Router en 192.0.2.1" }));
    expect(result).toEqual({
      success: false,
      state: {
        fieldErrors: { name: "Poné el nombre del cliente.", notes: undefined },
        values: { name: " ", notes: "Router en 192.0.2.1" },
      },
    });
  });

  it("treats missing fields as empty", () => {
    expect(parseCustomerForm(form({ name: "Demo" }))).toEqual({
      success: true,
      data: { name: "Demo", notes: "" },
    });
  });
});

describe("confirmsDeletion", () => {
  it("ignores case and extra spaces but needs the whole name", () => {
    expect(confirmsDeletion("Estudio Contable", "  estudio   CONTABLE ")).toBe(true);
    expect(confirmsDeletion("Estudio Contable", "Estudio")).toBe(false);
    expect(confirmsDeletion("Estudio Contable", "")).toBe(false);
  });
});
