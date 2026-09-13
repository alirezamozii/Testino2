export interface ScoringSubject {
  name: string;
  coefficient: number;
  targetPercentage?: number;
  questionCount?: number;
  scoreGroup?: string | null;
}

export interface ScoringGroup {
  key: string;
  label: string;
  coefficient: number;
  questionCount: number;
  targetPercentage: number | null;
  coefficientMismatch: boolean;
  subjects: ScoringSubject[];
}

export function normalizeScoreGroup(value?: string | null): string | null {
  const cleaned = value
    ?.replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B\uFEFF\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function scoreGroupKey(subject: ScoringSubject, index: number): string {
  const group = normalizeScoreGroup(subject.scoreGroup);
  return group ? `group:${group.toLocaleLowerCase("fa-IR")}` : `subject:${index}:${subject.name}`;
}

/**
 * Builds exam-scoring groups while keeping study subjects separate.
 * Members of one group share one exam coefficient. Their targets are combined
 * by official question count before that coefficient is applied once.
 */
export function buildScoringGroups(subjects: ScoringSubject[]): ScoringGroup[] {
  const groups = new Map<string, ScoringGroup>();

  subjects.forEach((subject, index) => {
    if (!Number.isFinite(subject.coefficient) || subject.coefficient <= 0) return;

    const key = scoreGroupKey(subject, index);
    const label = normalizeScoreGroup(subject.scoreGroup) ?? subject.name;
    const questionCount = Math.max(1, Math.round(subject.questionCount ?? 25));
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        label,
        coefficient: subject.coefficient,
        questionCount,
        targetPercentage: subject.targetPercentage ?? null,
        coefficientMismatch: false,
        subjects: [subject],
      });
      return;
    }

    if (existing.coefficient !== subject.coefficient) existing.coefficientMismatch = true;

    const previousTargetPoints = existing.targetPercentage === null
      ? 0
      : existing.targetPercentage * existing.questionCount;
    const nextTargetPoints = subject.targetPercentage === undefined
      ? 0
      : subject.targetPercentage * questionCount;
    const hasTarget = existing.targetPercentage !== null || subject.targetPercentage !== undefined;

    existing.questionCount += questionCount;
    existing.targetPercentage = hasTarget
      ? (previousTargetPoints + nextTargetPoints) / existing.questionCount
      : null;
    existing.subjects.push(subject);
  });

  return [...groups.values()];
}

export function calculateWeightedTarget(subjects: ScoringSubject[]): {
  percentage: number | null;
  totalCoefficient: number;
  groups: ScoringGroup[];
} {
  const groups = buildScoringGroups(subjects).filter((group) => group.targetPercentage !== null);
  const totalCoefficient = groups.reduce((sum, group) => sum + group.coefficient, 0);
  const percentage = totalCoefficient > 0
    ? groups.reduce((sum, group) => sum + (group.targetPercentage ?? 0) * group.coefficient, 0) / totalCoefficient
    : null;

  return { percentage, totalCoefficient, groups };
}

/**
 * Calculates official Sanjesh percentages per correct and penalty per wrong test.
 */
export function getSanjeshMetrics(totalQuestions: number) {
  const q = Math.max(1, totalQuestions);
  const correctVal = 100 / q;
  const wrongVal = 100 / (3 * q);
  return {
    correctVal,
    wrongVal,
    correctFormatted: correctVal.toFixed(2),
    wrongFormatted: wrongVal.toFixed(2),
  };
}

export interface GroupedSubjectEntry<T> {
  type: "group";
  groupName: string;
  totalQuestions: number;
  coefficient: number;
  correctValFormatted: string;
  wrongValFormatted: string;
  combinedTarget: number;
  subjects: T[];
}

export interface StandaloneSubjectEntry<T> {
  type: "standalone";
  subject: T;
  totalQuestions: number;
  coefficient: number;
  correctValFormatted: string;
  wrongValFormatted: string;
}

export type SubjectDisplayEntry<T> = GroupedSubjectEntry<T> | StandaloneSubjectEntry<T>;

/**
 * Groups a list of profile subjects into visual groups and standalone subjects.
 */
export function partitionSubjectsForDisplay<
  T extends {
    id: string;
    name: string;
    coefficient: number;
    questionCount?: number;
    targetPercentage: number;
    scoreGroup?: string | null;
  }
>(subjects: T[]): SubjectDisplayEntry<T>[] {
  const groupMap = new Map<string, T[]>();
  const standaloneList: T[] = [];

  for (const s of subjects) {
    const norm = normalizeScoreGroup(s.scoreGroup);
    if (norm) {
      const key = norm.toLocaleLowerCase("fa-IR");
      const list = groupMap.get(key) ?? [];
      list.push(s);
      groupMap.set(key, list);
    } else {
      standaloneList.push(s);
    }
  }

  const result: SubjectDisplayEntry<T>[] = [];

  // Add groups
  for (const [, groupMembers] of groupMap.entries()) {
    if (groupMembers.length === 1 && !groupMembers[0].scoreGroup) {
      standaloneList.push(groupMembers[0]);
      continue;
    }

    const groupName = normalizeScoreGroup(groupMembers[0].scoreGroup) ?? groupMembers[0].name;
    const totalQuestions = groupMembers.reduce((sum, s) => sum + Math.max(1, s.questionCount ?? 25), 0);
    const coefficient = groupMembers[0].coefficient;
    const metrics = getSanjeshMetrics(totalQuestions);

    const totalTargetPoints = groupMembers.reduce(
      (sum, s) => sum + s.targetPercentage * Math.max(1, s.questionCount ?? 25),
      0
    );
    const combinedTarget = totalQuestions > 0 ? Math.round(totalTargetPoints / totalQuestions) : 0;

    result.push({
      type: "group",
      groupName,
      totalQuestions,
      coefficient,
      correctValFormatted: metrics.correctFormatted,
      wrongValFormatted: metrics.wrongFormatted,
      combinedTarget,
      subjects: groupMembers,
    });
  }

  // Add standalone subjects
  for (const s of standaloneList) {
    const qCount = Math.max(1, s.questionCount ?? 25);
    const metrics = getSanjeshMetrics(qCount);
    result.push({
      type: "standalone",
      subject: s,
      totalQuestions: qCount,
      coefficient: s.coefficient,
      correctValFormatted: metrics.correctFormatted,
      wrongValFormatted: metrics.wrongFormatted,
    });
  }

  return result;
}

