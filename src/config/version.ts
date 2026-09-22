export interface AppVersionInfo {
  version: string;
  build: number;
  releaseDate: string;
  changelog?: string[];
  downloadUrls?: {
    windows?: string;
    android?: string;
    web?: string;
  };
}

export const APP_VERSION = "2.0.0";
export const APP_BUILD = 69;
export const APP_RELEASE_DATE = "2026-09-22";

/**
 * Returns:
 *  1 if v1 > v2
 * -1 if v1 < v2
 *  0 if v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, "").trim();
  const clean2 = v2.replace(/^v/, "").trim();

  const parts1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}
