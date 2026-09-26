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

  // Smart fallback target url: custom feed -> env var -> remote GitHub raw -> local version.json
  const defaultRemoteFeed =
    "https://raw.githubusercontent.com/alirezamozii/Testino2/main/public/version.json";
  const rawTargetUrl =
    feedUrl ||
    (typeof localStorage !== "undefined" ? localStorage.getItem("testino_custom_update_feed") : null) ||
    process.env.NEXT_PUBLIC_UPDATE_FEED_URL ||
    defaultRemoteFeed;

  const targetUrl = rawTargetUrl.startsWith("http")
    ? (rawTargetUrl.includes("?") ? `${rawTargetUrl}&_t=${Date.now()}` : `${rawTargetUrl}?_t=${Date.now()}`)
    : rawTargetUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion,
        currentBuild,
        latestVersion: currentVersion,
        latestBuild: currentBuild,
        changelog: [],
        downloadUrls: {},
        status: "error",
        message: `پاسخ ناموفق از سرور: ${response.status}`,
      };
    }

    const data: AppVersionInfo = await response.json();

    const versionDiff = compareVersions(data.version, currentVersion);
    const buildDiff = (data.build || 0) - currentBuild;

    // Has update if semantic version is higher, or same version but higher build
    const hasUpdate = versionDiff > 0 || (versionDiff === 0 && buildDiff > 0);

    return {
      hasUpdate,
      currentVersion,
      currentBuild,
      latestVersion: data.version,
      latestBuild: data.build,
      releaseDate: data.releaseDate,
      changelog: data.changelog || [],
      downloadUrls: data.downloadUrls || {},
      status: hasUpdate ? "update-available" : "up-to-date",
      message: hasUpdate ? "نسخه جدید در دسترس است" : "شما از آخرین نسخه استفاده می‌کنید",
    };
  } catch {
    // Offline or network timeout
    return {
      hasUpdate: false,
      currentVersion,
      currentBuild,
      latestVersion: currentVersion,
      latestBuild: currentBuild,
      changelog: [],
      downloadUrls: {},
      status: "offline",
      message: "عدم دسترسی به اینترنت جهت بررسی نسخه جدید",
    };
  }
}
