import { describe, expect, it } from "vitest";
import {
  createZipArchive,
  parseZipArchive,
  sanitizeZipPath,
  calculateCrc32,
  type ZipEntry,
} from "@/lib/zip";

describe("PKZIP Engine & Security Guards (TASK-028.2)", () => {
  it("creates and parses a ZIP archive roundtrip correctly", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const entries: ZipEntry[] = [
      { path: "manifest.json", data: encoder.encode(JSON.stringify({ version: "1.0" })) },
      { path: "media/photo1.png", data: new Uint8Array([1, 2, 3, 4, 5]) },
      { path: "media/photo2.jpg", data: new Uint8Array([10, 20, 30]) },
    ];

    const archive = createZipArchive(entries);
    expect(archive).toBeTruthy();
    expect(archive.length).toBeGreaterThan(100);

    const parsed = await parseZipArchive(archive);
    expect(parsed).toHaveLength(3);

    const manifestEntry = parsed.find((e) => e.path === "manifest.json");
    expect(manifestEntry).toBeTruthy();
    const manifestJson = JSON.parse(decoder.decode(manifestEntry!.data));
    expect(manifestJson.version).toBe("1.0");

    const photo1 = parsed.find((e) => e.path === "media/photo1.png");
    expect(photo1).toBeTruthy();
    expect(Array.from(photo1!.data)).toEqual([1, 2, 3, 4, 5]);
  });

  it("enforces path traversal prevention and rejects malicious paths", () => {
    // Relative traversal '../'
    expect(() => sanitizeZipPath("../secret.txt")).toThrow("Path Traversal");
    expect(() => sanitizeZipPath("foo/../../bar.txt")).toThrow("Path Traversal");

    // Drive letter
    expect(() => sanitizeZipPath("C:/Windows/System32/cmd.exe")).toThrow("مسیر مطلق");

    // Null bytes
    expect(() => sanitizeZipPath("valid.txt\0something")).toThrow("نویسهٔ غیرمجاز");
  });

  it("normalizes harmless leading slashes and backslashes safely", () => {
    expect(sanitizeZipPath("/media/pic.png")).toBe("media/pic.png");
    expect(sanitizeZipPath("media\\pic.png")).toBe("media/pic.png");
    expect(sanitizeZipPath("a/b/c.json")).toBe("a/b/c.json");
  });

  it("enforces entry count limits", async () => {
    const entries: ZipEntry[] = Array.from({ length: 15 }, (_, i) => ({
      path: `file_${i}.txt`,
      data: new Uint8Array([i]),
    }));

    const archive = createZipArchive(entries);

    // Limit set to 10 entries max
    await expect(parseZipArchive(archive, { maxEntries: 10 })).rejects.toThrow(
      "بیشتر است"
    );
  });

  it("enforces total uncompressed size limits", async () => {
    const largeData = new Uint8Array(2000);
    const entries: ZipEntry[] = [
      { path: "chunk1.bin", data: largeData },
      { path: "chunk2.bin", data: largeData },
    ];

    const archive = createZipArchive(entries);

    // Limit set to 3000 bytes max
    await expect(parseZipArchive(archive, { maxTotalBytes: 3000 })).rejects.toThrow(
      "فراتر رفت"
    );
  });

  it("verifies CRC32 calculation correctness", () => {
    const data = new TextEncoder().encode("123456789");
    // Standard check value for "123456789" is 0xcbf43926
    expect(calculateCrc32(data)).toBe(0xcbf43926);
  });
});
