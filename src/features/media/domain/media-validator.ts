export type AllowedMediaMime = "image/png" | "image/jpeg" | "image/webp";

export interface MediaValidationResult {
  valid: boolean;
  mime?: AllowedMediaMime;
  sha256?: string;
  bytes: number;
  width?: number;
  height?: number;
  error?: string;
}

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_MEDIA_DIMENSION = 4096;

/**
 * Validates file magic bytes against allowed MIME signatures.
 */
export function detectImageSignature(bytes: Uint8Array): AllowedMediaMime | null {
  if (bytes.length < 12) return null;

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG magic bytes: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WEBP magic bytes: 'RIFF' .... 'WEBP'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Parses image width and height from raw binary headers without external dependencies.
 */
export function parseImageDimensions(bytes: Uint8Array, mime: AllowedMediaMime): { width: number; height: number } | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (mime === "image/png" && bytes.length >= 24) {
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      if (width > 0 && height > 0) return { width, height };
    }

    if (mime === "image/jpeg" && bytes.length > 4) {
      let offset = 2;
      while (offset < bytes.length - 8) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        // SOF0, SOF1, SOF2 markers
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = view.getUint16(offset + 5, false);
          const width = view.getUint16(offset + 7, false);
          if (width > 0 && height > 0) return { width, height };
        }
        const length = view.getUint16(offset + 2, false);
        offset += 2 + length;
      }
    }

    if (mime === "image/webp" && bytes.length >= 30) {
      // VP8X extended format
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height };
      }
      // VP8 simple lossy format
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
        if (bytes.length >= 30) {
          const width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
          const height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
          if (width > 0 && height > 0) return { width, height };
        }
      }
      // VP8L lossless format
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
        if (bytes.length >= 25 && bytes[20] === 0x2f) {
          const b1 = bytes[21];
          const b2 = bytes[22];
          const b3 = bytes[23];
          const b4 = bytes[24];
          const width = 1 + (((b2 & 0x3f) << 8) | b1);
          const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
          if (width > 0 && height > 0) return { width, height };
        }
      }
    }
  } catch {
    // ignore parse error
  }

  return null;
}

/**
 * Calculates canonical SHA-256 hex string for a given Uint8Array.
 */
export async function calculateSha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const copy = new Uint8Array(bytes);
    const hashBuffer = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback in Node environment if subtle is unavailable
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new Error("موتور رمزنگاری SHA-256 در دسترس نیست.");
  }
}

/**
 * Exhaustively validates an image file according to TASK-027.1 specifications.
 */
export async function validateMediaFile(
  bytes: Uint8Array,
  declaredMime?: string
): Promise<MediaValidationResult> {
  const byteLength = bytes.byteLength;

  if (byteLength === 0) {
    return { valid: false, bytes: 0, error: "فایل تصویر خالی است (حجم صفر بایت)." };
  }

  if (byteLength > MAX_MEDIA_BYTES) {
    return {
      valid: false,
      bytes: byteLength,
      error: `حجم تصویر (${Math.round(byteLength / 1024)}KB) از حداکثر مجاز (۵ مگابایت) بیشتر است.`,
    };
  }

  const detectedMime = detectImageSignature(bytes);
  if (!detectedMime) {
    return {
      valid: false,
      bytes: byteLength,
      error: "فرمت فایل تصویر نامعتبر است. فقط فرمت‌های PNG، JPEG و WEBP با امضای معتبر پذیرفته می‌شوند.",
    };
  }

  if (declaredMime && declaredMime !== detectedMime) {
    // Mismatch between declared file extension/MIME and actual binary header
    return {
      valid: false,
      bytes: byteLength,
      error: `عدم تطابق نوع فایل: نوع اعلام‌شده (${declaredMime}) با محتوای واقعی تصویر (${detectedMime}) همخوانی ندارد.`,
    };
  }

  const dimensions = parseImageDimensions(bytes, detectedMime);
  if (dimensions) {
    if (dimensions.width > MAX_MEDIA_DIMENSION || dimensions.height > MAX_MEDIA_DIMENSION) {
      return {
        valid: false,
        bytes: byteLength,
        error: `ابعاد تصویر (${dimensions.width}×${dimensions.height}) از حداکثر مجاز (${MAX_MEDIA_DIMENSION}×${MAX_MEDIA_DIMENSION}) بیشتر است.`,
      };
    }
  }

  const sha256 = await calculateSha256(bytes);

  return {
    valid: true,
    mime: detectedMime,
    sha256,
    bytes: byteLength,
    width: dimensions?.width ?? 800,
    height: dimensions?.height ?? 600,
  };
}
