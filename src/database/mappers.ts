import type { ContentBlock, StoredQuestion } from "@/features/questions/domain/question-schema";
import type { Profile } from "./app-database";

export interface QuestionRow extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  external_key: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  group_id: string | null;
  group_position: number | null;
  content_json: string;
  explanation_json: string;
  correct_option_id: string | null;
  status: "draft" | "published";
  shuffle_safe: number;
  created_at: number;
  revision?: number;
  inactive_at: number | null;
}

export interface QuestionOptionRow extends Record<string, unknown> {
  id: string;
  question_id: string;
  external_key: string;
  position: number;
  content_json: string;
}

export interface ProfileRow extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  name: string;
  target_track: string | null;
  penalty_numerator: number;
  penalty_denominator: number;
  default_timer_mode?: "active" | "wall";
  created_at: number;
  revision?: number;
  inactive_at?: number | null;
}

export interface SubjectRow extends Record<string, unknown> {
  id: string;
  profile_id: string;
  name: string;
  coefficient: number;
  target_percentage: number;
  question_count?: number;
  score_group?: string | null;
  created_at: number;
}

export interface ChapterRow extends Record<string, unknown> {
  id: string;
  subject_id: string;
  name: string;
  normalized_name: string;
  position: number;
  created_at: number;
  updated_at: number;
  revision: number;
  inactive_at: number | null;
}

export interface TopicRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  name: string;
  normalized_name: string;
  position: number;
  target_seconds: number | null;
  created_at: number;
  updated_at: number;
  revision: number;
  inactive_at: number | null;
}

export interface OutboxRow extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  mutation_id: string;
  entity_type: string;
  entity_id: string;
  base_version: number;
  payload_json: string;
  state: "pending" | "sending" | "acked" | "failed";
  attempt_count?: number;
  next_attempt_at?: number | null;
  last_error_code?: string | null;
  created_at: number;
}

export function safeJsonParse<T>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

export function mapQuestionOption(row: QuestionOptionRow): StoredQuestion["options"][number] {
  return {
    id: row.id,
    key: row.external_key,
    content: safeJsonParse<ContentBlock[]>(row.content_json, []),
  };
}

export function mapQuestion(row: QuestionRow, optionRows: QuestionOptionRow[]): StoredQuestion {
  return {
    id: row.id,
    externalKey: row.external_key,
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    groupId: row.group_id,
    groupPosition: row.group_position,
    content: safeJsonParse<ContentBlock[]>(row.content_json, []),
    options: optionRows.map(mapQuestionOption),
    correctOptionId: row.correct_option_id,
    explanation: safeJsonParse<ContentBlock[]>(row.explanation_json, []),
    status: row.status,
    shuffleSafe: Boolean(row.shuffle_safe),
    createdAt: row.created_at,
  };
}

export function mapProfile(profileRow: ProfileRow, subjectRows: SubjectRow[]): Profile {
  return {
    id: profileRow.id,
    name: profileRow.name,
    targetTrack: profileRow.target_track,
    penaltyNumerator: profileRow.penalty_numerator,
    penaltyDenominator: profileRow.penalty_denominator,
    defaultTimerMode: profileRow.default_timer_mode || "active",
    subjects: subjectRows.map((s) => ({
      id: s.id,
      name: s.name,
      coefficient: Number(s.coefficient),
      targetPercentage: Number(s.target_percentage),
      questionCount: Number(s.question_count ?? 25),
      scoreGroup: s.score_group ?? null,
    })),
  };
}
