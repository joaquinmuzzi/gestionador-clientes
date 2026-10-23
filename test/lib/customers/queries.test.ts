import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "@/lib/customers/queries";

describe("escapeLikePattern", () => {
  it("escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLikePattern("Ferretería")).toBe("Ferretería");
  });
});
