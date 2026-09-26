import { extractQuestionSortKey, extractOriginalQuestionNumber, type SessionView } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";
import { extractQuestionPassageTarget, highlightPassageTargets } from "./passage-underliner";

export function computePassageQuestions(
  questions: SessionView["questions"],
  currentGroupId?: string
): Array<SessionView["questions"][number] & { qIdx: number }> {
  return questions
    .map((q, qIdx) => ({ ...q, qIdx }))
    .filter((q) => currentGroupId && q.snapshot.groupId === currentGroupId)
    .sort((a, b) => {
      const numA = extractQuestionSortKey(a.snapshot);
      const numB = extractQuestionSortKey(b.snapshot);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      if (a.snapshot.externalKey && b.snapshot.externalKey) {
        return a.snapshot.externalKey.localeCompare(b.snapshot.externalKey, undefined, { numeric: true });
      }
      return a.qIdx - b.qIdx;
    });
}

export function transformPassageContent(
  current: SessionView["questions"][number],
  isCloze: boolean,
  passageQuestions: Array<SessionView["questions"][number] & { qIdx: number }>
): ContentBlock[] | undefined {
  if (!current.snapshot.groupContent) {
    return undefined;
  }

  let blocks = current.snapshot.groupContent as ContentBlock[];

  if (isCloze && passageQuestions.length > 0) {
    const mappings = passageQuestions.map((pq, posIdx) => ({
      origNum:
        extractOriginalQuestionNumber(pq.snapshot) ||
        (pq.snapshot.source?.number ? String(pq.snapshot.source.number) : undefined),
      posNum: String(posIdx + 1),
      targetNum: pq.qIdx + 1,
    }));

    blocks = blocks.map((block) => {
      if (block.type !== "text" || typeof block.value !== "string") return block;
      let text = block.value;

      // 1. Explicit replacement if original source numbers are known
      for (const m of mappings) {
        if (m.origNum && m.origNum !== String(m.targetNum)) {
          text = text.replace(new RegExp(`(\\()\\s*${m.origNum}\\s*(\\))`, "g"), `(${m.targetNum})`);
          text = text.replace(new RegExp(`(\\[)\\s*${m.origNum}\\s*(\\])`, "g"), `[${m.targetNum}]`);
        }
      }

      // 2. Sequential replacement of all blank placeholders in the cloze passage
      let blankCounter = 0;
      text = text.replace(/([_\\.]{2,}\s*)?([(\[])\s*\d+\s*([)\]])/g, (match, prefix, open, close) => {
        if (blankCounter < passageQuestions.length) {
          const target = passageQuestions[blankCounter].qIdx + 1;
          blankCounter++;
          return `${prefix || ""}${open}${target}${close}`;
        }
        return match;
      });

      return { ...block, value: text };
    });
  }

  // Smart target word/phrase underlining & paragraph isolation for Reading Comprehension
  if (current.snapshot.content) {
    const targetInfo = extractQuestionPassageTarget(current.snapshot.content);
    blocks = highlightPassageTargets(blocks, targetInfo.targets, targetInfo.paragraphNumber);
  }

  return blocks;
}

export function transformQuestionContent(
  current: SessionView["questions"][number],
  targetNum: number,
  isCloze: boolean,
  passageQuestionsCount: number
): ContentBlock[] | undefined {
  if (!current.snapshot.content || !isCloze || passageQuestionsCount === 0) {
    return current.snapshot.content;
  }

  const origNum =
    extractOriginalQuestionNumber(current.snapshot) ||
    (current.snapshot.source?.number ? String(current.snapshot.source.number) : undefined);

  return current.snapshot.content.map((block) => {
    if (block.type !== "text" || typeof block.value !== "string") return block;
    let text = block.value;

    if (origNum && origNum !== String(targetNum)) {
      text = text.replace(new RegExp(`(\\()\\s*${origNum}\\s*(\\))`, "g"), `(${targetNum})`);
      text = text.replace(new RegExp(`(\\[)\\s*${origNum}\\s*(\\])`, "g"), `[${targetNum}]`);
    }

    // Also replace any unresolved blank marker if present
    text = text.replace(/([_\\.]{2,}\s*)?([(\[])\s*\d+\s*([)\]])/, (match, prefix, open, close) => {
      return `${prefix || ""}${open}${targetNum}${close}`;
    });

    return { ...block, value: text };
  });
}
