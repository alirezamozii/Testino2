import type { ContentBlock } from "@/features/questions/domain/question-schema";

export interface OptionLike {
  id: string;
  key?: string;
  content: ContentBlock[];
}

const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];
const PERSIAN_DIGITS = ["۱", "۲", "۳", "۴"];

/**
 * Dynamically remaps option references in explanation text (e.g., "گزینه ۱", "Option 2", "1) ...")
 * so that they precisely match the currently displayed/shuffled option order on screen.
 */
export function remapExplanationForShuffle(
  blocks: ContentBlock[] | undefined | null,
  originalOptions: OptionLike[],
  currentOrderedOptions: OptionLike[]
): ContentBlock[] {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return [];
  }

  if (!originalOptions || !currentOrderedOptions || originalOptions.length < 2) {
    return blocks;
  }

  // Check if actually shuffled
  const isShuffled = originalOptions.some(
    (opt, idx) => opt.id !== currentOrderedOptions[idx]?.id
  );
  if (!isShuffled) {
    return blocks;
  }

  const PERSIAN_ORDINALS = [
    ["اول", "نخست", "اولین", "یکم"],
    ["دوم", "دومین"],
    ["سوم", "سومین"],
    ["چهارم", "چهارمین"],
  ];
  const PERSIAN_ORDINAL_NAMES = ["اول", "دوم", "سوم", "چهارم"];
  const ENGLISH_LETTERS = ["A", "B", "C", "D"];

  // Build mapping from original index (0, 1, 2, 3) to new display position
  interface MapTarget {
    origIndex: number;
    newIndex: number;
    newNum: number;
    newFaNum: string;
    newLetter: string;
    newEngLetter: string;
    newOrdinal: string;
    shortText: string;
  }

  const targets: MapTarget[] = [];
  for (let origIdx = 0; origIdx < originalOptions.length; origIdx++) {
    const orig = originalOptions[origIdx];
    const newIdx = currentOrderedOptions.findIndex((o) => o.id === orig.id);
    if (newIdx !== -1) {
      const optText = orig.content
        .map((c) => (c.type === "text" ? c.value : ""))
        .join(" ")
        .trim();
      const shortText = optText.length > 20 ? optText.slice(0, 18) + "..." : optText;
      targets.push({
        origIndex: origIdx,
        newIndex: newIdx,
        newNum: newIdx + 1,
        newFaNum: PERSIAN_DIGITS[newIdx] || String(newIdx + 1),
        newLetter: PERSIAN_LETTERS[newIdx] || String(newIdx + 1),
        newEngLetter: ENGLISH_LETTERS[newIdx] || String(newIdx + 1),
        newOrdinal: PERSIAN_ORDINAL_NAMES[newIdx] || String(newIdx + 1),
        shortText,
      });
    }
  }

  function remapString(text: string): string {
    let result = text;

    // STEP 1: Replace original option references with unique placeholders
    for (const t of targets) {
      const origNum = t.origIndex + 1;
      const origFaNum = PERSIAN_DIGITS[t.origIndex];
      const origLetter = PERSIAN_LETTERS[t.origIndex];
      const origEngLetter = ENGLISH_LETTERS[t.origIndex];
      const ordinals = PERSIAN_ORDINALS[t.origIndex] || [];

      // Pattern 1: Ordinals: گزینه اول / گزینهٔ اول / گزینه‌ی چهارم
      for (const ord of ordinals) {
        const ordRegex = new RegExp(
          `(گزینه(?:ٔ|ی|‌|‌ه|‌ی|‌اش)?\\s*)${ord}(?![0-9\\u06F0-\\u06F9a-zA-Z\\u0600-\\u06FF])`,
          "g"
        );
        result = result.replace(ordRegex, `@@OPT_ORD_${t.origIndex}@@`);
      }

      // Pattern 2: گزینه 1 / گزینه ۱ / گزینه الف / گزینهٔ ۱ / گزینه4 (with/without space, with ی/ٔ)
      const faOptRegex = new RegExp(
        `(گزینه(?:ٔ|ی|‌|‌ه|‌ی|‌اش|\\s+شماره|\\s+های|\\s+هایِ)?\\s*)(?:${origNum}|${origFaNum}|${origLetter})(?![0-9\\u06F0-\\u06F9])`,
        "g"
      );
      result = result.replace(faOptRegex, `@@OPT_FA_${t.origIndex}@@`);

      // Pattern 3: English "Choice 1", "choice A", "Choice (1)", "Choice (A)"
      const choiceRegex = new RegExp(
        `\\b(Choice|choice)\\s*\\(?\\s*(?:${origNum}|${origEngLetter})\\)?\\b`,
        "gi"
      );
      result = result.replace(choiceRegex, `@@OPT_CHOICE_${t.origIndex}@@`);

      // Pattern 4: English "Option 1" / "option 1" / "Option A" / "Option (1)"
      const engOptRegex = new RegExp(
        `\\b(Option|option)\\s*\\(?\\s*(?:${origNum}|${origEngLetter})\\)?\\b`,
        "g"
      );
      result = result.replace(engOptRegex, `@@OPT_ENG_${t.origIndex}@@`);

      // Pattern 5: Line-start / bullet: "1)" or "1-" or "1:" or "۱)" or "۱-" or "الف)" or "الف-"
      const bulletRegex = new RegExp(
        `(^|[\\n\\r]|;\\s*|\\.\\s*)(\\s*)(?:${origNum}|${origFaNum}|${origLetter})([\\)\\-\\:])(\\s*)`,
        "g"
      );
      result = result.replace(bulletRegex, `$1$2@@OPT_BULLET_${t.origIndex}@@$4`);
    }

    // Pattern 6: Compound Persian options e.g. "@@OPT_FA_0@@ و4" or "@@OPT_FA_0@@ و 4" -> catch second number
    for (const t of targets) {
      const origNum = t.origIndex + 1;
      const origFaNum = PERSIAN_DIGITS[t.origIndex];
      const compoundRegex = new RegExp(
        `(@@OPT_FA_\\d+@@\\s*(?:و|یا)\\s*)(?:${origNum}|${origFaNum})(?![0-9\\u06F0-\\u06F9])`,
        "g"
      );
      result = result.replace(compoundRegex, `$1@@OPT_FA_${t.origIndex}@@`);
    }

    // STEP 2: Replace placeholders with new display positions and badges
    for (const t of targets) {
      // For "گزینه [X]" -> "گزینه [newFaNum] (${t.newLetter})"
      result = result.replace(
        new RegExp(`@@OPT_FA_${t.origIndex}@@`, "g"),
        `گزینه ${t.newFaNum} (${t.newLetter})`
      );

      // For "گزینه [Ordinal]" -> "گزینه ${t.newOrdinal} (${t.newLetter})"
      result = result.replace(
        new RegExp(`@@OPT_ORD_${t.origIndex}@@`, "g"),
        `گزینه ${t.newOrdinal} (${t.newLetter})`
      );

      // For line bullets -> "[newFaNum]) [گزینه ${t.newLetter}]"
      result = result.replace(
        new RegExp(`@@OPT_BULLET_${t.origIndex}@@`, "g"),
        `${t.newFaNum}) [گزینه ${t.newLetter}]`
      );

      // For English "Option X" -> "Option ${t.newNum} (${t.newLetter})"
      result = result.replace(
        new RegExp(`@@OPT_ENG_${t.origIndex}@@`, "g"),
        `Option ${t.newNum} (${t.newLetter})`
      );

      // For English "Choice X" -> "Choice ${t.newNum} (${t.newEngLetter})"
      result = result.replace(
        new RegExp(`@@OPT_CHOICE_${t.origIndex}@@`, "g"),
        `Choice ${t.newNum} (${t.newEngLetter})`
      );
    }

    return result;
  }

  return blocks.map((block) => {
    if (block.type === "text") {
      return {
        ...block,
        value: remapString(block.value),
      };
    }
    return block;
  });
}
