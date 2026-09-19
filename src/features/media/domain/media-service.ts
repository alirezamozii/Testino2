import type { DatabasePort, MediaMetadata, MediaPort } from "@/database/ports";
import { validateMediaFile, type AllowedMediaMime } from "./media-validator";

export interface IngestOptions {
  originalOptIn?: boolean;
  bankId?: string;
  declaredMime?: string;
}

/**
 * Storage adapter abstraction for raw image binary blobs.
 * Uses IndexedDB in browser, with in-memory map fallback for SSR/testing.
 */
class LocalBlobStore {
  private memoryFallback = new Map<string, Uint8Array>();
  private idbName = "testino_media_db";
  private storeName = "blobs";

  private async openIdb(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined" || !window.indexedDB) return null;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: IDBDatabase | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const req = window.indexedDB.open(this.idbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        // A blocked upgrade (another tab holds an old version) used to leave
        // this promise pending forever — every media get/put then hung, which
        // wedged syncNow (media upload path) with no error and no timeout.
        req.onblocked = () => finish(null);
        setTimeout(() => finish(null), 3000);
      } catch {
        finish(null);
      }
    });
  }

  async put(hash: string, data: Uint8Array): Promise<void> {
    this.memoryFallback.set(hash, data);
    const idb = await this.openIdb();
    if (!idb) return;

    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put(data, hash);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (this.memoryFallback.has(hash)) {
      return this.memoryFallback.get(hash)!;
    }
    const idb = await this.openIdb();
    if (!idb) return null;

    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(this.storeName, "readonly");
        const req = tx.objectStore(this.storeName).get(hash);
        req.onsuccess = () => {
          if (req.result) {
            const bytes = req.result instanceof Uint8Array ? req.result : new Uint8Array(req.result);
            this.memoryFallback.set(hash, bytes);
            resolve(bytes);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async delete(hash: string): Promise<void> {
    this.memoryFallback.delete(hash);
    const idb = await this.openIdb();
    if (!idb) return;

    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).delete(hash);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export class MediaService implements MediaPort {
  private db: DatabasePort;
  private blobStore: LocalBlobStore;

  constructor(db: DatabasePort, blobStore?: LocalBlobStore) {
    this.db = db;
    this.blobStore = blobStore || new LocalBlobStore();
  }

  /**
   * Validates and ingests an image file.
   * Enforces signature checks, dimension checks, size limits, and deduplication by SHA-256.
   */
  async ingest(
    file: File | Blob | Uint8Array,
    _role = "content",
    options?: IngestOptions
  ): Promise<MediaMetadata> {
    void _role;
    let bytes: Uint8Array;
    let declaredMime: string | undefined = options?.declaredMime;

    if (file instanceof Uint8Array) {
      bytes = file;
    } else if (typeof Blob !== "undefined" && file instanceof Blob) {
      declaredMime = declaredMime || file.type;
      const arrayBuffer = await file.arrayBuffer();
      bytes = new Uint8Array(arrayBuffer);
    } else {
      throw new Error("ورودی فایل تصویر نامعتبر است.");
    }

    const validation = await validateMediaFile(bytes, declaredMime);
    if (!validation.valid || !validation.sha256 || !validation.mime) {
      throw new Error(validation.error || "اعتبارسنجی تصویر ناموفق بود.");
    }

    const sha256 = validation.sha256;
    const mime: AllowedMediaMime = validation.mime;
    const width = validation.width || 800;
    const height = validation.height || 600;
    const byteLength = validation.bytes;

    // Check if media already exists in SQLite
    const existing = await this.db.query<{
      id: string;
      sha256: string;
      mime: string;
      bytes: number;
      width: number;
      height: number;
      availability: MediaMetadata["availability"];
    }>("SELECT id, sha256, mime, bytes, width, height, availability FROM media_files WHERE sha256=? LIMIT 1", [
      sha256,
    ]);

    if (existing.length > 0) {
      const row = existing[0];
      // Ensure binary exists in local blob store
      const stored = await this.blobStore.get(sha256);
      if (!stored) {
        await this.blobStore.put(sha256, bytes);
      }
      await this.db.execute(
        `UPDATE media_files SET
           local_path=COALESCE(local_path, ?),
           availability=CASE WHEN remote_path IS NOT NULL THEN 'both' ELSE 'local' END
         WHERE id=?`,
        [`media/${sha256}.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`, row.id]
      );
      return {
        id: row.id,
        sha256: row.sha256,
        mime: row.mime,
        bytes: row.bytes,
        width: row.width,
        height: row.height,
        availability: row.availability === "remote" || row.availability === "both" ? "both" : "local",
      };
    }

    // New media file
    const mediaId = crypto.randomUUID();
    const now = Date.now();
    const variant = options?.originalOptIn ? "original" : "optimized";

    // Store binary in local blob store
    await this.blobStore.put(sha256, bytes);

    // Save metadata in SQLite
    await this.db.execute(
      `INSERT INTO media_files(
        id, bank_id, sha256, mime, bytes, width, height, local_path, availability, variant, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mediaId,
        options?.bankId ?? null,
        sha256,
        mime,
        byteLength,
        width,
        height,
        `media/${sha256}.${mime.split("/")[1]}`,
        "local",
        variant,
        now,
      ]
    );

    return {
      id: mediaId,
      sha256,
      mime,
      bytes: byteLength,
      width,
      height,
      availability: "local",
    };
  }

  /**
   * Retrieves raw image data by either mediaId or sha256 hash.
   */
  async get(mediaIdOrHash: string): Promise<Uint8Array | null> {
    // 1. Try finding by sha256 directly
    let binary = await this.blobStore.get(mediaIdOrHash);
    if (binary) return binary;

    // 2. Query media_files by id
    const rows = await this.db.query<{ sha256: string }>(
      "SELECT sha256 FROM media_files WHERE id=? OR sha256=? LIMIT 1",
      [mediaIdOrHash, mediaIdOrHash]
    );
    if (rows.length > 0) {
      binary = await this.blobStore.get(rows[0].sha256);
      if (binary) return binary;
    }

    return null;
  }

  /**
   * Links a media item to a question or group.
   */
  async linkMedia(params: {
    mediaId: string;
    questionId?: string;
    groupId?: string;
    role?: "content" | "reference" | "option";
    required?: boolean;
  }): Promise<void> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO question_media(id, question_id, group_id, media_id, role, required, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.questionId ?? null,
        params.groupId ?? null,
        params.mediaId,
        params.role || "content",
        params.required !== false ? 1 : 0,
        now,
      ]
    );
  }

  /**
   * Removes unreferenced orphaned media files (TASK-027.3).
   */
  async removeUnreferenced(): Promise<number> {
    // Media files that have NO records in question_media
    const orphans = await this.db.query<{ id: string; sha256: string }>(
      `SELECT m.id, m.sha256
       FROM media_files m
       LEFT JOIN question_media qm ON m.id = qm.media_id
       WHERE qm.id IS NULL`
    );

    if (orphans.length === 0) return 0;

    for (const orphan of orphans) {
      await this.blobStore.delete(orphan.sha256);
      await this.db.execute("DELETE FROM media_files WHERE id=?", [orphan.id]);
    }

    return orphans.length;
  }

  /**
   * Exports metadata manifest of all available media.
   */
  async exportManifest(): Promise<MediaMetadata[]> {
    const rows = await this.db.query<{
      id: string;
      sha256: string;
      mime: string;
      bytes: number;
      width: number;
      height: number;
      availability: MediaMetadata["availability"];
    }>("SELECT id, sha256, mime, bytes, width, height, availability FROM media_files ORDER BY created_at ASC");

    return rows.map((r) => ({
      id: r.id,
      sha256: r.sha256,
      mime: r.mime,
      bytes: r.bytes,
      width: r.width,
      height: r.height,
      availability: r.availability,
    }));
  }

  /**
   * Checks if required media for a list of question IDs is ready.
   * If any required media is missing, returns false to prevent exam start (TASK-027.4).
   */
  async checkMediaReadiness(questionIds: string[]): Promise<{ ready: boolean; missingCount: number }> {
    if (questionIds.length === 0) return { ready: true, missingCount: 0 };

    const placeholders = questionIds.map(() => "?").join(",");
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM question_media qm
       JOIN media_files mf ON qm.media_id = mf.id
       WHERE qm.question_id IN (${placeholders})
         AND qm.required = 1
         AND mf.availability = 'missing'`,
      questionIds
    );

    const missingCount = rows[0]?.count ? Number(rows[0].count) : 0;
    return {
      ready: missingCount === 0,
      missingCount,
    };
  }
}
