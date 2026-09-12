import { describe, it, expect, vi, beforeEach } from "vitest";
import { APP_VERSION, compareVersions } from "@/config/version";
import {
  checkAppUpdate,
  dismissUpdateVersion,
  getDismissedUpdateVersion,
} from "@/features/update/domain/update-service";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
});

describe("Update Service & Version System", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("compareVersions()", () => {
    it("compares major, minor and patch versions correctly", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
      expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
      expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    });

    it("handles differing length version strings", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.1", "1.0.5")).toBe(1);
      expect(compareVersions("1.0.0.1", "1.0.0")).toBe(1);
    });
  });

  describe("dismissUpdateVersion() and getDismissedUpdateVersion()", () => {
    it("persists and retrieves the dismissed version", () => {
      expect(getDismissedUpdateVersion()).toBeNull();
      dismissUpdateVersion("1.5.0");
      expect(getDismissedUpdateVersion()).toBe("1.5.0");
    });
  });

  describe("checkAppUpdate()", () => {
    it("detects when a higher semantic version is available", async () => {
      const mockPayload = {
        version: "99.0.0",
        build: 1,
        releaseDate: "2026-09-12",
        changelog: ["تغییرات بزرگ"],
        downloadUrls: {
          windows: "https://example.com/win.zip",
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const result = await checkAppUpdate();

      expect(result.hasUpdate).toBe(true);
      expect(result.status).toBe("update-available");
      expect(result.latestVersion).toBe("99.0.0");
      expect(result.changelog).toEqual(["تغییرات بزرگ"]);
      expect(result.downloadUrls.windows).toBe("https://example.com/win.zip");
    });

    it("detects when the same version has a higher build number", async () => {
      const mockPayload = {
        version: APP_VERSION,
        build: 9999,
        releaseDate: "2026-09-12",
        changelog: ["اصلاح باگ"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const result = await checkAppUpdate();

      expect(result.hasUpdate).toBe(true);
      expect(result.status).toBe("update-available");
      expect(result.latestBuild).toBe(9999);
    });

    it("reports up-to-date when remote version is equal or lower", async () => {
      const mockPayload = {
        version: "0.0.1",
        build: 0,
        changelog: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const result = await checkAppUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.status).toBe("up-to-date");
    });

    it("handles network failure and offline gracefully without crashing", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

      const result = await checkAppUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.status).toBe("offline");
      expect(result.message).toContain("عدم دسترسی به اینترنت");
    });
  });
});
