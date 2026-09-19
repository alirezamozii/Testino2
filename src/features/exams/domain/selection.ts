import { seededShuffle } from "./shuffle";

export type SelectionMode = "random" | "new" | "wrong" | "due";

export interface QuestionCandidate {
  id: string;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  groupId: string | null;
  groupPosition?: number | null;
  isGroupIncomplete?: boolean;
  hasMissingRequiredMedia?: boolean;
  status: "draft" | "published";
  hasAttempts: boolean;
  lastResult?: "correct" | "wrong" | "unanswered" | null;
  dueAt?: number | null;
}

export interface SelectionOptions {
  mode: SelectionMode;
  requestedCount: number | null; // null means open-ended / all
  subjectFilter?: string | null;
  subjectFilters?: string[];
  chapterFilters?: string[];
  topicFilters?: string[];
  now?: number;
  seed?: string;
}

export interface SelectionOutcome {
  selectedIds: string[];
  actualCount: number;
  overshootCount: number;
  warnings: string[];
  seed: string;
  previewToken: string;
}

export function generatePreviewToken(selectedIds: string[], seed: string): string {
  let hash = 2166136261;
  const str = `${seed}:${selectedIds.join(",")}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ptk-${(hash >>> 0).toString(36)}-${selectedIds.length}`;
}

export function selectQuestions(
  candidates: QuestionCandidate[],
  options: SelectionOptions
): SelectionOutcome {
  const seed = options.seed || crypto.randomUUID();
  const now = options.now || Date.now();
  const warnings: string[] = [];

  // 1. Only published candidates not in incomplete groups and with ready media are eligible
  if (candidates.some((c) => c.hasMissingRequiredMedia)) {
    warnings.push("برخی سؤالات به دلیل عدم وجود تصویر ضروری از آزمون کنار گذاشته شدند.");
  }
  let pool = candidates.filter(
    (c) => c.status === "published" && !c.isGroupIncomplete && !c.hasMissingRequiredMedia
  );

  // 2. Filter by subjects if specified
  if (options.subjectFilters && options.subjectFilters.length > 0) {
    const sSet = new Set(options.subjectFilters);
    pool = pool.filter((c) => sSet.has(c.subject));
  } else if (options.subjectFilter && options.subjectFilter !== "all") {
    pool = pool.filter((c) => c.subject === options.subjectFilter);
  }

  // 2.1 Filter by chapters if specified
  if (options.chapterFilters && options.chapterFilters.length > 0) {
    const cSet = new Set(options.chapterFilters);
    pool = pool.filter((c) => (c.chapter ? cSet.has(c.chapter) : cSet.has("عمومی / بدون فصل")));
  }

  // 2.2 Filter by topics if specified
  if (options.topicFilters && options.topicFilters.length > 0) {
    const tSet = new Set(options.topicFilters);
    pool = pool.filter((c) => c.topic && tSet.has(c.topic));
  }

  // 3. Filter by mode
  if (options.mode === "new") {
    pool = pool.filter((c) => !c.hasAttempts);
  } else if (options.mode === "wrong") {
    pool = pool.filter((c) => c.lastResult === "wrong");
  } else if (options.mode === "due") {
    pool = pool.filter((c) => typeof c.dueAt === "number" && c.dueAt <= now);
  }

  if (pool.length === 0) {
    return {
      selectedIds: [],
      actualCount: 0,
      overshootCount: 0,
      warnings: ["هیچ سؤالی با شرایط و فیلترهای انتخابی در بانک یافت نشد."],
      seed,
      previewToken: generatePreviewToken([], seed),
    };
  }

  // 4. Group together questions belonging to the same group
  // Group units preserve group integrity (cannot break a Reading/Cloze group)
  const standalone: QuestionCandidate[][] = [];
  const groupMap = new Map<string, QuestionCandidate[]>();
  const seenPoolIds = new Set<string>();

  for (const item of pool) {
    if (seenPoolIds.has(item.id)) continue;
    seenPoolIds.add(item.id);

    if (item.groupId) {
      const existing = groupMap.get(item.groupId) || [];
      existing.push(item);
      groupMap.set(item.groupId, existing);
    } else {
      standalone.push([item]);
    }
  }

  for (const list of groupMap.values()) {
    list.sort((a, b) => (a.groupPosition ?? 0) - (b.groupPosition ?? 0));
  }

  const units: QuestionCandidate[][] = [...standalone, ...Array.from(groupMap.values())];

  // 5. Seeded shuffle of units
  const shuffledUnits = seededShuffle(units, seed);

  // 6. Accumulate units up to requestedCount (strict no-repeat)
  const selectedQuestionIds: string[] = [];
  const selectedSet = new Set<string>();
  const target = options.requestedCount;

  for (const unit of shuffledUnits) {
    if (target !== null && selectedQuestionIds.length >= target) {
      break;
    }
    for (const q of unit) {
      if (!selectedSet.has(q.id)) {
        selectedSet.add(q.id);
        selectedQuestionIds.push(q.id);
      }
    }
  }

  const actualCount = selectedQuestionIds.length;
  const overshootCount = target !== null && actualCount > target ? actualCount - target : 0;

  if (target !== null && actualCount < target) {
    warnings.push(
      `تعداد سؤالات واجد شرایط بانک (${actualCount}) کمتر از تعداد درخواستی (${target}) است.`
    );
  } else if (overshootCount > 0) {
    warnings.push(
      `به دلیل حفظ یکپارچگی سؤالات گروهی (درک مطلب/کلوز)، تعداد سؤالات به ${actualCount} افزایش یافت (${overshootCount} سؤال بیشتر).`
    );
  }

  return {
    selectedIds: selectedQuestionIds,
    actualCount,
    overshootCount,
    warnings,
    seed,
    previewToken: generatePreviewToken(selectedQuestionIds, seed),
  };
}
