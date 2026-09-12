import { z } from "zod";
import type { SessionView } from "@/database/app-database";
import { ALGORITHM_VERSION } from "@/features/review/domain/mastery";

export const sessionAnalysisExportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  exportType: z.literal("session-analysis"),
  generatedAt: z.string(),
  scope: z.enum(["full", "mistakes"]),
  session: z.object({
    alias: z.string(),
    state: z.string(),
    mode: z.string(),
    policy: z.object({
      penaltyNumerator: z.number(),
      penaltyDenominator: z.number(),
      policyVersion: z.number(),
    }),
    summary: z.object({
      correct: z.number(),
      wrong: z.number(),
      unanswered: z.number(),
      unvisited: z.number(),
      total: z.number(),
      percentage: z.number().nullable(),
    }),
  }),
  attempts: z.array(
    z.object({
      questionAlias: z.string(),
      subject: z.string(),
      result: z.enum(["correct", "wrong", "unanswered"]),
      selectedOptionKey: z.string().nullable(),
      correctOptionKey: z.string().nullable(),
      activeMs: z.number(),
      confidence: z.string().nullable(),
      changeCount: z.number(),
      wasVisited: z.boolean(),
    })
  ),
  questions: z.array(
    z.object({
      alias: z.string(),
      subject: z.string(),
      groupAlias: z.string().nullable(),
      content: z.array(z.any()),
      options: z.array(
        z.object({
          key: z.string(),
          content: z.array(z.any()),
        })
      ),
      correctOptionKey: z.string().nullable(),
      explanation: z.array(z.any()),
    })
  ),
  groups: z.array(
    z.object({
      alias: z.string(),
      kind: z.string(),
      content: z.array(z.any()),
    })
  ),
  reviewAlgorithmVersion: z.number(),
});

export type SessionAnalysisExport = z.infer<typeof sessionAnalysisExportSchema>;

export function buildSessionExport(
  session: SessionView,
  scope: "full" | "mistakes" = "full"
): SessionAnalysisExport {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let unvisited = 0;

  for (const q of session.questions) {
    if (!q.visited) unvisited += 1;
    if (q.selectedOptionId === null) {
      unanswered += 1;
    } else if (q.selectedOptionId === q.snapshot.correctOptionId) {
      correct += 1;
    } else {
      wrong += 1;
    }
  }

  const penaltyNum = session.config?.scorePolicy?.penaltyNumerator ?? 0;
  const penaltyDen = session.config?.scorePolicy?.penaltyDenominator ?? 3;
  const total = session.questions.length;
  const rawPct = total > 0 ? (correct / total) * 100 : null;
  const penalizedPct =
    total > 0 && penaltyNum > 0
      ? Math.max(0, ((correct - (wrong * penaltyNum) / penaltyDen) / total) * 100)
      : rawPct;

  // Filter according to contract:
  // scope=mistakes: wrong, unanswered visited, correct with doubtful/guess
  const eligibleQuestions = session.questions.filter((q) => {
    if (scope === "full") return true;
    const isCorrectSure = q.selectedOptionId === q.snapshot.correctOptionId && (q.confidence === "sure" || q.confidence === null);
    return !isCorrectSure;
  });

  const questionMap = new Map<string, string>(); // questionId -> alias (q1, q2...)
  const groupMap = new Map<string, string>(); // groupId -> alias (group-1, ...)
  const groupPayloads = new Map<string, { alias: string; kind: string; content: unknown[] }>();

  eligibleQuestions.forEach((q, idx) => {
    const qAlias = `q${idx + 1}`;
    questionMap.set(q.id, qAlias);

    if (q.snapshot.groupId && q.snapshot.groupContent && q.snapshot.groupContent.length > 0) {
      if (!groupMap.has(q.snapshot.groupId)) {
        const gAlias = `group-${groupMap.size + 1}`;
        groupMap.set(q.snapshot.groupId, gAlias);
        groupPayloads.set(q.snapshot.groupId, {
          alias: gAlias,
          kind: q.snapshot.groupKind || "reading",
          content: q.snapshot.groupContent,
        });
      }
    }
  });

  const optionLetters = ["a", "b", "c", "d"];

  const attempts = eligibleQuestions.map((q) => {
    const isAnswered = q.selectedOptionId !== null;
    const isCorrect = isAnswered && q.selectedOptionId === q.snapshot.correctOptionId;
    const result: "correct" | "wrong" | "unanswered" = !isAnswered ? "unanswered" : isCorrect ? "correct" : "wrong";

    // Map selected option ID to alias key (a, b, c, d)
    let selectedOptionKey: string | null = null;
    let correctOptionKey: string | null = null;

    q.optionOrder.forEach((optId, optIdx) => {
      const key = optionLetters[optIdx] || `opt_${optIdx + 1}`;
      if (optId === q.selectedOptionId) selectedOptionKey = key;
      if (optId === q.snapshot.correctOptionId) correctOptionKey = key;
    });

    return {
      questionAlias: questionMap.get(q.id)!,
      subject: q.snapshot.subject,
      result,
      selectedOptionKey,
      correctOptionKey,
      activeMs: q.activeMs,
      confidence: q.confidence,
      changeCount: 0,
      wasVisited: q.visited,
    };
  });

  const questions = eligibleQuestions.map((q) => {
    const groupAlias = q.snapshot.groupId ? groupMap.get(q.snapshot.groupId) ?? null : null;

    let correctOptionKey: string | null = null;
    const options = q.optionOrder.map((optId, optIdx) => {
      const key = optionLetters[optIdx] || `opt_${optIdx + 1}`;
      const opt = q.snapshot.options.find((o) => o.id === optId);
      if (optId === q.snapshot.correctOptionId) correctOptionKey = key;
      return {
        key,
        content: opt?.content || [],
      };
    });

    return {
      alias: questionMap.get(q.id)!,
      subject: q.snapshot.subject,
      groupAlias,
      content: q.snapshot.content,
      options,
      correctOptionKey,
      explanation: q.snapshot.explanation,
    };
  });

  return {
    schemaVersion: "1.0",
    exportType: "session-analysis",
    generatedAt: new Date().toISOString(),
    scope,
    session: {
      alias: "session-1",
      state: session.state,
      mode: session.config?.mode || "random",
      policy: {
        penaltyNumerator: penaltyNum,
        penaltyDenominator: penaltyDen,
        policyVersion: 1,
      },
      summary: {
        correct,
        wrong,
        unanswered,
        unvisited,
        total,
        percentage: penalizedPct !== null ? Math.round(penalizedPct * 10) / 10 : null,
      },
    },
    attempts,
    questions,
    groups: Array.from(groupPayloads.values()),
    reviewAlgorithmVersion: ALGORITHM_VERSION,
  };
}
