import { parseZipArchive } from "@/lib/zip";
import type { MediaService } from "./media-service";
import { parseImportJson, type ParsedImport } from "@/features/questions/domain/importer";
import type { AppDatabase } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

export interface PackageImportReport {
  totalQuestions: number;
  added: number;
  importedQuestions: number;
  drafts: number;
  duplicates: number;
  failed: number;
  failedQuestions: number;
  mediaImported: number;
  mediaFailed: number;
  issues: Array<{ rowIndex: number; path: string; message: string }>;
}

/**
 * Traverses blocks in question content/options and replaces mediaKey with mediaId.
 * Returns array of referenced mediaKeys.
 */
function extractAndReplaceMediaKeys(
  blocks: ContentBlock[],
  mediaKeyToIdMap: Map<string, string>,
  missingKeys: Set<string>
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "image") {
      // In import envelopes, image block may have mediaKey
      const b = block as unknown as { type: "image"; mediaKey?: string; mediaId?: string; alt: string };
      if (b.mediaKey) {
        const resolvedId = mediaKeyToIdMap.get(b.mediaKey);
        if (!resolvedId) {
          missingKeys.add(b.mediaKey);
        }
        return {
          type: "image",
          mediaId: resolvedId || b.mediaKey,
          alt: b.alt || "",
        };
      }
    }
    return block;
  });
}

/**
 * Imports a ZIP package containing questions and media folder (TASK-028).
 */
export async function importMediaPackage(
  archiveBytes: Uint8Array,
  appDb: AppDatabase,
  mediaService: MediaService,
  options?: { signal?: AbortSignal }
): Promise<PackageImportReport> {
  const issues: Array<{ rowIndex: number; path: string; message: string }> = [];

  if (options?.signal?.aborted) {
    throw new Error("عملیات ورود بسته توسط کاربر لغو شد.");
  }

  // 1. Unpack ZIP
  const entries = await parseZipArchive(archiveBytes);

  // 2. Find JSON manifest/questions
  const jsonEntry = entries.find(
    (e) => e.path === "questions.json" || e.path === "manifest.json" || e.path.endsWith(".json")
  );

  if (!jsonEntry) {
    throw new Error("فایل questions.json در ریشهٔ بستهٔ فشرده یافت نشد.");
  }

  const decoder = new TextDecoder("utf-8");
  const jsonText = decoder.decode(jsonEntry.data);

  // 3. Pre-parse questions envelope
  let parsed: ParsedImport;
  try {
    parsed = parseImportJson(jsonText);
  } catch (err) {
    throw new Error(`ساختار JSON در بسته نامعتبر است: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Ingest media files from media/ folder
  const mediaEntries = entries.filter((e) => e.path.startsWith("media/") && !e.path.endsWith("/"));
  const mediaKeyToIdMap = new Map<string, string>();
  let mediaImported = 0;
  let mediaFailed = 0;

  for (const m of mediaEntries) {
    if (options?.signal?.aborted) {
      throw new Error("عملیات ورود بسته لغو شد.");
    }

    const filename = m.path.replace(/^media\//, "");
    const mediaKey = filename.replace(/\.[^.]+$/, ""); // key without extension

    try {
      const meta = await mediaService.ingest(m.data, "content");
      mediaKeyToIdMap.set(mediaKey, meta.id);
      mediaKeyToIdMap.set(filename, meta.id); // also match full filename
      mediaImported++;
    } catch (err) {
      mediaFailed++;
      issues.push({
        rowIndex: 0,
        path: m.path,
        message: `خطا در پردازش تصویر: ${err instanceof Error ? err.message : "فرمت نامعتبر"}`,
      });
    }
  }

  // 5. Match media references in questions and isolate partial errors (TASK-028.3)
  const validQuestionsToImport: typeof parsed.valid = [];
  const missingMediaQuestions = new Set<string>();

  for (const [idx, q] of parsed.valid.entries()) {
    const missingKeys = new Set<string>();

    // Process content blocks
    const newContent = extractAndReplaceMediaKeys(q.content, mediaKeyToIdMap, missingKeys);

    // Process explanation blocks
    const newExplanation = extractAndReplaceMediaKeys(q.explanation || [], mediaKeyToIdMap, missingKeys);

    // Process option blocks
    const newOptions = q.options.map((opt) => ({
      ...opt,
      content: extractAndReplaceMediaKeys(opt.content, mediaKeyToIdMap, missingKeys),
    }));

    if (missingKeys.size > 0) {
      missingMediaQuestions.add(q.key);
      issues.push({
        rowIndex: idx + 1,
        path: `questions[${q.key}].media`,
        message: `تصویر وابسته (${Array.from(missingKeys).join(", ")}) در پوشهٔ media یافت نشد یا معتبر نیست.`,
      });
      // Dependent question is excluded from valid batch to prevent broken render
      continue;
    }

    validQuestionsToImport.push({
      ...q,
      content: newContent,
      explanation: newExplanation,
      options: newOptions,
    });
  }

  // 6. Commit valid questions to database
  parsed.valid = validQuestionsToImport;
  const dbReport = await appDb.importQuestions(parsed);

  const failed = parsed.envelope.questions.length - dbReport.added - dbReport.drafts - dbReport.duplicates;

  return {
    totalQuestions: parsed.envelope.questions.length,
    added: dbReport.added,
    importedQuestions: dbReport.added,
    drafts: dbReport.drafts,
    duplicates: dbReport.duplicates,
    failed,
    failedQuestions: failed,
    mediaImported,
    mediaFailed,
    issues: [...issues, ...dbReport.issues],
  };
}
