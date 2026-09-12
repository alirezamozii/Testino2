export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { testinoDesktop?: unknown }).testinoDesktop);
}

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
}

export async function checkIsNative(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isDesktopApp()) return true;
  if (isCapacitorNative()) return true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export type AppPlatform = "desktop" | "android" | "web";

export async function detectAppPlatform(): Promise<AppPlatform> {
  if (typeof window === "undefined") return "web";
  if (isDesktopApp()) return "desktop";
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      return Capacitor.getPlatform() === "android" ? "android" : "web";
    }
  } catch {
    // fallback
  }
  return "web";
}
