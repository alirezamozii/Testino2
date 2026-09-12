/**
 * Client-side intelligent image optimizer for Testino.
 * 
 * Balances high-fidelity display of mathematical formulas, Persian typography,
 * and intricate diagrams with lightweight payload size for smooth Supabase sync.
 */

export interface ImageOptimizationOptions {
  /**
   * Maximum allowed width or height in pixels. Default: 1800 (retina sharp).
   */
  maxDimension?: number;
  /**
   * Compression quality (0 to 1). Default: 0.88 (preserves fine formula details without blurring).
   */
  quality?: number;
  /**
   * Preferred target MIME type. Default: "image/webp" with fallback to "image/jpeg".
   */
  preferredMime?: "image/webp" | "image/jpeg";
}

export interface OptimizedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
  mime: string;
}

/**
 * Calculates optimal target dimensions preserving aspect ratio.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = 1800
): { width: number; height: number; scaled: boolean } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: Math.max(1, srcWidth), height: Math.max(1, srcHeight), scaled: false };
  }

  const maxSide = Math.max(srcWidth, srcHeight);
  if (maxSide <= maxDimension) {
    return { width: srcWidth, height: srcHeight, scaled: false };
  }

  const ratio = maxDimension / maxSide;
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
    scaled: true,
  };
}

/**
 * Optimizes a user-uploaded image file:
 * - Downscales overly large smartphone/scanner resolutions (e.g., 4000x3000 -> 1800x1350)
 * - Encodes as high-quality WebP (fallback to JPEG)
 * - Preserves razor-sharp formula sub/superscripts and table lines
 * - Drastically reduces payload size (often 90-95% reduction from 5MB+ to ~150-250KB)
 */
export async function optimizeImageForUpload(
  file: File | Blob,
  options?: ImageOptimizationOptions
): Promise<OptimizedImageResult> {
  const maxDimension = options?.maxDimension ?? 1800;
  const quality = options?.quality ?? 0.88;
  const preferredMime = options?.preferredMime ?? "image/webp";
  const originalBytes = file.size;

  // If running in SSR or headless environment without canvas, fallback to raw read
  if (typeof window === "undefined" || typeof document === "undefined") {
    const rawDataUrl = await readBlobAsDataUrl(file);
    return {
      dataUrl: rawDataUrl,
      width: 800,
      height: 600,
      originalBytes,
      optimizedBytes: originalBytes,
      mime: file.type || "image/png",
    };
  }

  // Load the image into an HTMLImageElement
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("خواندن فایل تصویر با خطا مواجه شد."));
      el.src = objectUrl;
    });

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    const { width: targetWidth, height: targetHeight, scaled } = calculateTargetDimensions(
      naturalWidth,
      naturalHeight,
      maxDimension
    );

    // If image is already within bounds, is already small (<120KB) and is in WebP/JPEG, we can avoid recompression
    const isSmallEnough = originalBytes < 120 * 1024;
    const isAlreadyTargetMime = file.type === "image/webp" || file.type === "image/jpeg";
    if (!scaled && isSmallEnough && isAlreadyTargetMime) {
      const dataUrl = await readBlobAsDataUrl(file);
      return {
        dataUrl,
        width: naturalWidth,
        height: naturalHeight,
        originalBytes,
        optimizedBytes: originalBytes,
        mime: file.type,
      };
    }

    // Render to offscreen canvas with high quality smoothing
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });

    if (!ctx) {
      const rawDataUrl = await readBlobAsDataUrl(file);
      return {
        dataUrl: rawDataUrl,
        width: naturalWidth,
        height: naturalHeight,
        originalBytes,
        optimizedBytes: originalBytes,
        mime: file.type,
      };
    }

    // Use high quality image interpolation to prevent jagged formula text
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // If PNG with transparency was provided and we export as JPEG, fill background with white
    if (preferredMime === "image/jpeg" || file.type === "image/png") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Try exporting as WebP first
    let outputDataUrl = canvas.toDataURL(preferredMime, quality);
    let outputMime = preferredMime;

    // Check if browser actually produced WebP (unsupported browsers return "data:image/png;...")
    if (!outputDataUrl.startsWith(`data:${preferredMime}`)) {
      outputDataUrl = canvas.toDataURL("image/jpeg", quality);
      outputMime = "image/jpeg";
    }

    // Estimate byte size of Base64 Data URL
    const commaIdx = outputDataUrl.indexOf(",");
    const b64Length = commaIdx >= 0 ? outputDataUrl.length - commaIdx - 1 : outputDataUrl.length;
    const optimizedBytes = Math.round(b64Length * 0.75);

    return {
      dataUrl: outputDataUrl,
      width: targetWidth,
      height: targetHeight,
      originalBytes,
      optimizedBytes,
      mime: outputMime,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // Node.js / SSR fallback
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
