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
