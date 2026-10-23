import { describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

describe("clientIp", () => {
  it("takes the address added by the closest proxy", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" });
    expect(clientIp(headers)).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "192.0.2.10" }))).toBe("192.0.2.10");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
