import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentTitleSchema,
  cleanFileName,
  detectImageType,
  precheckFile,
  uploadSchema,
} from "@/lib/attachments/input";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56];

describe("detectImageType", () => {
  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    expect(detectImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array(WEBP))).toBe("image/webp");
  });

  it("rejects anything else, whatever its name says", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(detectImageType(svg)).toBeNull();
    expect(detectImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    // A RIFF file that is not WebP (a WAV).
    expect(detectImageType(new TextEncoder().encode("RIFF\u0010\u0000\u0000\u0000WAVE"))).toBeNull();
    expect(detectImageType(new Uint8Array(PNG.slice(0, 4)))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("precheckFile", () => {
  it("accepts an image within the limit", () => {
    expect(precheckFile({ size: 1000, type: "image/png" })).toBeNull();
    expect(precheckFile({ size: ATTACHMENT_MAX_BYTES, type: "image/webp" })).toBeNull();
  });

  it("rejects empty, too large and non-image files", () => {
    expect(precheckFile({ size: 0, type: "image/png" })).toMatch(/vacío/);
    expect(precheckFile({ size: ATTACHMENT_MAX_BYTES + 1, type: "image/png" })).toMatch(/10 MB/);
    expect(precheckFile({ size: 10, type: "image/svg+xml" })).toMatch(/PNG, JPG o WebP/);
    expect(precheckFile({ size: 10, type: "" })).toMatch(/PNG, JPG o WebP/);
  });
});

describe("cleanFileName", () => {
  it("keeps only the base name, without control characters", () => {
    expect(cleanFileName("C:\\Users\\tecnico\\ipsec fase 1.png")).toBe("ipsec fase 1.png");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("a\u0000b\nc.png")).toBe("abc.png");
  });

  it("names a file that has no usable name", () => {
    expect(cleanFileName("")).toBe("captura");
    expect(cleanFileName("folder/")).toBe("captura");
  });

  it("bounds the length", () => {
    expect(cleanFileName(`${"a".repeat(500)}.png`)).toHaveLength(200);
  });
});

describe("upload and title input", () => {
  it("collapses spaces in a title and bounds it", () => {
    expect(attachmentTitleSchema.parse("  Fase   1 IPsec ")).toBe("Fase 1 IPsec");
    expect(attachmentTitleSchema.parse("")).toBe("");
    expect(attachmentTitleSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("takes a device id or none", () => {
    expect(uploadSchema.parse({ deviceId: null, title: "" })).toEqual({ deviceId: null, title: "" });
    const deviceId = "6f1c2a5e-8f0b-4c1a-9d2e-3b4a5c6d7e8f";
    expect(uploadSchema.parse({ deviceId, title: "x" }).deviceId).toBe(deviceId);
    expect(uploadSchema.safeParse({ deviceId: "../x", title: "" }).success).toBe(false);
  });
});
