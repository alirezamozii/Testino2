import { APP_VERSION, APP_BUILD, compareVersions, type AppVersionInfo } from "@/config/version";

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  currentBuild: number;
  latestVersion: string;
  latestBuild: number;
  releaseDate?: string;
  changelog: string[];
  downloadUrls: {
    windows?: string;
    android?: string;
    web?: string;
  };
  status: "up-to-date" | "update-available" | "offline" | "error";
  message?: string;
}

const DISMISSED_KEY = "testino_dismissed_update_version";

export function getDismissedUpdateVersion(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(DISMISSED_KEY);
}

export function dismissUpdateVersion(version: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, version);
}

export async function checkAppUpdate(feedUrl?: string): Promise<UpdateCheckResult> {
  const currentVersion = APP_VERSION;
  const currentBuild = APP_BUILD;

  // Build candidate URLs in order of network reliability & CDN reachability
  const candidateUrls: string[] = [];

  // 1. Explicit feedUrl if provided (highest priority)
  if (feedUrl) {
    candidateUrls.push(feedUrl);
  }

  // 2. Custom feed from localStorage or env var
  if (typeof localStorage !== "undefined") {
    const custom = localStorage.getItem("testino_custom_update_feed");
    if (custom && !candidateUrls.includes(custom)) {
      candidateUrls.push(custom);
    }
  }
  if (process.env.NEXT_PUBLIC_UPDATE_FEED_URL && !candidateUrls.includes(process.env.NEXT_PUBLIC_UPDATE_FEED_URL)) {
    candidateUrls.push(process.env.NEXT_PUBLIC_UPDATE_FEED_URL);
  }

  // 3. Fast jsDelivr CDN mirror (never blocked in Iran, sub-second latency)
  candidateUrls.push("https://cdn.jsdelivr.net/gh/alirezamozii/Testino2@main/public/version.json");

  // 4. Same-origin local /version.json (works on self-hosted web, PWA, or local network without external internet)
  if (typeof window !== "undefined" && window.location?.origin && window.location.origin.startsWith("http")) {
    const originFeed = `${window.location.origin}/version.json`;
    if (!candidateUrls.includes(originFeed)) {
      candidateUrls.push(originFeed);
    }
  }

  // 5. Official GitHub raw fallback (with VPN or direct access)
  const defaultRemoteFeed = "https://raw.githubusercontent.com/alirezamozii/Testino2/main/public/version.json";
  if (!candidateUrls.includes(defaultRemoteFeed)) {
    candidateUrls.push(defaultRemoteFeed);
  }

  let lastErrorStatus = "offline";
  let lastErrorMessage = "عدم دسترسی به اینترنت جهت بررسی نسخه جدید";
  let bestCandidateResult: UpdateCheckResult | null = null;

  for (const rawUrl of candidateUrls) {
    const targetUrl = rawUrl.startsWith("http")
      ? (rawUrl.includes("?") ? `${rawUrl}&_t=${Date.now()}` : `${rawUrl}?_t=${Date.now()}`)
      : rawUrl;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        lastErrorStatus = "error";
        lastErrorMessage = `پاسخ ناموفق از سرور: ${response.status}`;
        continue;
      }

      const data: AppVersionInfo = await response.json();
      if (!data || typeof data.version !== "string") {
        continue;
      }

      const versionDiff = compareVersions(data.version, currentVersion);
      const buildDiff = (data.build || 0) - currentBuild;
      const hasUpdate = versionDiff > 0 || (versionDiff === 0 && buildDiff > 0);

      const candidateResult: UpdateCheckResult = {
        hasUpdate,
        currentVersion,
        currentBuild,
        latestVersion: data.version,
        latestBuild: data.build,
        releaseDate: data.releaseDate,
        changelog: data.changelog || [],
        downloadUrls: data.downloadUrls || {},
        status: hasUpdate ? "update-available" : "up-to-date",
        message: hasUpdate
          ? "نسخه جدید در دسترس است"
          : `شما از آخرین نسخه استفاده می‌کنید (v${currentVersion} - بیلد ${currentBuild})`,
      };

      // If an update is detected, return immediately!
      if (hasUpdate) {
        return candidateResult;
      }

      // Otherwise record that this endpoint reached successfully
      if (!bestCandidateResult) {
        bestCandidateResult = candidateResult;
      }
    } catch {
      // Endpoint failed or timed out, seamlessly proceed to next candidate
      continue;
    }
  }

  if (bestCandidateResult) {
    return bestCandidateResult;
  }

  return {
    hasUpdate: false,
    currentVersion,
    currentBuild,
    latestVersion: currentVersion,
    latestBuild: currentBuild,
    changelog: [],
    downloadUrls: {},
    status: lastErrorStatus as "offline" | "error",
    message: lastErrorMessage,
  };
}
