/**
 * Lightweight, robust PKZIP reader and writer in pure TypeScript.
 * Zero external dependencies.
 * Implements strict security guards against Path Traversal, Zip Bombs, and Malicious Archives.
 */

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

export interface ZipLimits {
  maxEntries?: number;
  maxTotalBytes?: number;
  maxEntryBytes?: number;
  maxRatio?: number;
}

const DEFAULT_LIMITS: Required<ZipLimits> = {
  maxEntries: 500,
  maxTotalBytes: 50 * 1024 * 1024, // 50 MB
  maxEntryBytes: 15 * 1024 * 1024, // 15 MB per file
  maxRatio: 100, // 100:1 compression ratio limit
};

// Standard CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates a file path inside a ZIP archive to prevent Path Traversal attacks (TASK-028.2).
 */
export function sanitizeZipPath(rawPath: string): string {
  // Normalize backslashes to forward slashes
  let p = rawPath.replace(/\\/g, "/");

  // Reject null bytes
  if (p.includes("\0")) {
    throw new Error(`مسیر فایل حاوی نویسهٔ غیرمجاز است: ${rawPath}`);
  }

  // Reject drive letters (e.g. C:)
  if (/^[a-zA-Z]:/.test(p)) {
    throw new Error(`مسیر مطلق در بستهٔ فشرده مجاز نیست: ${rawPath}`);
  }

  // Strip leading slashes
  p = p.replace(/^\/+/, "");

  // Check path segments for '..'
  const segments = p.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`خطای امنیتی پیمایش مسیر (Path Traversal): ${rawPath}`);
    }
  }

  return p;
}

/**
 * Generates a ZIP archive buffer from an array of entries using STORE (uncompressed) method.
 * STORE is universally compatible with all OS tools and Android.
 */
export function createZipArchive(entries: ZipEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const entry of entries) {
    const cleanPath = sanitizeZipPath(entry.path);
    const pathBytes = encoder.encode(cleanPath);
    const data = entry.data;
    const crc = calculateCrc32(data);
    const size = data.byteLength;

    // --- Local File Header (30 bytes + path length) ---
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 enabled)
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // File last mod time
    lv.setUint16(12, 0, true); // File last mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, pathBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(pathBytes, 30);

    localHeaders.push(localHeader);
    localHeaders.push(data);

    // --- Central Directory Header (46 bytes + path length) ---
    const centralHeader = new Uint8Array(46 + pathBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0x0800, true); // Bit flag (UTF-8)
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, 0, true); // Time
    cv.setUint16(14, 0, true); // Date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, pathBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(pathBytes, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  // --- End of Central Directory Record (22 bytes) ---
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk with central directory
  ev.setUint16(8, entries.length, true); // Entries on this disk
  ev.setUint16(10, entries.length, true); // Total entries
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = offset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const part of [...localHeaders, ...centralHeaders, eocd]) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
}

/**
 * Decompresses raw DEFLATE data if supported by the environment.
 */
async function decompressDeflate(compressedBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(compressedBytes);
          controller.close();
        },
      });
      const decompressedStream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = decompressedStream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
        }
      }
      const res = new Uint8Array(total);
      let p = 0;
      for (const c of chunks) {
        res.set(c, p);
        p += c.length;
      }
      return res;
    } catch {
      // Fallback
    }
  }

  // Node fallback if needed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require("zlib");
    return new Uint8Array(zlib.inflateRawSync(compressedBytes));
  } catch {
    throw new Error("امکان استخراج فشرده‌سازی DEFLATE در این محیط وجود ندارد.");
  }
}

/**
 * Parses and extracts all entries from a ZIP archive with security limits (TASK-028.2).
 */
export async function parseZipArchive(
  archiveBytes: Uint8Array,
  customLimits?: ZipLimits
): Promise<ZipEntry[]> {
  const limits: Required<ZipLimits> = { ...DEFAULT_LIMITS, ...customLimits };

  if (archiveBytes.length < 22) {
    throw new Error("فایل فشرده نامعتبر یا بسیار کوتاه است.");
  }

  // 1. Find EOCD by scanning backwards from end of archive
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
  let eocdOffset = -1;
  const maxScan = Math.min(archiveBytes.length - 22, 65535 + 22);

  for (let i = archiveBytes.length - 22; i >= archiveBytes.length - maxScan; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("ساختار فایل ZIP نامعتبر است (رکورد پایان یافت نشد).");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > limits.maxEntries) {
    throw new Error(
      `تعداد فایل‌های درون بسته (${totalEntries}) از سقف مجاز (${limits.maxEntries}) بیشتر است.`
    );
  }

  if (centralDirOffset + centralDirSize > archiveBytes.length) {
    throw new Error("فهرست فایل‌های فشرده خارج از محدودهٔ فایل است (آرشیو مخدوش).");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let pos = centralDirOffset;
  let accumulatedBytes = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > archiveBytes.length) break;

    const sig = view.getUint32(pos, true);
    if (sig !== 0x02014b50) break; // Not a central directory header

    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    const nameBytes = archiveBytes.subarray(pos + 46, pos + 46 + nameLen);
    const rawPath = decoder.decode(nameBytes);
    pos += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries (paths ending in /)
    if (rawPath.endsWith("/")) continue;

    // Security check 1: Path Traversal
    const safePath = sanitizeZipPath(rawPath);

    // Security check 2: Zip-bomb single file limit
    if (uncompressedSize > limits.maxEntryBytes) {
      throw new Error(
        `فایل «${safePath}» با حجم (${Math.round(uncompressedSize / 1024)}KB) از سقف مجاز تک‌فایل بیشتر است.`
      );
    }

    // Security check 3: Zip-bomb compression ratio check
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxRatio) {
      throw new Error(`حالت فشرده‌سازی غیرطبیعی و خطرناک در فایل «${safePath}» (احتمال Zip-Bomb).`);
    }

    accumulatedBytes += uncompressedSize;
    if (accumulatedBytes > limits.maxTotalBytes) {
      throw new Error("مجموع حجم فایل‌های استخراج‌شده از سقف مجاز (۵۰ مگابایت) فراتر رفت.");
    }

    // Read local header
    if (localHeaderOffset + 30 > archiveBytes.length) {
      throw new Error(`آرشیو مخدوش: هدر محلی فایل «${safePath}» یافت نشد.`);
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > archiveBytes.length) {
      throw new Error(`آرشیو مخدوش: داده‌های فایل «${safePath}» ناقص است.`);
    }

    const rawData = archiveBytes.subarray(dataStart, dataEnd);
    let decompressed: Uint8Array;

    if (method === 0) {
      // STORE (no compression)
      decompressed = new Uint8Array(rawData);
    } else if (method === 8) {
      // DEFLATE
      decompressed = await decompressDeflate(rawData);
    } else {
      throw new Error(`روش فشرده‌سازی ناشناخته (${method}) برای فایل: ${safePath}`);
    }

    // Verify CRC-32
    const actualCrc = calculateCrc32(decompressed);
    if (actualCrc !== crc) {
      throw new Error(`عدم تطابق چکسام CRC32 در فایل «${safePath}». فایل احتمالاً آسیب دیده است.`);
    }

    entries.push({
      path: safePath,
      data: decompressed,
    });
  }

  return entries;
}
