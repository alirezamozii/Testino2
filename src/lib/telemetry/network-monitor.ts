"use client";

export interface NetworkLogEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  endpoint: string;
  category: "auth" | "sync" | "media" | "update" | "community" | "static" | "other";
  status: number | "error";
  durationMs: number;
  reqBytes?: number;
  resBytes?: number;
  isDuplicate?: boolean;
  error?: string;
}

export interface NetworkSummary {
  totalRequests: number;
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  totalBytesTransferred: number;
  avgDurationMs: number;
  slowestRequest: NetworkLogEntry | null;
  requestsByCategory: Record<string, number>;
}

const MAX_LOGS = 150;
const logs: NetworkLogEntry[] = [];
const subscribers = new Set<(entry: NetworkLogEntry) => void>();
let isInterceptorInstalled = false;

function categorizeUrl(url: string): { category: NetworkLogEntry["category"]; endpoint: string } {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const path = parsed.pathname;

    if (path.includes("/auth/v1/")) return { category: "auth", endpoint: "Supabase Auth" };
    if (path.includes("/rest/v1/sync_")) return { category: "sync", endpoint: `Sync: ${path.split("/").pop()}` };
    if (path.includes("/storage/v1/")) return { category: "media", endpoint: "Supabase Media Storage" };
    if (path.includes("/github.com/") || path.includes("/raw.githubusercontent.com/") || path.includes("releases")) {
      return { category: "update", endpoint: "App Update Check" };
    }
    if (path.includes("/rest/v1/community_") || path.includes("shared_questions")) {
      return { category: "community", endpoint: "Community Catalog" };
    }
    if (path.endsWith(".wasm") || path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".png")) {
      return { category: "static", endpoint: `Asset: ${path.split("/").pop()}` };
    }
    return { category: "other", endpoint: path };
  } catch {
    return { category: "other", endpoint: url.slice(0, 30) };
  }
}

export function installNetworkMonitor() {
  if (typeof window === "undefined" || isInterceptorInstalled) return;
  isInterceptorInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const start = performance.now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method?.toUpperCase() || (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
    const { category, endpoint } = categorizeUrl(url);
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Estimate request size
    let reqBytes = 0;
    if (init?.body) {
      if (typeof init.body === "string") reqBytes = init.body.length;
      else if (init.body instanceof Blob) reqBytes = init.body.size;
      else if (init.body instanceof ArrayBuffer) reqBytes = init.body.byteLength;
    }

    // Duplicate detection: check if identical request was sent in last 3 seconds
    const now = Date.now();
    const isDuplicate = logs.some(
      (l) => l.url === url && l.method === method && now - l.timestamp < 3000 && l.status !== "error"
    );

    try {
      const response = await originalFetch.apply(this, [input, init]);
      const durationMs = Math.round(performance.now() - start);

      let resBytes = 0;
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        resBytes = parseInt(contentLength, 10) || 0;
      }

      const logEntry: NetworkLogEntry = {
        id,
        timestamp: now,
        method,
        url,
        endpoint,
        category,
        status: response.status,
        durationMs,
        reqBytes,
        resBytes,
        isDuplicate,
      };

      addLog(logEntry);
      return response;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const logEntry: NetworkLogEntry = {
        id,
        timestamp: now,
        method,
        url,
        endpoint,
        category,
        status: "error",
        durationMs,
        reqBytes,
        isDuplicate,
        error: err instanceof Error ? err.message : "Network error",
      };

      addLog(logEntry);
      throw err;
    }
  };
}

function addLog(entry: NetworkLogEntry) {
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.pop();
  }
  for (const sub of subscribers) {
    try {
      sub(entry);
    } catch {
      // ignore subscriber error
    }
  }
}

export function subscribeNetworkLogs(callback: (entry: NetworkLogEntry) => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getNetworkLogs(): NetworkLogEntry[] {
  return [...logs];
}

export function clearNetworkLogs() {
  logs.length = 0;
}

export function getNetworkSummary(): NetworkSummary {
  if (logs.length === 0) {
    return {
      totalRequests: 0,
      successCount: 0,
      failedCount: 0,
      duplicateCount: 0,
      totalBytesTransferred: 0,
      avgDurationMs: 0,
      slowestRequest: null,
      requestsByCategory: {},
    };
  }

  let totalDuration = 0;
  let successCount = 0;
  let failedCount = 0;
  let duplicateCount = 0;
  let totalBytes = 0;
  let slowest: NetworkLogEntry | null = null;
  const requestsByCategory: Record<string, number> = {};

  for (const log of logs) {
    totalDuration += log.durationMs;
    totalBytes += (log.reqBytes || 0) + (log.resBytes || 0);

    if (log.status === "error" || (typeof log.status === "number" && log.status >= 400)) {
      failedCount++;
    } else {
      successCount++;
    }

    if (log.isDuplicate) duplicateCount++;

    if (!slowest || log.durationMs > slowest.durationMs) {
      slowest = log;
    }

    requestsByCategory[log.category] = (requestsByCategory[log.category] || 0) + 1;
  }

  return {
    totalRequests: logs.length,
    successCount,
    failedCount,
    duplicateCount,
    totalBytesTransferred: totalBytes,
    avgDurationMs: Math.round(totalDuration / logs.length),
    slowestRequest: slowest,
    requestsByCategory,
  };
}
