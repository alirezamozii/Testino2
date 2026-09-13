import { getSupabaseClient, getSupabaseConfig, getCurrentAuthUser } from "@/platform/auth/supabase-client";
import { withTimeout } from "@/lib/with-timeout";
import type {
  SyncTransport,
  PushMutationItem,
  PushMutationResult,
  PullChangesResult,
} from "./ports";

// Bounded network waits: a stalled socket (captive portal, dead WebView TCP)
// previously wedged syncNow forever with isSyncing=true → permanent spinner.
const RPC_TIMEOUT_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;
const MEDIA_UPLOAD_TIMEOUT_MS = 60_000;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;

export class SupabaseTransport implements SyncTransport {
  isConfigured(): boolean {
    return getSupabaseConfig().isConfigured;
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await withTimeout(getCurrentAuthUser(), AUTH_TIMEOUT_MS, "بررسی نشست کاربر");
    return Boolean(user);
  }

  async push(deviceId: string, mutations: PushMutationItem[]): Promise<PushMutationResult[]> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    }

    const { data, error } = await withTimeout(
      client.rpc("push_mutations", {
        p_device_id: deviceId,
        p_mutations: mutations,
      }),
      RPC_TIMEOUT_MS,
      "ارسال تغییرات"
    );

    if (error) {
      throw new Error(`خطای سرور در ارسال تغییرات: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: Record<string, unknown>) => ({
      mutationId: String(item.mutationId),
      status: item.status as PushMutationResult["status"],
      serverVersion: typeof item.serverVersion === "number" ? item.serverVersion : undefined,
      changeSeq: item.changeSeq ? String(item.changeSeq) : undefined,
      errorCode: item.errorCode ? String(item.errorCode) : undefined,
    }));
  }

  async pull(cursor: string, limit = 100): Promise<PullChangesResult> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    }

    const { data, error } = await withTimeout(
      client.rpc("pull_changes", {
        p_cursor: cursor || "0",
        p_limit: limit,
      }),
      RPC_TIMEOUT_MS,
      "دریافت تغییرات"
    );

    if (error) {
      throw new Error(`خطای سرور در دریافت تغییرات: ${error.message}`);
    }

    const result = data as { changes?: unknown[]; nextCursor?: string; hasMore?: boolean } | null;

    const changes = Array.isArray(result?.changes)
      ? result!.changes.map((raw) => {
          const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          return {
            changeSeq: String(c.changeSeq || "0"),
            entityType: String(c.entityType || ""),
            entityId: String(c.entityId || ""),
            serverVersion: Number(c.serverVersion || 1),
            isTombstone: Boolean(c.isTombstone),
            payload: (c.payload as Record<string, unknown>) || {},
            createdAt: String(c.createdAt || new Date().toISOString()),
          };
        })
      : [];

    return {
      changes,
      nextCursor: String(result?.nextCursor || cursor || "0"),
      hasMore: Boolean(result?.hasMore),
    };
  }

  async downloadSubjects(subjectNames: string[], cursor: string, limit = 100): Promise<PullChangesResult> {
    const client = getSupabaseClient();
    if (!client) throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    const cleaned = [...new Set(subjectNames.map((name) => name.trim()).filter(Boolean))];
    if (!cleaned.length) return { changes: [], nextCursor: cursor || "0", hasMore: false };

    const { data, error } = await withTimeout(
      client.rpc("download_subject_content", {
        p_subject_names: cleaned,
        p_cursor: cursor || "0",
        p_limit: Math.min(Math.max(limit, 1), 100),
      }),
      RPC_TIMEOUT_MS,
      "دانلود محتوای درس"
    );
    if (error) throw new Error(`خطای دانلود آفلاین درس‌ها: ${error.message}`);
    return this.mapPullResult(data, cursor);
  }

  async uploadMedia(input: { sha256: string; mime: string; bytes: Uint8Array }): Promise<string> {
    const client = getSupabaseClient();
    if (!client) throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    const user = await withTimeout(getCurrentAuthUser(), AUTH_TIMEOUT_MS, "بررسی نشست کاربر");
    if (!user) throw new Error("برای ارسال تصویر، ورود به حساب ابری لازم است.");
    const extension = input.mime === "image/jpeg" ? "jpg" : input.mime.split("/")[1] || "bin";
    const path = `${user.id}/${input.sha256.slice(0, 2)}/${input.sha256}.${extension}`;
    const { error } = await withTimeout(
      client.storage.from("question-media").upload(path, input.bytes, {
        contentType: input.mime,
        upsert: false,
        cacheControl: "31536000",
      }),
      MEDIA_UPLOAD_TIMEOUT_MS,
      "ارسال تصویر"
    );
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`خطای ارسال تصویر: ${error.message}`);
    }
    return path;
  }

  async downloadMedia(remotePath: string): Promise<Uint8Array> {
    const client = getSupabaseClient();
    if (!client) throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    const { data, error } = await withTimeout(
      client.storage.from("question-media").download(remotePath),
      MEDIA_DOWNLOAD_TIMEOUT_MS,
      "دریافت تصویر"
    );
    if (error || !data) throw new Error(`خطای دریافت تصویر: ${error?.message || "فایل پیدا نشد"}`);
    return new Uint8Array(await withTimeout(data.arrayBuffer(), MEDIA_DOWNLOAD_TIMEOUT_MS, "خواندن فایل تصویر"));
  }

  private mapPullResult(data: unknown, fallbackCursor: string): PullChangesResult {
    const result = data as { changes?: unknown[]; nextCursor?: string; hasMore?: boolean } | null;
    const changes = Array.isArray(result?.changes)
      ? result!.changes.map((raw) => {
          const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          return {
            changeSeq: String(c.changeSeq || "0"),
            entityType: String(c.entityType || ""),
            entityId: String(c.entityId || ""),
            serverVersion: Number(c.serverVersion || 1),
            isTombstone: Boolean(c.isTombstone),
            payload: (c.payload as Record<string, unknown>) || {},
            createdAt: String(c.createdAt || new Date().toISOString()),
          };
        })
      : [];
    return {
      changes,
      nextCursor: String(result?.nextCursor || fallbackCursor || "0"),
      hasMore: Boolean(result?.hasMore),
    };
  }

  async claimLocalOwner(localOwnerId: string, displayName: string): Promise<{
    ownerId: string;
    displayName: string;
    kind: "local" | "account";
    isNew: boolean;
  }> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("سرویس Supabase هنوز تنظیم نشده است.");
    }

    const { data, error } = await withTimeout(
      client.rpc("claim_local_owner", {
        p_local_owner_id: localOwnerId,
        p_display_name: displayName,
      }),
      RPC_TIMEOUT_MS,
      "اتصال حساب محلی"
    );

    if (error) {
      throw new Error(`خطای سرور در احراز مالک ابری: ${error.message}`);
    }

    const res = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return {
      ownerId: String(res.ownerId || localOwnerId),
      displayName: String(res.displayName || displayName),
      kind: (res.kind as "local" | "account") || "account",
      isNew: Boolean(res.isNew),
    };
  }
}
