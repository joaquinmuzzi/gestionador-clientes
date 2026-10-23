import { describe, expect, it } from "vitest";
import {
  SEARCH_MAX_LENGTH,
  excerpt,
  highlight,
  matchingDeviceTypes,
  parseSearchTerm,
} from "@/lib/search/input";

describe("parseSearchTerm", () => {
  it("trims and collapses spaces", () => {
    expect(parseSearchTerm("  192.0.2.1  ")).toBe("192.0.2.1");
    expect(parseSearchTerm("Router   oficina")).toBe("Router oficina");
  });

  it("rejects a term too short or too long, and anything that is not text", () => {
    expect(parseSearchTerm("")).toBeNull();
    expect(parseSearchTerm(" a ")).toBeNull();
    expect(parseSearchTerm("x".repeat(SEARCH_MAX_LENGTH + 1))).toBeNull();
    expect(parseSearchTerm(["192.0.2.1"])).toBeNull();
    expect(parseSearchTerm(undefined)).toBeNull();
  });
});

describe("matchingDeviceTypes", () => {
  it("finds the types by their Spanish name, ignoring case", () => {
    expect(matchingDeviceTypes("servidor")).toEqual(["SERVER"]);
    expect(matchingDeviceTypes("IMPRES")).toEqual(["PRINTER"]);
    expect(matchingDeviceTypes("192.0.2")).toEqual([]);
  });
});

describe("excerpt", () => {
  it("shows the line of a multi-line value that holds the match", () => {
    const value = "192.0.2.10 impresora\n192.0.2.11 NAS\n192.0.2.12 cámara";
    expect(excerpt(value, "nas")).toBe("192.0.2.11 NAS");
  });

  it("shows the first line when the match is elsewhere (the field name)", () => {
    expect(excerpt("192.0.2.1\nsegunda línea", "LAN")).toBe("192.0.2.1");
  });

  it("cuts a long line around the match", () => {
    const line = "a".repeat(200) + " 192.0.2.77 " + "b".repeat(200);
    const cut = excerpt(line, "192.0.2.77");
    expect(cut).toContain("192.0.2.77");
    expect(cut.startsWith("…")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThan(150);
  });
});

describe("highlight", () => {
  it("marks every occurrence, ignoring case, and keeps the original text", () => {
    expect(highlight("Router WAN y wan2", "wan")).toEqual([
      { text: "Router ", match: false },
      { text: "WAN", match: true },
      { text: " y ", match: false },
      { text: "wan", match: true },
      { text: "2", match: false },
    ]);
  });

  it("returns the text unmarked when the term is not there", () => {
    expect(highlight("Switch piso 1", "router")).toEqual([{ text: "Switch piso 1", match: false }]);
  });

  it("does not mark special characters as patterns", () => {
    expect(highlight("192.0.2.1 y 192x0", "2.1")).toEqual([
      { text: "192.0.", match: false },
      { text: "2.1", match: true },
      { text: " y 192x0", match: false },
    ]);
  });
});
