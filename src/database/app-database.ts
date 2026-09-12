import { SqliteWorkerClient } from "./adapters/web/worker-client";
import type { DatabasePort } from "./ports";
import type { SqlStatement } from "./protocol";
import { runMigrations } from "./migrate";
import type { ParsedImport } from "@/features/questions/domain/importer";
import type { ContentBlock, StoredQuestion } from "@/features/questions/domain/question-schema";
import { scheduleReview, type ReviewState } from "@/features/review/domain/scheduler";
import { seededShuffle } from "@/features/exams/domain/shuffle";
import { computeQuestionFingerprint } from "@/features/questions/domain/fingerprint";
import { simulateOverallConfidence } from "@/features/analytics/domain/confidence-simulation";
import { canonicalizeSubject, canonicalizeSubjectRecords, canonicalSubjectKey, isSameSubject, subjectNamesForMatching } from "@/features/questions/domain/subject-registry";
import { buildScoringGroups, normalizeScoreGroup } from "@/features/profiles/domain/score-groups";

function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Profile {
  id: string;
  name: string;
  targetTrack: string | null;
  penaltyNumerator?: number;
  penaltyDenominator?: number;
  defaultTimerMode?: "active" | "wall";
  subjects: Array<{ id: string; name: string; coefficient: number; targetPercentage: number; questionCount?: number; scoreGroup?: string | null }>;
}

export type QuestionPoolMode = "new" | "wrong" | "doubtful" | "guess" | "bookmarked" | "due" | "skipped" | "mastered" | "random";

export interface SessionConfig {
  profileId: string;
  mode?: QuestionPoolMode | "continuous";
  modes?: QuestionPoolMode[];
  subjectFilter?: string | null;
  subjectFilters?: string[] | null;
  chapterFilters?: string[] | null;
  topicFilters?: string[] | null;
  requestedCount?: number | null;
  isOpenEnded?: boolean;
  scorePolicy?: { penaltyNumerator: number; penaltyDenominator: number };
  feedbackMode?: "instant" | "deferred";
  instantFeedback?: boolean;
  durationMinutes?: number | null;
  negativeMarking?: boolean;
}

export interface CreateSessionOptions {
  profileId?: string;
  count?: number | null;
  mode?: QuestionPoolMode | "continuous";
  modes?: QuestionPoolMode[];
  subject?: string | null;
  subjects?: string[];
  chapters?: string[];
  topics?: string[];
  isOpenEnded?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  feedbackMode?: "instant" | "deferred";
  instantFeedback?: boolean;
  durationMinutes?: number | null;
  negativeMarking?: boolean;
}

export interface SessionListItem {
  id: string;
  state: "CREATED" | "RUNNING" | "PAUSED" | "FINISHED";
  currentOrdinal: number;
  total: number;
  answered: number;
  createdAt: number;
  config?: SessionConfig | null;
  isOpenEnded?: boolean;
}

export interface SessionQuestion {
  id: string;
  sessionId: string;
  ordinal: number;
  selectedOptionId: string | null;
  confidence: "sure" | "doubtful" | "guess" | null;
  visited: boolean;
  activeMs: number;
  snapshot: StoredQuestion;
  optionOrder: string[];
}

export interface SessionView {
  id: string;
  state: "CREATED" | "RUNNING" | "PAUSED" | "FINISHED";
  currentOrdinal: number;
  config?: SessionConfig | null;
  questions: SessionQuestion[];
}


type QuestionRow = Record<string, unknown> & {
  id: string;
  external_key: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  group_id?: string | null;
  group_position?: number | null;
  content_json: string;
  explanation_json: string;
  correct_option_id: string | null;
  status: "draft" | "published";
  shuffle_safe: number;
  created_at: number;
  source_kind?: "EXAM" | "AI" | "PERSONAL" | null;
  source_title?: string | null;
  source_year?: number | null;
  source_number?: string | null;
  report_count?: number;
};

function normalizeSearch(term: string): string {
  return term
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NO_CHAPTER_FILTER = "عمومی / بدون فصل";

function matchesChapterFilters(
  question: Pick<StoredQuestion, "subject" | "chapter">,
  filters: string[]
): boolean {
  const questionChapter = question.chapter || NO_CHAPTER_FILTER;
  return filters.some((filter) => {
    const [subject, chapter, ...rest] = filter.split("::");
    if (!chapter || rest.length > 0) return filter === questionChapter;
    return isSameSubject(subject, question.subject) && chapter === questionChapter;
  });
}

function matchesTopicFilters(
  question: Pick<StoredQuestion, "subject" | "chapter" | "topic">,
  filters: string[]
): boolean {
  if (!question.topic) return false;
  const questionChapter = question.chapter || NO_CHAPTER_FILTER;
  return filters.some((filter) => {
    const [subject, chapter, ...topicParts] = filter.split("::");
    if (!chapter || topicParts.length === 0) return filter === question.topic;
    return (
      isSameSubject(subject, question.subject) &&
      chapter === questionChapter &&
      topicParts.join("::") === question.topic
    );
  });
}

function mapQuestion(
  row: QuestionRow,
  options: Array<Record<string, unknown>>,
  groupMap?: Map<string, { kind: "reading" | "cloze" | "shared"; content: ContentBlock[] }>
): StoredQuestion {
  const grp = row.group_id && groupMap ? groupMap.get(row.group_id) : null;
  return {
    id: row.id,
    externalKey: row.external_key,
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    groupId: row.group_id ?? null,
    groupPosition: typeof row.group_position === "number" ? row.group_position : null,
    groupKind: grp?.kind ?? null,
    groupContent: grp?.content ?? null,
    content: JSON.parse(row.content_json),
    options: options.map((option) => ({
      id: String(option.id),
      key: String(option.external_key),
      content: JSON.parse(String(option.content_json)),
    })),
    correctOptionId: row.correct_option_id,
    explanation: JSON.parse(row.explanation_json),
    status: row.status,
    shuffleSafe: Boolean(row.shuffle_safe),
    source: row.source_kind ? {
      kind: row.source_kind,
      title: row.source_title || undefined,
      year: row.source_year ?? undefined,
      number: row.source_number || undefined,
    } : undefined,
    reportCount: Number(row.report_count ?? 0),
    createdAt: row.created_at,
  };
}

function groupQuestionsIntoUnits(questions: StoredQuestion[]): StoredQuestion[][] {
  const standalone: StoredQuestion[][] = [];
  const groupMap = new Map<string, StoredQuestion[]>();
  const seen = new Set<string>();

  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);

    if (q.groupId) {
      const existing = groupMap.get(q.groupId) || [];
      existing.push(q);
      groupMap.set(q.groupId, existing);
    } else {
      standalone.push([q]);
    }
  }

  for (const list of groupMap.values()) {
    list.sort((a, b) => (a.groupPosition ?? 0) - (b.groupPosition ?? 0));
  }

  return [...standalone, ...Array.from(groupMap.values())];
}

interface LifecycleClient {
  open?: (ownerKey?: string) => Promise<void>;
  close?: () => void;
}

export class AppDatabase {
  private client: DatabasePort;

  constructor(client?: DatabasePort) {
    this.client = client ?? new SqliteWorkerClient();
  }

  async open() {
    const lifecycle = this.client as unknown as LifecycleClient;
    if (typeof lifecycle.open === "function") {
      await lifecycle.open();
    }
    await runMigrations(this.client);
  }

  close() {
    const lifecycle = this.client as unknown as LifecycleClient;
    if (typeof lifecycle.close === "function") {
      lifecycle.close();
    }
  }

  getClient(): DatabasePort {
    return this.client;
  }

  async listProfiles(): Promise<Profile[]> {
    const profiles = await this.client.query<{ id: string; name: string; target_track: string | null; penalty_numerator: number; penalty_denominator: number; default_timer_mode: "active" | "wall" }>(
      "SELECT id,name,target_track,penalty_numerator,penalty_denominator,default_timer_mode FROM profiles ORDER BY created_at"
    );
    const subjects = await this.client.query<{
      id: string;
      profile_id: string;
      name: string;
      coefficient: number;
      target_percentage: number;
      question_count?: number;
      score_group?: string | null;
    }>("SELECT id,profile_id,name,coefficient,target_percentage,question_count,score_group FROM subjects ORDER BY created_at");
    return profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      targetTrack: profile.target_track,
      penaltyNumerator: Number(profile.penalty_numerator),
      penaltyDenominator: Number(profile.penalty_denominator),
      defaultTimerMode: profile.default_timer_mode,
      subjects: canonicalizeSubjectRecords(subjects
        .filter((subject) => subject.profile_id === profile.id)
        .map((subject) => ({
          id: subject.id,
          name: subject.name,
          coefficient: Number(subject.coefficient),
          targetPercentage: Number(subject.target_percentage),
          questionCount: Number(subject.question_count ?? 25),
          scoreGroup: subject.score_group ?? null,
        }))),
    }));
  }

  async createProfile(input: {
    name: string;
    targetTrack?: string;
    subjects: Array<{ name: string; coefficient: number; targetPercentage: number; questionCount?: number; scoreGroup?: string | null }>;
  }) {
    const subjectKeys = input.subjects.map((subject) => canonicalSubjectKey(subject.name));
    if (new Set(subjectKeys).size !== subjectKeys.length) {
      throw new Error("یک درس با نام‌های هم‌معنی بیش از یک‌بار وارد شده است.");
    }
    const invalidGroup = buildScoringGroups(input.subjects).find((group) => group.coefficientMismatch);
    if (invalidGroup) throw new Error(`ضریب اعضای گروه محاسباتی «${invalidGroup.label}» باید یکسان باشد.`);
    const profileId = crypto.randomUUID();
    const now = Date.now();
    await this.client.batch([
      {
        sql: "INSERT INTO profiles(id,name,target_track,penalty_numerator,penalty_denominator,created_at) VALUES(?,?,?,1,3,?)",
        bind: [profileId, input.name.trim(), input.targetTrack?.trim() || null, now],
      },
      ...input.subjects.map((subject) => ({
        sql: "INSERT INTO subjects(id,profile_id,name,coefficient,target_percentage,question_count,score_group,created_at) VALUES(?,?,?,?,?,?,?,?)",
        bind: [crypto.randomUUID(), profileId, canonicalizeSubject(subject.name), subject.coefficient, subject.targetPercentage, subject.questionCount ?? 25, subject.scoreGroup?.trim() || null, now],
      })),
    ]);
    return profileId;
  }

  async getCurrentOwner(): Promise<{ id: string; kind: "local" | "account"; displayName: string; authUserId: string | null } | null> {
    const rows = await this.client.query<{ id: string; kind: string; display_name: string; auth_user_id: string | null }>(
      "SELECT id, kind, display_name, auth_user_id FROM owners WHERE inactive_at IS NULL ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      kind: r.kind as "local" | "account",
      displayName: r.display_name,
      authUserId: r.auth_user_id,
    };
  }

  async saveOwner(displayName: string, kind: "local" | "account" = "local", authUserId?: string): Promise<{ id: string; displayName: string }> {
    const now = Date.now();
    const existing = await this.getCurrentOwner();
    const cleanName = displayName.trim() || "دانش‌آموز";
    if (existing) {
      await this.client.execute(
        "UPDATE owners SET display_name=?, kind=?, auth_user_id=?, updated_at=? WHERE id=?",
        [cleanName, kind, authUserId || (kind === "local" ? null : existing.authUserId), now, existing.id]
      );
      return { id: existing.id, displayName: cleanName };
    } else {
      const ownerId = crypto.randomUUID();
      const deviceNamespace = `local-${crypto.randomUUID().slice(0, 8)}`;
      await this.client.execute(
        "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
        [ownerId, kind, authUserId || null, cleanName, deviceNamespace, now, now]
      );
      return { id: ownerId, displayName: cleanName };
    }
  }

  async linkAuthenticatedAccount(authUserId: string, displayName?: string): Promise<{ id: string; displayName: string; authUserId: string }> {
    const cleanAuthUserId = authUserId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanAuthUserId)) {
      throw new Error("شناسه حساب ابری معتبر نیست.");
    }
    const existing = await this.getCurrentOwner();
    const name = displayName?.trim() || existing?.displayName || "دانش‌آموز";
    const now = Date.now();
    if (existing) {
      await this.client.execute(
        "UPDATE owners SET display_name=?, kind='account', auth_user_id=?, updated_at=? WHERE id=?",
        [name, cleanAuthUserId, now, existing.id]
      );
      return { id: existing.id, displayName: name, authUserId: cleanAuthUserId };
    } else {
      const ownerId = crypto.randomUUID();
      const deviceNamespace = `account-${crypto.randomUUID().slice(0, 8)}`;
      await this.client.execute(
        "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
        [ownerId, "account", cleanAuthUserId, name, deviceNamespace, now, now]
      );
      return { id: ownerId, displayName: name, authUserId: cleanAuthUserId };
    }
  }

  async unlinkGoogleAccount(): Promise<{ id: string; displayName: string }> {
    const existing = await this.getCurrentOwner();
    if (!existing) {
      return this.saveOwner("دانش‌آموز", "local");
    }
    const now = Date.now();
    await this.client.execute(
      "UPDATE owners SET kind='local', auth_user_id=NULL, updated_at=? WHERE id=?",
      [now, existing.id]
    );
    return { id: existing.id, displayName: existing.displayName };
  }

  async updateProfile(id: string, input: { name: string; targetTrack?: string | null }) {
    await this.client.execute(
      "UPDATE profiles SET name=?, target_track=? WHERE id=?",
      [input.name.trim(), input.targetTrack ? input.targetTrack.trim() : null, id]
    );
  }

  async updateProfilePreferences(id: string, input: { penaltyNumerator?: number; penaltyDenominator?: number; defaultTimerMode?: "active" | "wall" }) {
    const [profile] = await this.client.query<{ penalty_numerator: number; penalty_denominator: number; default_timer_mode: "active" | "wall" }>(
      "SELECT penalty_numerator,penalty_denominator,default_timer_mode FROM profiles WHERE id=? LIMIT 1",
      [id]
    );
    if (!profile) throw new Error("پروفایل یافت نشد");
    const numerator = Math.max(0, Math.round(input.penaltyNumerator ?? profile.penalty_numerator));
    const denominator = Math.max(1, Math.round(input.penaltyDenominator ?? profile.penalty_denominator));
    const timerMode = input.defaultTimerMode ?? profile.default_timer_mode;
    await this.client.execute("UPDATE profiles SET penalty_numerator=?,penalty_denominator=?,default_timer_mode=? WHERE id=?", [numerator, denominator, timerMode, id]);
  }

  async addSubjectToProfile(profileId: string, subject: { name: string; targetPercentage: number; coefficient?: number; questionCount?: number; scoreGroup?: string | null }) {
    const canonicalName = canonicalizeSubject(subject.name);
    const existingSubjects = await this.client.query<{ id: string; name: string }>(
      "SELECT id, name FROM subjects WHERE profile_id=?",
      [profileId]
    );
    const existingSubject = existingSubjects.find((item) => isSameSubject(item.name, canonicalName));
    if (existingSubject) {
      await this.updateProfileSubject(existingSubject.id, {
        name: canonicalName,
        targetPercentage: subject.targetPercentage,
        coefficient: subject.coefficient,
        questionCount: subject.questionCount,
        scoreGroup: subject.scoreGroup,
      });
      return existingSubject.id;
    }
    const subjectId = crypto.randomUUID();
    const now = Date.now();
    const scoreGroup = normalizeScoreGroup(subject.scoreGroup);
    const [groupPeer] = scoreGroup
      ? await this.client.query<{ coefficient: number }>(
          "SELECT coefficient FROM subjects WHERE profile_id=? AND score_group=? LIMIT 1",
          [profileId, scoreGroup]
        )
      : [];
    const coefficient = groupPeer ? Number(groupPeer.coefficient) : subject.coefficient ?? 1;
    await this.client.execute(
      "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, question_count, score_group, created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(profile_id, name) DO UPDATE SET target_percentage=excluded.target_percentage, coefficient=excluded.coefficient, question_count=excluded.question_count, score_group=excluded.score_group",
      [subjectId, profileId, canonicalName, coefficient, Math.min(100, Math.max(0, subject.targetPercentage)), subject.questionCount ?? 25, scoreGroup, now]
    );
    return subjectId;
  }

  async updateProfileSubject(subjectId: string, updates: { name?: string; targetPercentage?: number; coefficient?: number; questionCount?: number; scoreGroup?: string | null }) {
    const existing = await this.client.query<{ id: string; profile_id: string; name: string; coefficient: number; target_percentage: number; question_count?: number; score_group?: string | null }>(
      "SELECT id, profile_id, name, coefficient, target_percentage, question_count, score_group FROM subjects WHERE id=? LIMIT 1",
      [subjectId]
    );
    if (!existing.length) throw new Error("درس یافت نشد");
    const curr = existing[0];
    const newName = updates.name !== undefined ? canonicalizeSubject(updates.name) : curr.name;
    const requestedCoeff = updates.coefficient !== undefined ? updates.coefficient : curr.coefficient;
    const requestedTarget = updates.targetPercentage !== undefined ? updates.targetPercentage : curr.target_percentage;
    const requestedCount = updates.questionCount !== undefined ? updates.questionCount : (curr.question_count ?? 25);
    let newCoeff = Number.isFinite(requestedCoeff) ? Math.max(0, Math.round(requestedCoeff)) : curr.coefficient;
    const newTarget = Number.isFinite(requestedTarget) ? Math.min(100, Math.max(0, Math.round(requestedTarget))) : curr.target_percentage;
    const newCount = Number.isFinite(requestedCount) ? Math.min(200, Math.max(1, Math.round(requestedCount))) : 25;
    const newScoreGroup = updates.scoreGroup !== undefined ? normalizeScoreGroup(updates.scoreGroup) : curr.score_group ?? null;
    const [groupPeer] = newScoreGroup
      ? await this.client.query<{ coefficient: number }>(
          "SELECT coefficient FROM subjects WHERE profile_id=? AND score_group=? AND id<>? LIMIT 1",
          [curr.profile_id, newScoreGroup, subjectId]
        )
      : [];
    if (groupPeer && updates.coefficient === undefined) {
      newCoeff = Number(groupPeer.coefficient);
    }

    await this.client.transaction(async (trx) => {
      await trx.execute(
        "UPDATE subjects SET name=?, coefficient=?, target_percentage=?, question_count=?, score_group=? WHERE id=?",
        [newName, newCoeff, newTarget, newCount, newScoreGroup, subjectId]
      );
      if (updates.coefficient !== undefined && newScoreGroup) {
        await trx.execute(
          "UPDATE subjects SET coefficient=? WHERE profile_id=? AND score_group=?",
          [newCoeff, curr.profile_id, newScoreGroup]
        );
      }
    });
  }

  async removeProfileSubject(subjectId: string) {
    await this.client.execute(
      "DELETE FROM subjects WHERE id=?",
      [subjectId]
    );
  }

  async importQuestions(parsed: ParsedImport) {
    let added = 0;
    let drafts = 0;
    let duplicates = 0;
    const issues = [...parsed.issues];
    const groupMap = new Map<string, string>(); // groupKey -> groupId
    const seenExternalKeys = new Set<string>();
    const seenFingerprints = new Set<string>();

    // 0. Resolve default source if provided
    let defaultSourceId: string | null = null;
    const envSource = parsed.envelope.defaults.source;
    if (envSource) {
      const srcKey = envSource.key || `${envSource.kind}-${envSource.title || "source"}-${envSource.year || ""}`;
      try {
        const existingSrc = await this.client.query<{ id: string }>(
          "SELECT id FROM sources WHERE external_key=? LIMIT 1",
          [srcKey]
        );
        if (existingSrc.length > 0) {
          defaultSourceId = existingSrc[0].id;
        } else {
          defaultSourceId = crypto.randomUUID();
          await this.client.execute(
            "INSERT INTO sources(id, kind, title, year, external_key, created_at) VALUES(?,?,?,?,?,?)",
            [defaultSourceId, envSource.kind, envSource.title ?? null, envSource.year ?? null, srcKey, Date.now()]
          );
        }
      } catch {
        // Ignore source insert failure
      }
    }

    // 1. Process and insert groups
    for (const groupResult of parsed.groups) {
      const g = groupResult.group;
      const groupId = crypto.randomUUID();
      groupMap.set(g.key, groupId);
      try {
        await this.client.execute(
          "INSERT INTO question_groups(id, external_key, kind, subject, chapter, topic, content_json, expected_keys_json, status, created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET status=excluded.status",
          [
            groupId,
            g.key,
            g.kind,
            canonicalizeSubject(g.subject || parsed.envelope.defaults.subject),
            g.chapter ?? parsed.envelope.defaults.chapter ?? null,
            g.topic ?? parsed.envelope.defaults.topic ?? null,
            JSON.stringify(g.content),
            JSON.stringify(g.questionKeys),
            groupResult.status,
            Date.now(),
          ]
        );
      } catch (err) {
        issues.push({
          rowIndex: 0,
          externalKey: g.key,
          path: "groups",
          message: err instanceof Error ? err.message : "خطا در ذخیره گروه",
        });
      }
    }

    // 2. Process and insert questions
    for (const [index, input] of parsed.valid.entries()) {
      // Intra-batch deduplication
      if (seenExternalKeys.has(input.key)) {
        duplicates += 1;
        continue;
      }
      seenExternalKeys.add(input.key);

      const fp = parsed.fingerprints.get(input.key) || computeQuestionFingerprint(input, parsed.envelope.defaults.subject);
      if (seenFingerprints.has(fp)) {
        duplicates += 1;
        continue;
      }
      seenFingerprints.add(fp);

      // Database deduplication check 1: external_key
      const existingByKey = await this.client.query<{ id: string }>(
        "SELECT id FROM questions WHERE external_key=? LIMIT 1",
        [input.key]
      );
      if (existingByKey.length) {
        duplicates += 1;
        continue;
      }

      // Database deduplication check 2: content_hash in question_revisions
      const existingByHash = await this.client.query<{ question_id: string }>(
        "SELECT question_id FROM question_revisions WHERE content_hash=? LIMIT 1",
        [fp]
      );
      if (existingByHash.length) {
        duplicates += 1;
        continue;
      }

      // Question source (if question has its own source override)
      let qSourceId = defaultSourceId;
      if (input.source) {
        const qSrc = input.source;
        const qSrcKey = qSrc.key || `${qSrc.kind}-${qSrc.title || "source"}-${qSrc.year || ""}`;
        try {
          const existingSrc = await this.client.query<{ id: string }>(
            "SELECT id FROM sources WHERE external_key=? LIMIT 1",
            [qSrcKey]
          );
          if (existingSrc.length > 0) {
            qSourceId = existingSrc[0].id;
          } else {
            qSourceId = crypto.randomUUID();
            await this.client.execute(
              "INSERT INTO sources(id, kind, title, year, external_key, created_at) VALUES(?,?,?,?,?,?)",
              [qSourceId, qSrc.kind, qSrc.title ?? null, qSrc.year ?? null, qSrcKey, Date.now()]
            );
          }
        } catch {
          // ignore
        }
      }

      const questionId = crypto.randomUUID();
      const optionIds = new Map(input.options.map((option) => [option.key, crypto.randomUUID()]));
      const correctOptionId = input.correctOptionKey ? optionIds.get(input.correctOptionKey) || null : null;
      const status = correctOptionId ? "published" : "draft";
      let groupId = input.groupKey ? groupMap.get(input.groupKey) || null : null;

      // If groupId wasn't in current envelope groups, check if it already exists in DB
      if (!groupId && input.groupKey) {
        const existingGroup = await this.client.query<{ id: string }>(
          "SELECT id FROM question_groups WHERE external_key=? LIMIT 1",
          [input.groupKey]
        );
        if (existingGroup.length > 0) {
          groupId = existingGroup[0].id;
          groupMap.set(input.groupKey, groupId);
        }
      }

      const revisionId = crypto.randomUUID();
      const now = Date.now();
      const revisionSnapshot = {
        id: questionId,
        externalKey: input.key,
        subject: canonicalizeSubject(input.subject || parsed.envelope.defaults.subject),
        chapter: input.chapter ?? parsed.envelope.defaults.chapter ?? null,
        topic: input.topic ?? parsed.envelope.defaults.topic ?? null,
        content: input.content,
        options: input.options.map((option, position) => ({
          id: optionIds.get(option.key)!,
          key: option.key,
          position,
          content: option.content,
        })),
        correctOptionId,
        explanation: input.explanation,
        status,
        shuffleSafe: Boolean(input.shuffleSafe),
        createdAt: now,
      };

      try {
        await this.client.batch([
          {
            sql: "INSERT INTO questions(id,external_key,subject,chapter,topic,group_id,group_position,source_id,content_json,explanation_json,correct_option_id,status,shuffle_safe,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            bind: [
              questionId,
              input.key,
              canonicalizeSubject(input.subject || parsed.envelope.defaults.subject),
              input.chapter ?? parsed.envelope.defaults.chapter ?? null,
              input.topic ?? parsed.envelope.defaults.topic ?? null,
              groupId,
              input.groupPosition ?? null,
              qSourceId,
              JSON.stringify(input.content),
              JSON.stringify(input.explanation),
              correctOptionId,
              status,
              input.shuffleSafe ? 1 : 0,
              now,
            ],
          },
          ...input.options.map((option, position) => ({
            sql: "INSERT INTO question_options(id,question_id,external_key,position,content_json) VALUES(?,?,?,?,?)",
            bind: [optionIds.get(option.key)!, questionId, option.key, position, JSON.stringify(option.content)],
          })),
          {
            sql: "INSERT INTO question_revisions(id,question_id,version,snapshot_json,content_hash,created_at) VALUES(?,?,?,?,?,?)",
            bind: [revisionId, questionId, 1, JSON.stringify(revisionSnapshot), fp, now],
          },
        ]);
        added += 1;
        if (status === "draft") drafts += 1;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "ذخیره نشد";
        const isQuota = msg.includes("quota") || msg.includes("QUOTA") || msg.includes("disk") || msg.includes("full");
        issues.push({
          rowIndex: index + 1,
          externalKey: input.key,
          path: "database",
          message: isQuota ? "حافظه مرورگر یا دیسک پر شده است (Quota Exceeded)." : msg,
        });
      }
    }

    // 3. Post-import: repair and update group completeness
    for (const [, groupId] of groupMap.entries()) {
      await this.repairQuestionGroup(groupId);
    }

    return {
      total: parsed.valid.length + new Set(parsed.issues.map((issue) => issue.rowIndex)).size,
      added,
      drafts,
      duplicates,
      failed: new Set(issues.filter((i) => !i.isWarning).map((issue) => issue.rowIndex)).size,
      issues,
    };
  }

  async repairQuestionGroup(groupId: string): Promise<boolean> {
    const rows = await this.client.query<{ id: string; expected_keys_json: string }>(
      "SELECT id, expected_keys_json FROM question_groups WHERE id=?",
      [groupId]
    );
    if (!rows.length) return false;
    let expectedKeys: string[] = [];
    try {
      expectedKeys = JSON.parse(rows[0].expected_keys_json || "[]");
    } catch {
      return false;
    }
    if (!expectedKeys.length) return false;

    const placeholders = expectedKeys.map(() => "?").join(",");
    const existing = await this.client.query<{ external_key: string }>(
      `SELECT external_key FROM questions WHERE external_key IN (${placeholders})`,
      expectedKeys
    );
    const foundKeys = new Set(existing.map((r) => r.external_key));
    const isComplete = expectedKeys.every((k) => foundKeys.has(k));
    const nextStatus = isComplete ? "complete" : "incomplete";

    await this.client.execute(
      "UPDATE question_groups SET status=? WHERE id=?",
      [nextStatus, groupId]
    );

    // Link any matching questions that might not have group_id set
    await this.client.execute(
      `UPDATE questions SET group_id=? WHERE external_key IN (${placeholders}) AND (group_id IS NULL OR group_id='')`,
      [groupId, ...expectedKeys]
    );

    return isComplete;
  }

  async reorderGroupQuestions(groupId: string, questionIdsInOrder: string[]): Promise<void> {
    const statements = questionIdsInOrder.map((qId, pos) => ({
      sql: "UPDATE questions SET group_position=? WHERE id=? AND group_id=?",
      bind: [pos, qId, groupId],
    }));
    await this.client.batch(statements);
  }

  async listQuestions(filters?: { query?: string; subject?: string; chapter?: string; topic?: string; status?: "draft" | "published"; limit?: number }): Promise<StoredQuestion[]> {
    const limit = filters?.limit || 50;
    const whereClauses = ["inactive_at IS NULL"];
    const params: Array<string | number> = [];

    if (filters?.chapter) {
      whereClauses.push("chapter = ?");
      params.push(filters.chapter);
    }
    if (filters?.topic) {
      whereClauses.push("topic = ?");
      params.push(filters.topic);
    }
    if (filters?.status) {
      whereClauses.push("status = ?");
      params.push(filters.status);
    }

    const queryLimit = filters?.subject ? 10_000 : limit;
    params.push(queryLimit);
    const sql = `SELECT q.*, s.kind AS source_kind, s.title AS source_title, s.year AS source_year,
      (SELECT COUNT(*) FROM question_reports qr WHERE qr.question_id=q.id) AS report_count
      FROM questions q LEFT JOIN sources s ON s.id=q.source_id WHERE ${whereClauses.map((clause) => `q.${clause}`).join(" AND ")} ORDER BY q.created_at DESC LIMIT ?`;
    const rows = await this.client.query<QuestionRow>(sql, params);
    if (!rows.length) return [];

    const placeholders = rows.map(() => "?").join(",");
    const options = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY position`,
      rows.map((row) => row.id)
    );

    const groupIds = Array.from(new Set(rows.map((r) => r.group_id).filter(Boolean))) as string[];
    const groupMap = new Map<string, { kind: "reading" | "cloze" | "shared"; content: ContentBlock[] }>();
    if (groupIds.length > 0) {
      const gPlaceholders = groupIds.map(() => "?").join(",");
      const gRows = await this.client.query<{ id: string; kind: string; content_json: string }>(
        `SELECT id, kind, content_json FROM question_groups WHERE id IN (${gPlaceholders})`,
        groupIds
      );
      for (const gr of gRows) {
        groupMap.set(gr.id, {
          kind: gr.kind as "reading" | "cloze" | "shared",
          content: JSON.parse(gr.content_json),
        });
      }
    }

    let mapped = rows.map((row) =>
      mapQuestion(
        row,
        options.filter((option) => option.question_id === row.id),
        groupMap
      )
    );

    if (filters?.query) {
      const q = normalizeSearch(filters.query);
      mapped = mapped.filter((item) => {
        const textInContent = item.content
          .map((b) => (b.type === "text" ? normalizeSearch(b.value) : ""))
          .join(" ");
        const textInSubject = normalizeSearch(item.subject);
        return textInContent.includes(q) || textInSubject.includes(q);
      });
    }

    if (filters?.subject) {
      mapped = mapped.filter((item) => isSameSubject(item.subject, filters.subject!));
    }

    return mapped.slice(0, limit);
  }

  async getQuestion(id: string): Promise<StoredQuestion | null> {
    const rows = await this.client.query<QuestionRow>(`SELECT q.*, s.kind AS source_kind, s.title AS source_title, s.year AS source_year,
      (SELECT COUNT(*) FROM question_reports qr WHERE qr.question_id=q.id) AS report_count
      FROM questions q LEFT JOIN sources s ON s.id=q.source_id WHERE q.id=? LIMIT 1`, [id]);
    if (!rows.length) return null;
    const options = await this.client.query<Record<string, unknown>>(
      "SELECT * FROM question_options WHERE question_id=? ORDER BY position",
      [id]
    );
    let groupMap: Map<string, { kind: "reading" | "cloze" | "shared"; content: ContentBlock[] }> | undefined;
    if (rows[0].group_id) {
      const gRows = await this.client.query<{ id: string; kind: string; content_json: string }>(
        "SELECT id, kind, content_json FROM question_groups WHERE id=?",
        [rows[0].group_id]
      );
      if (gRows.length > 0) {
        groupMap = new Map([[
          String(rows[0].group_id),
          {
            kind: gRows[0].kind as "reading" | "cloze" | "shared",
            content: JSON.parse(gRows[0].content_json),
          },
        ]]);
      }
    }
    return mapQuestion(rows[0], options, groupMap);
  }

  async getQuestionReportStatus(questionId: string): Promise<{ count: number; reportedByCurrentUser: boolean }> {
    const owner = await this.getCurrentOwner();
    const [countRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM question_reports WHERE question_id=?", [questionId]
    );
    if (!owner) return { count: Number(countRow?.count ?? 0), reportedByCurrentUser: false };
    const rows = await this.client.query<{ id: string }>(
      "SELECT id FROM question_reports WHERE question_id=? AND owner_id=? LIMIT 1", [questionId, owner.id]
    );
    return { count: Number(countRow?.count ?? 0), reportedByCurrentUser: rows.length > 0 };
  }

  async reportQuestion(questionId: string, note?: string): Promise<{ count: number }> {
    const question = await this.getQuestion(questionId);
    if (!question) throw new Error("سؤال موردنظر برای گزارش پیدا نشد.");
    let owner = await this.getCurrentOwner();
    if (!owner) owner = { ...(await this.saveOwner("دانش‌آموز")), kind: "local" as const, authUserId: null };
    const cleanNote = note?.trim() || null;
    if (cleanNote && cleanNote.length > 1000) throw new Error("توضیح گزارش حداکثر ۱۰۰۰ نویسه است.");
    try {
      await this.client.execute(
        "INSERT INTO question_reports(id,question_id,owner_id,note,created_at) VALUES(?,?,?,?,?)",
        [crypto.randomUUID(), questionId, owner.id, cleanNote, Date.now()]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/unique|constraint/i.test(message)) throw new Error("شما پیش‌تر این سؤال را گزارش کرده‌اید.");
      throw error;
    }
    const status = await this.getQuestionReportStatus(questionId);
    return { count: status.count };
  }

  async getQuestionDetails(id: string) {
    const question = await this.getQuestion(id);
    if (!question) return null;

    const revisions = await this.client.query<{
      version: number;
      created_at: number;
      content_hash: string;
    }>("SELECT version, created_at, content_hash FROM question_revisions WHERE question_id=? ORDER BY version DESC", [id]);

    const attempts = await this.client.query<{
      id: string;
      result: "correct" | "wrong" | "unanswered";
      confidence: string | null;
      active_ms: number;
      finalized_at: number;
    }>("SELECT id, result, confidence, active_ms, finalized_at FROM attempts WHERE question_id=? ORDER BY finalized_at DESC LIMIT 10", [id]);

    return {
      question,
      revisions,
      attempts,
    };
  }

  async createQuestion(input: {
    subject: string;
    chapter?: string | null;
    topic?: string | null;
    content: ContentBlock[];
    options: Array<{ key: string; content: ContentBlock[] }>;
    correctOptionKey?: string | null;
    explanation?: ContentBlock[];
    shuffleSafe?: boolean;
  }): Promise<string> {
    const questionId = crypto.randomUUID();
    const externalKey = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const optionIds = new Map(input.options.map((opt) => [opt.key, crypto.randomUUID()]));
    const correctOptionId = input.correctOptionKey ? optionIds.get(input.correctOptionKey) || null : null;
    const status = correctOptionId ? "published" : "draft";

    await this.client.batch([
      {
        sql: "INSERT INTO questions(id,external_key,subject,chapter,topic,content_json,explanation_json,correct_option_id,status,shuffle_safe,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        bind: [
          questionId,
          externalKey,
          canonicalizeSubject(input.subject),
          input.chapter?.trim() || null,
          input.topic?.trim() || null,
          JSON.stringify(input.content),
          JSON.stringify(input.explanation || []),
          correctOptionId,
          status,
          input.shuffleSafe ? 1 : 0,
          Date.now(),
        ],
      },
      ...input.options.map((opt, pos) => ({
        sql: "INSERT INTO question_options(id,question_id,external_key,position,content_json) VALUES(?,?,?,?,?)",
        bind: [optionIds.get(opt.key)!, questionId, opt.key, pos, JSON.stringify(opt.content)],
      })),
    ]);

    return questionId;
  }

  async updateQuestion(
    id: string,
    input: {
      subject: string;
      chapter?: string | null;
      topic?: string | null;
      content: ContentBlock[];
      options: Array<{ id?: string; key: string; content: ContentBlock[] }>;
      correctOptionKey?: string | null;
      explanation?: ContentBlock[];
      shuffleSafe?: boolean;
    }
  ): Promise<void> {
    const existingOptions = await this.client.query<{ id: string; external_key: string }>(
      "SELECT id, external_key FROM question_options WHERE question_id=?",
      [id]
    );
    const existingMap = new Map(existingOptions.map((o) => [o.external_key, o.id]));

    const optionIds = new Map(
      input.options.map((opt) => [opt.key, opt.id || existingMap.get(opt.key) || crypto.randomUUID()])
    );

    const correctOptionId = input.correctOptionKey ? optionIds.get(input.correctOptionKey) || null : null;
    const status = correctOptionId ? "published" : "draft";

    const revRows = await this.client.query<{ max_ver: number }>(
      "SELECT COALESCE(MAX(version), 0) as max_ver FROM question_revisions WHERE question_id=?",
      [id]
    );
    const nextVer = Number(revRows[0]?.max_ver || 0) + 1;
    const now = Date.now();

    await this.client.batch([
      {
        sql: `UPDATE questions SET
          subject=?, chapter=?, topic=?, content_json=?, explanation_json=?,
          correct_option_id=?, status=?, shuffle_safe=?
          WHERE id=?`,
        bind: [
          canonicalizeSubject(input.subject),
          input.chapter?.trim() || null,
          input.topic?.trim() || null,
          JSON.stringify(input.content),
          JSON.stringify(input.explanation || []),
          correctOptionId,
          status,
          input.shuffleSafe ? 1 : 0,
          id,
        ],
      },
      {
        sql: "DELETE FROM question_options WHERE question_id=?",
        bind: [id],
      },
      ...input.options.map((opt, pos) => ({
        sql: "INSERT INTO question_options(id,question_id,external_key,position,content_json) VALUES(?,?,?,?,?)",
        bind: [optionIds.get(opt.key)!, id, opt.key, pos, JSON.stringify(opt.content)],
      })),
      {
        sql: "INSERT INTO question_revisions(id,question_id,version,snapshot_json,content_hash,created_at) VALUES(?,?,?,?,?,?)",
        bind: [
          crypto.randomUUID(),
          id,
          nextVer,
          JSON.stringify({
            id,
            subject: canonicalizeSubject(input.subject),
            chapter: input.chapter?.trim() || null,
            topic: input.topic?.trim() || null,
            content: input.content,
            options: input.options,
            correctOptionKey: input.correctOptionKey || null,
            explanation: input.explanation || [],
          }),
          `hash-${now}`,
          now,
        ],
      },
    ]);
  }

  async deleteQuestion(id: string): Promise<void> {
    await this.client.batch([
      { sql: "DELETE FROM review_items WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM attempts WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM session_questions WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM question_reports WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM question_media WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM question_options WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM question_revisions WHERE question_id = ?", bind: [id] },
      { sql: "DELETE FROM questions WHERE id = ?", bind: [id] },
    ]);
  }

  async deleteQuestions(ids: string[]): Promise<void> {
    if (!ids.length) return;
    for (const id of ids) {
      await this.deleteQuestion(id);
    }
  }

  async deleteAllQuestions(filters?: { subject?: string }): Promise<void> {
    let ids: string[] = [];
    if (filters?.subject && filters.subject !== "all") {
      const rows = await this.client.query<{ id: string }>(
        "SELECT id FROM questions WHERE subject = ?",
        [filters.subject]
      );
      ids = rows.map((r) => r.id);
    } else {
      const rows = await this.client.query<{ id: string }>("SELECT id FROM questions");
      ids = rows.map((r) => r.id);
    }
    await this.deleteQuestions(ids);
  }

  async computeQuestionUrgencies(
    profileId: string,
    questionIds: string[]
  ): Promise<Map<string, { urgencyScore: number; wrongCount: number; doubtfulCount: number; guessCount: number; streak: number }>> {
    const result = new Map<string, { urgencyScore: number; wrongCount: number; doubtfulCount: number; guessCount: number; streak: number }>();
    if (!questionIds.length) return result;

    const attempts = await this.client.query<{
      question_id: string;
      result: string;
      confidence: string | null;
      finalized_at: number;
    }>(
      "SELECT a.question_id, a.result, a.confidence, a.finalized_at FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? ORDER BY a.finalized_at ASC",
      [profileId]
    );

    const reviewItems = await this.client.query<{
      question_id: string;
      due_at: number | null;
      priority: number | null;
      stable_streak: number | null;
    }>("SELECT question_id, due_at, priority, stable_streak FROM review_items");

    const reviewMap = new Map(reviewItems.map((r) => [r.question_id, r]));

    const attemptsByQ = new Map<string, Array<{ result: string; confidence: string | null; finalized_at: number }>>();
    for (const a of attempts) {
      const list = attemptsByQ.get(a.question_id) || [];
      list.push(a);
      attemptsByQ.set(a.question_id, list);
    }

    const now = Date.now();

    for (const qId of questionIds) {
      const qAttempts = attemptsByQ.get(qId) || [];
      const review = reviewMap.get(qId);

      let wrongCount = 0;
      let doubtfulCount = 0;
      let guessCount = 0;
      let streak = 0;

      for (const a of qAttempts) {
        if (a.result === "wrong") wrongCount++;
        if (a.confidence === "doubtful") doubtfulCount++;
        if (a.confidence === "guess") guessCount++;
      }

      for (let i = qAttempts.length - 1; i >= 0; i--) {
        if (qAttempts[i].result === "correct") {
          streak++;
        } else {
          break;
        }
      }

      const lastAttempt = qAttempts.length > 0 ? qAttempts[qAttempts.length - 1] : null;

      let urgencyScore = 0;

      if (lastAttempt) {
        if (lastAttempt.result === "wrong") urgencyScore += 50;
        else if (lastAttempt.result === "unanswered") urgencyScore += 25;
        if (lastAttempt.confidence === "guess") urgencyScore += 35;
        else if (lastAttempt.confidence === "doubtful") urgencyScore += 25;
      }

      urgencyScore += (wrongCount * 8) + (guessCount * 6) + (doubtfulCount * 4);
      urgencyScore -= (streak * 15);

      if (review && review.due_at && review.due_at <= now) {
        urgencyScore += 40;
      }
      if (review && review.priority !== null && review.priority !== undefined) {
        urgencyScore += review.priority * 5;
      }

      let hash = 0;
      for (let i = 0; i < qId.length; i++) {
        hash = (hash << 5) - hash + qId.charCodeAt(i);
        hash |= 0;
      }
      urgencyScore += ((Math.abs(hash) % 100) / 50 - 1) * 2;

      result.set(qId, {
        urgencyScore,
        wrongCount,
        doubtfulCount,
        guessCount,
        streak,
      });
    }

    return result;
  }

  async getAvailableReviewCounts(
    profileId: string,
    subject?: string | null
  ): Promise<{
    wrong: number;
    doubtful: number;
    guess: number;
    skipped: number;
    due: number;
    mastered: number;
    totalAvailable: number;
  }> {
    let subjectFilterSql = "";
    const params: (string | number)[] = [profileId];

    if (subject && subject !== "all") {
      const names = subjectNamesForMatching(subject);
      subjectFilterSql = ` AND q.subject IN (${names.map(() => "?").join(",")})`;
      params.push(...names);
    }

    const wrongRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT a.question_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id
       WHERE s.profile_id=? AND a.result='wrong'${subjectFilterSql}`,
      params
    );

    const doubtfulRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT a.question_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id
       WHERE s.profile_id=? AND a.confidence='doubtful'${subjectFilterSql}`,
      params
    );

    const guessRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT a.question_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id
       WHERE s.profile_id=? AND a.confidence='guess'${subjectFilterSql}`,
      params
    );

    const skippedRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT a.question_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id
       WHERE s.profile_id=? AND (a.selected_option_id IS NULL OR a.result='unanswered')${subjectFilterSql}`,
      params
    );

    const dueParams: (string | number)[] = [Date.now()];
    let dueSubjectSql = "";
    if (subject && subject !== "all") {
      const names = subjectNamesForMatching(subject);
      dueSubjectSql = ` AND q.subject IN (${names.map(() => "?").join(",")})`;
      dueParams.push(...names);
    }

    const dueRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT r.question_id 
       FROM review_items r
       JOIN questions q ON q.id=r.question_id
       WHERE r.due_at <= ?${dueSubjectSql}`,
      dueParams
    );

    const masteredRows = await this.client.query<{ question_id: string }>(
      `SELECT DISTINCT a.question_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id
       WHERE s.profile_id=? AND a.result='correct'${subjectFilterSql}`,
      params
    );

    const allWeaknessSet = new Set<string>([
      ...wrongRows.map((r) => r.question_id),
      ...doubtfulRows.map((r) => r.question_id),
      ...guessRows.map((r) => r.question_id),
      ...skippedRows.map((r) => r.question_id),
      ...dueRows.map((r) => r.question_id),
    ]);

    return {
      wrong: wrongRows.length,
      doubtful: doubtfulRows.length,
      guess: guessRows.length,
      skipped: skippedRows.length,
      due: dueRows.length,
      mastered: masteredRows.length,
      totalAvailable: allWeaknessSet.size,
    };
  }

  async createSession(
    profileId: string,
    countOrOptions?: number | CreateSessionOptions,
    maybeOptions?: CreateSessionOptions
  ) {
    const opts: CreateSessionOptions =
      typeof countOrOptions === "object" && countOrOptions !== null
        ? countOrOptions
        : { count: typeof countOrOptions === "number" ? countOrOptions : 20, ...maybeOptions };

    const mode = opts.mode || "random";
    const isOpenEnded = Boolean(opts.isOpenEnded || mode === "continuous");
    const subjects = opts.subjects && opts.subjects.length > 0
      ? opts.subjects
      : (opts.subject && opts.subject !== "all" ? [opts.subject] : null);
    const subjectFilter = subjects && subjects.length === 1 ? subjects[0] : (opts.subject && opts.subject !== "all" ? opts.subject : null);
    const chapterFilters = opts.chapters && opts.chapters.length > 0 ? opts.chapters : null;
    const topicFilters = opts.topics && opts.topics.length > 0 ? opts.topics : null;

    let questions = await this.listQuestions({ limit: 10_000, status: "published" });
    const incompleteGroups = await this.client.query<{ id: string }>(
      "SELECT id FROM question_groups WHERE status='incomplete'"
    );
    const incompleteGroupIds = new Set(incompleteGroups.map((g) => g.id));
    questions = questions.filter((q) => !q.groupId || !incompleteGroupIds.has(q.groupId));

    // Exclude questions with missing required media (TASK-027.4)
    try {
      const missingMedia = await this.client.query<{ question_id: string }>(
        `SELECT DISTINCT qm.question_id
         FROM question_media qm
         JOIN media_files mf ON qm.media_id = mf.id
         WHERE qm.required = 1 AND mf.availability = 'missing' AND qm.question_id IS NOT NULL`
      );
      if (missingMedia.length > 0) {
        const missingSet = new Set(missingMedia.map((m) => m.question_id));
        questions = questions.filter((q) => !missingSet.has(q.id));
      }
    } catch {
      // Table may not exist yet or query failed
    }

    if (subjects && subjects.length > 0) {
      questions = questions.filter((q) => subjects.some((s) => isSameSubject(s, q.subject)));
    }
    if (chapterFilters && chapterFilters.length > 0) {
      questions = questions.filter((q) => matchesChapterFilters(q, chapterFilters));
    }
    if (topicFilters && topicFilters.length > 0) {
      questions = questions.filter((q) => matchesTopicFilters(q, topicFilters));
    }

    const selectedModes: QuestionPoolMode[] = (opts.modes && opts.modes.length > 0)
      ? opts.modes
      : mode === "continuous" ? ["random"] : [mode as QuestionPoolMode];

    const isAllRandom = selectedModes.includes("random") || selectedModes.length === 0;

    if (!isAllRandom) {
      const eligibleQuestionIds = new Set<string>();

      // 1. New / Unsolved
      if (selectedModes.includes("new")) {
        const attempted = await this.client.query<{ question_id: string }>(
          "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=?",
          [profileId]
        );
        const attemptedIds = new Set(attempted.map((r) => r.question_id));
        for (const q of questions) {
          if (!attemptedIds.has(q.id)) {
            eligibleQuestionIds.add(q.id);
          }
        }
      }

      // 2. Wrong answers
      if (selectedModes.includes("wrong")) {
        const wrong = await this.client.query<{ question_id: string }>(
          "SELECT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='wrong'",
          [profileId]
        );
        for (const r of wrong) eligibleQuestionIds.add(r.question_id);
      }

      // 3. Doubtful
      if (selectedModes.includes("doubtful")) {
        const doubtful = await this.client.query<{ question_id: string }>(
          "SELECT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='doubtful'",
          [profileId]
        );
        for (const r of doubtful) eligibleQuestionIds.add(r.question_id);
      }

      // 4. Guess
      if (selectedModes.includes("guess")) {
        const guess = await this.client.query<{ question_id: string }>(
          "SELECT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='guess'",
          [profileId]
        );
        for (const r of guess) eligibleQuestionIds.add(r.question_id);
      }

      // 5. Bookmarked
      if (selectedModes.includes("bookmarked")) {
        const bookmarked = await this.client.query<{ question_id: string }>(
          "SELECT question_id FROM review_items WHERE priority >= 3"
        );
        for (const r of bookmarked) eligibleQuestionIds.add(r.question_id);
      }

      // 6. Due for spaced repetition
      if (selectedModes.includes("due")) {
        const now = Date.now();
        const due = await this.client.query<{ question_id: string }>(
          "SELECT question_id FROM review_items WHERE due_at <= ?",
          [now]
        );
        for (const r of due) eligibleQuestionIds.add(r.question_id);
      }

      // 7. Skipped
      if (selectedModes.includes("skipped")) {
        const skipped = await this.client.query<{ question_id: string }>(
          "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND (a.selected_option_id IS NULL OR a.result='unanswered')",
          [profileId]
        );
        for (const r of skipped) eligibleQuestionIds.add(r.question_id);
      }

      // 8. Mastered / Confirmed correct questions (placed at back of queue by urgency weighting)
      if (selectedModes.includes("mastered")) {
        const mastered = await this.client.query<{ question_id: string }>(
          "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='correct'",
          [profileId]
        );
        for (const r of mastered) eligibleQuestionIds.add(r.question_id);
      }

      questions = questions.filter((q) => eligibleQuestionIds.has(q.id));
    }

    if (!questions.length) {
      throw new Error("سؤالی با شرایط و فیلترهای انتخابی در بانک یافت نشد.");
    }

    const units = groupQuestionsIntoUnits(questions);
    const seed = crypto.randomUUID();
    const shouldShuffleQuestions = opts.shuffleQuestions ?? true;
    const shouldShuffleOptions = opts.shuffleOptions ?? true;
    const isReviewMode = mode === "due" || opts.instantFeedback === true || selectedModes.some((m) => ["wrong", "doubtful", "guess", "due", "skipped", "mastered"].includes(m));

    let orderedUnits = units;
    if (isReviewMode && opts.shuffleQuestions !== true) {
      // Prioritize by adaptive urgency score: weakest/unresolved questions first, mastered at the end
      const urgencies = await this.computeQuestionUrgencies(profileId, questions.map((q) => q.id));
      orderedUnits = [...units].sort((a, b) => {
        const scoreA = Math.max(...a.map((q) => urgencies.get(q.id)?.urgencyScore ?? 0));
        const scoreB = Math.max(...b.map((q) => urgencies.get(q.id)?.urgencyScore ?? 0));
        return scoreB - scoreA; // highest urgency first
      });
    } else if (shouldShuffleQuestions) {
      orderedUnits = seededShuffle(units, seed);
    }

    const [profilePolicy] = await this.client.query<{ penalty_numerator: number; penalty_denominator: number }>("SELECT penalty_numerator,penalty_denominator FROM profiles WHERE id=? LIMIT 1", [profileId]);

    const sessionConfig: SessionConfig = {
      profileId,
      mode,
      modes: selectedModes,
      subjectFilter,
      subjectFilters: subjects,
      chapterFilters,
      topicFilters,
      requestedCount: isOpenEnded ? null : (opts.count ?? 20),
      isOpenEnded,
      scorePolicy: {
        penaltyNumerator: opts.negativeMarking === false ? 0 : Number(profilePolicy?.penalty_numerator ?? 1),
        penaltyDenominator: Math.max(1, Number(profilePolicy?.penalty_denominator ?? 3)),
      },
      feedbackMode: opts.feedbackMode || (opts.instantFeedback ? "instant" : "deferred"),
      instantFeedback: Boolean(opts.instantFeedback || opts.feedbackMode === "instant"),
      durationMinutes: opts.durationMinutes ?? null,
      negativeMarking: opts.negativeMarking ?? true,
    };

    let selected: StoredQuestion[] = [];
    if (isOpenEnded) {
      // In continuous/open-ended mode, start with ONLY the first unit!
      selected = [...orderedUnits[0]];
    } else {
      const targetCount = opts.count ?? 20;
      for (const unit of orderedUnits) {
        if (selected.length >= targetCount) break;
        selected.push(...unit);
      }
    }

    const sessionId = crypto.randomUUID();
    const now = Date.now();
    await this.client.batch([
      {
        sql: "INSERT INTO sessions(id,profile_id,state,selection_seed,current_ordinal,created_at,config_json) VALUES(?,?,'CREATED',?,0,?,?)",
        bind: [sessionId, profileId, seed, now, JSON.stringify(sessionConfig)],
      },
      ...selected.map((question, ordinal) => {
        const order = question.shuffleSafe && shouldShuffleOptions
          ? seededShuffle(question.options, `${seed}:${question.id}`).map((option) => option.id)
          : question.options.map((option) => option.id);
        return {
          sql: "INSERT INTO session_questions(id,session_id,question_id,ordinal,snapshot_json,option_order_json) VALUES(?,?,?,?,?,?)",
          bind: [crypto.randomUUID(), sessionId, question.id, ordinal, JSON.stringify(question), JSON.stringify(order)],
        };
      }),
    ]);
    return sessionId;
  }

  async getQuestionPoolStats(profileId: string): Promise<{
    attemptedIds: string[];
    wrongIds: string[];
    doubtfulIds: string[];
    guessIds: string[];
    dueIds: string[];
    skippedIds: string[];
    bookmarkedIds: string[];
    masteredIds: string[];
  }> {
    const attempted = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=?",
      [profileId]
    );
    const wrong = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='wrong'",
      [profileId]
    );
    const doubtful = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='doubtful'",
      [profileId]
    );
    const guess = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='guess'",
      [profileId]
    );
    const due = await this.client.query<{ question_id: string }>(
      "SELECT question_id FROM review_items WHERE due_at <= ?",
      [Date.now()]
    );
    const skipped = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND (a.selected_option_id IS NULL OR a.result='unanswered')",
      [profileId]
    );
    const bookmarked = await this.client.query<{ question_id: string }>(
      "SELECT question_id FROM review_items WHERE priority >= 3"
    );
    const mastered = await this.client.query<{ question_id: string }>(
      "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='correct'",
      [profileId]
    );

    return {
      attemptedIds: attempted.map((r) => r.question_id),
      wrongIds: wrong.map((r) => r.question_id),
      doubtfulIds: doubtful.map((r) => r.question_id),
      guessIds: guess.map((r) => r.question_id),
      dueIds: due.map((r) => r.question_id),
      skippedIds: skipped.map((r) => r.question_id),
      bookmarkedIds: bookmarked.map((r) => r.question_id),
      masteredIds: mastered.map((r) => r.question_id),
    };
  }

  async appendNextUnit(sessionId: string): Promise<SessionQuestion[] | null> {
    const sessions = await this.client.query<Record<string, unknown>>(
      "SELECT * FROM sessions WHERE id=?",
      [sessionId]
    );
    if (!sessions.length || sessions[0].state !== "RUNNING") return null;

    const sessionRow = sessions[0];
    const config: SessionConfig | null = sessionRow.config_json
      ? JSON.parse(String(sessionRow.config_json))
      : null;

    if (!config?.isOpenEnded && config?.mode !== "continuous") return null;

    const currentQuestions = await this.client.query<{ question_id: string; ordinal: number }>(
      "SELECT question_id, ordinal FROM session_questions WHERE session_id=? ORDER BY ordinal ASC",
      [sessionId]
    );
    const usedIds = new Set(currentQuestions.map((q) => String(q.question_id)));
    const maxOrdinal =
      currentQuestions.length > 0
        ? Math.max(...currentQuestions.map((q) => Number(q.ordinal)))
        : -1;

    let candidates = await this.listQuestions({ limit: 10_000, status: "published" });
    if (config?.subjectFilters && config.subjectFilters.length > 0) {
      candidates = candidates.filter((q) => config.subjectFilters!.some((subject) => isSameSubject(subject, q.subject)));
    } else if (config?.subjectFilter) {
      candidates = candidates.filter((q) => isSameSubject(q.subject, config.subjectFilter!));
    }
    if (config?.chapterFilters && config.chapterFilters.length > 0) {
      candidates = candidates.filter((q) => matchesChapterFilters(q, config.chapterFilters!));
    }
    if (config?.topicFilters && config.topicFilters.length > 0) {
      candidates = candidates.filter((q) => matchesTopicFilters(q, config.topicFilters!));
    }
    candidates = candidates.filter((q) => !usedIds.has(q.id));

    if (config?.mode === "new") {
      const attempted = await this.client.query<{ question_id: string }>(
        "SELECT DISTINCT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=?",
        [config.profileId]
      );
      const attemptedIds = new Set(attempted.map((r) => r.question_id));
      candidates = candidates.filter((q) => !attemptedIds.has(q.id));
    } else if (config?.mode === "wrong") {
      const wrong = await this.client.query<{ question_id: string }>(
        "SELECT a.question_id FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='wrong'",
        [config.profileId]
      );
      const wrongIds = new Set(wrong.map((r) => r.question_id));
      candidates = candidates.filter((q) => wrongIds.has(q.id));
    } else if (config?.mode === "due") {
      const now = Date.now();
      const due = await this.client.query<{ question_id: string }>(
        "SELECT question_id FROM review_items WHERE due_at <= ?",
        [now]
      );
      const dueIds = new Set(due.map((r) => r.question_id));
      candidates = candidates.filter((q) => dueIds.has(q.id));
    }

    if (candidates.length === 0) {
      return null;
    }

    const units = groupQuestionsIntoUnits(candidates);
    const appendSeed = `${sessionRow.selection_seed}:append:${usedIds.size}`;
    const shuffledUnits = seededShuffle(units, appendSeed);
    const nextUnit = shuffledUnits[0];

    const appendedQuestions: SessionQuestion[] = [];
    const statements = nextUnit.map((question, idx) => {
      const ordinal = maxOrdinal + 1 + idx;
      const order = question.shuffleSafe
        ? seededShuffle(question.options, `${sessionRow.selection_seed}:${question.id}`).map((o) => o.id)
        : question.options.map((o) => o.id);
      const sqId = crypto.randomUUID();
      appendedQuestions.push({
        id: sqId,
        sessionId,
        ordinal,
        selectedOptionId: null,
        confidence: null,
        visited: false,
        activeMs: 0,
        snapshot: question,
        optionOrder: order,
      });
      return {
        sql: "INSERT INTO session_questions(id,session_id,question_id,ordinal,snapshot_json,option_order_json,visited,active_ms) VALUES(?,?,?,?,?,?,0,0)",
        bind: [sqId, sessionId, question.id, ordinal, JSON.stringify(question), JSON.stringify(order)],
      };
    });

    await this.client.batch(statements);
    return appendedQuestions;
  }

  async listSessions(profileId: string): Promise<SessionListItem[]> {
    const rows = await this.client.query<Record<string, unknown>>(
      "SELECT s.*, COUNT(q.id) total, SUM(CASE WHEN q.selected_option_id IS NOT NULL THEN 1 ELSE 0 END) answered FROM sessions s LEFT JOIN session_questions q ON q.session_id=s.id WHERE s.profile_id=? GROUP BY s.id ORDER BY s.created_at DESC",
      [profileId]
    );
    return rows.map((row) => {
      const config: SessionConfig | null = row.config_json ? JSON.parse(String(row.config_json)) : null;
      return {
        id: String(row.id),
        state: row.state as SessionListItem["state"],
        currentOrdinal: Number(row.current_ordinal),
        total: Number(row.total),
        answered: Number(row.answered || 0),
        createdAt: Number(row.created_at),
        config,
        isOpenEnded: Boolean(config?.isOpenEnded || config?.mode === "continuous"),
      };
    });
  }

  async getSession(id: string): Promise<SessionView | null> {
    const sessions = await this.client.query<Record<string, unknown>>("SELECT * FROM sessions WHERE id=?", [id]);
    if (!sessions.length) return null;
    const sessionRow = sessions[0];
    const rows = await this.client.query<Record<string, unknown>>(
      "SELECT * FROM session_questions WHERE session_id=? ORDER BY ordinal",
      [id]
    );
    const config: SessionConfig | null = sessionRow.config_json
      ? JSON.parse(String(sessionRow.config_json))
      : null;
    return {
      id,
      state: sessionRow.state as SessionView["state"],
      currentOrdinal: Number(sessionRow.current_ordinal),
      config,
      questions: rows.map((row) => ({
        id: String(row.id),
        sessionId: id,
        ordinal: Number(row.ordinal),
        selectedOptionId: row.selected_option_id ? String(row.selected_option_id) : null,
        confidence: row.confidence as SessionQuestion["confidence"],
        visited: Boolean(row.visited),
        activeMs: Number(row.active_ms),
        snapshot: JSON.parse(String(row.snapshot_json)),
        optionOrder: JSON.parse(String(row.option_order_json)),
      })),
    };
  }

  async startOrResumeSession(id: string) {
    await this.client.batch([
      { sql: "UPDATE sessions SET state='PAUSED' WHERE state='RUNNING' AND id<>?", bind: [id] },
      {
        sql: "UPDATE sessions SET state='RUNNING', started_at=COALESCE(started_at,?) WHERE id=? AND state IN ('CREATED','PAUSED')",
        bind: [Date.now(), id],
      },
    ]);
  }

  async saveAnswer(
    sessionId: string,
    sessionQuestionId: string,
    optionId: string | null,
    confidence: SessionQuestion["confidence"],
    activeMs: number,
    ordinal: number
  ) {
    // Record first selection and update change count
    const [curr] = await this.client.query<{ selected_option_id: string | null; first_selected_option_id: string | null }>(
      "SELECT selected_option_id, first_selected_option_id FROM session_questions WHERE id=?",
      [sessionQuestionId]
    );

    const isFirstChoice = !curr || curr.first_selected_option_id === null;
    const isChange = curr && curr.selected_option_id !== null && curr.selected_option_id !== optionId;

    await this.client.batch([
      {
        sql: `UPDATE session_questions 
              SET selected_option_id=?,
                  confidence=?,
                  visited=1,
                  active_ms=active_ms+?,
                  first_selected_option_id=COALESCE(first_selected_option_id, ?),
                  change_count=change_count + ${isChange ? 1 : 0}
              WHERE id=? AND session_id=? AND (SELECT state FROM sessions WHERE id=?)='RUNNING'`,
        bind: [
          optionId,
          confidence,
          Math.max(0, Math.round(activeMs)),
          isFirstChoice ? optionId : null,
          sessionQuestionId,
          sessionId,
          sessionId,
        ],
      },
      {
        sql: "UPDATE sessions SET current_ordinal=?,active_ms=active_ms+? WHERE id=? AND state='RUNNING'",
        bind: [ordinal, Math.max(0, Math.round(activeMs)), sessionId],
      },
      {
        sql: "INSERT INTO attempt_events(id, session_id, session_question_id, kind, payload_json, occurred_at) VALUES(?,?,?,?,?,?)",
        bind: [
          crypto.randomUUID(),
          sessionId,
          sessionQuestionId,
          optionId === null ? "clear" : "answer",
          JSON.stringify({ optionId, confidence }),
          Date.now(),
        ],
      },
    ]);
  }

  async pauseSession(id: string) {
    await this.client.batch([{ sql: "UPDATE sessions SET state='PAUSED' WHERE id=? AND state='RUNNING'", bind: [id] }]);
  }

  async finishSession(id: string) {
    const view = await this.getSession(id);
    if (!view || view.state === "FINISHED") return;
    const now = Date.now();

    // For continuous/open-ended sessions, trim trailing questions that were loaded
    // but the user never answered (e.g. they reached their destination and finished)
    if (view.config?.isOpenEnded || view.config?.mode === "continuous") {
      const trimmedQuestions = [...view.questions];
      while (
        trimmedQuestions.length > 0 &&
        trimmedQuestions[trimmedQuestions.length - 1].selectedOptionId === null
      ) {
        const lastQ = trimmedQuestions.pop()!;
        await this.client.execute("DELETE FROM session_questions WHERE id=?", [lastQ.id]);
      }
      view.questions = trimmedQuestions;
    }

    if (view.questions.length === 0) {
      await this.client.batch([
        { sql: "UPDATE sessions SET state='FINISHED',finished_at=? WHERE id=?", bind: [now, id] },
      ]);
      return;
    }

    const previousReviews = await this.client.query<{
      question_id: string;
      stable_streak: number;
      interval_days: number;
    }>("SELECT question_id,stable_streak,interval_days FROM review_items");

    // Query any existing attempts for this session to reuse IDs and avoid duplicate key / FK mismatches
    const existingAttempts = await this.client.query<{ id: string; session_question_id: string }>(
      "SELECT id, session_question_id FROM attempts WHERE session_id=?",
      [id]
    );
    const existingAttemptMap = new Map(existingAttempts.map((a) => [a.session_question_id, a.id]));

    const statements = view.questions.flatMap((question) => {
      const result =
        question.selectedOptionId === null
          ? "unanswered"
          : question.selectedOptionId === question.snapshot.correctOptionId
          ? "correct"
          : "wrong";
      const existingAttemptId = existingAttemptMap.get(question.id);
      const attemptId = existingAttemptId || safeRandomUUID();
      const prevRev = previousReviews.find((item) => item.question_id === question.snapshot.id);
      const review = scheduleReview(
        { id: attemptId, result, visited: question.visited, confidence: question.confidence, finalizedAt: now },
        prevRev
          ? {
              stableStreak: Number(prevRev.stable_streak),
              intervalDays: Number(prevRev.interval_days),
            }
          : undefined
      );

      const attemptStmt = existingAttemptId
        ? {
            sql: "UPDATE attempts SET result=?, visited=?, confidence=?, active_ms=?, finalized_at=? WHERE id=?",
            bind: [result, question.visited ? 1 : 0, question.confidence, question.activeMs, now, attemptId],
          }
        : {
            sql: "INSERT INTO attempts(id,session_question_id,session_id,question_id,result,visited,confidence,active_ms,finalized_at) VALUES(?,?,?,?,?,?,?,?,?)",
            bind: [
              attemptId,
              question.id,
              id,
              question.snapshot.id,
              result,
              question.visited ? 1 : 0,
              question.confidence,
              question.activeMs,
              now,
            ],
          };

      return [
        attemptStmt,
        ...(review
          ? [
              {
                sql: "INSERT INTO review_items(question_id,due_at,priority,stable_streak,interval_days,last_attempt_id) VALUES(?,?,?,?,?,?) ON CONFLICT(question_id) DO UPDATE SET due_at=excluded.due_at,priority=excluded.priority,stable_streak=excluded.stable_streak,interval_days=excluded.interval_days,last_attempt_id=excluded.last_attempt_id",
                bind: [
                  question.snapshot.id,
                  review.dueAt,
                  review.priority,
                  review.stableStreak,
                  review.intervalDays,
                  attemptId,
                ],
              },
            ]
          : []),
      ];
    });

    await this.client.batch([
      ...statements,
      { sql: "UPDATE sessions SET state='FINISHED',finished_at=? WHERE id=?", bind: [now, id] },
    ]);
  }

  async rebuildReviewItems(): Promise<number> {
    const incompleteGroups = await this.client.query<{ id: string }>(
      "SELECT id FROM question_groups WHERE status='incomplete'"
    );
    const incompleteGroupIds = new Set(incompleteGroups.map((g) => g.id));

    const activeQuestions = await this.client.query<{ id: string; group_id: string | null }>(
      "SELECT id, group_id FROM questions WHERE inactive_at IS NULL"
    );
    const eligibleQuestionIds = new Set(
      activeQuestions
        .filter((q) => !q.group_id || !incompleteGroupIds.has(q.group_id))
        .map((q) => q.id)
    );

    const allAttempts = await this.client.query<{
      id: string;
      question_id: string;
      result: "correct" | "wrong" | "unanswered";
      visited: number;
      confidence: "sure" | "doubtful" | "guess" | null;
      finalized_at: number;
    }>("SELECT id, question_id, result, visited, confidence, finalized_at FROM attempts ORDER BY finalized_at ASC");

    await this.client.execute("DELETE FROM review_items");

    const attemptsByQuestion = new Map<string, typeof allAttempts>();
    for (const a of allAttempts) {
      if (!eligibleQuestionIds.has(a.question_id)) continue;
      const list = attemptsByQuestion.get(a.question_id) || [];
      list.push(a);
      attemptsByQuestion.set(a.question_id, list);
    }

    let rebuiltCount = 0;
    const statements: Array<{ sql: string; bind: Array<string | number> }> = [];

    for (const [questionId, attempts] of attemptsByQuestion.entries()) {
      let previousReview: ReviewState | undefined;
      let lastReviewOutcome: ReturnType<typeof scheduleReview> = null;
      let lastAttemptId = "";

      for (const a of attempts) {
        lastAttemptId = a.id;
        const review = scheduleReview(
          {
            id: a.id,
            result: a.result,
            visited: Boolean(a.visited),
            confidence: a.confidence,
            finalizedAt: a.finalized_at,
          },
          previousReview
        );
        if (review) {
          lastReviewOutcome = review;
          previousReview = {
            stableStreak: review.stableStreak,
            intervalDays: review.intervalDays,
          };
        }
      }

      if (lastReviewOutcome && lastAttemptId) {
        statements.push({
          sql: "INSERT INTO review_items(question_id, due_at, priority, stable_streak, interval_days, last_attempt_id) VALUES(?,?,?,?,?,?)",
          bind: [
            questionId,
            lastReviewOutcome.dueAt,
            lastReviewOutcome.priority,
            lastReviewOutcome.stableStreak,
            lastReviewOutcome.intervalDays,
            lastAttemptId,
          ],
        });
        rebuiltCount++;
      }
    }

    if (statements.length > 0) {
      await this.client.batch(statements);
    }

    return rebuiltCount;
  }

  async dashboard(profileId: string) {
    const [questionCount] = await this.client.query<{ count: number }>(
      "SELECT COUNT(*) count FROM questions WHERE inactive_at IS NULL"
    );
    const [reviewCount] = await this.client.query<{ count: number }>(
      "SELECT COUNT(*) count FROM review_items WHERE due_at<=?",
      [Date.now()]
    );
    const sessions = await this.listSessions(profileId);

    const rows = await this.client.query<{
      result: "correct" | "wrong" | "unanswered";
      confidence: "sure" | "doubtful" | "guess" | null;
      subject: string;
    }>(
      `SELECT a.result, a.confidence, q.subject 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id 
       WHERE s.profile_id=? AND s.state='FINISHED'`,
      [profileId]
    );

    const profileSubjects = await this.client.query<{
      name: string;
      coefficient: number;
      target_percentage: number;
      question_count?: number;
      score_group?: string | null;
    }>("SELECT name, coefficient, target_percentage, question_count, score_group FROM subjects WHERE profile_id=?", [profileId]);

    const confidenceSimulation = simulateOverallConfidence(
      rows.map((row) => ({
        subject: canonicalizeSubject(row.subject),
        result: row.result,
        confidence: row.confidence,
      })),
      profileSubjects.map((s) => ({
        name: canonicalizeSubject(s.name),
        coefficient: Number(s.coefficient),
        targetPercentage: Number(s.target_percentage),
        questionCount: Number(s.question_count ?? 25),
        scoreGroup: s.score_group ?? null,
      }))
    );

    return {
      questionCount: Number(questionCount?.count || 0),
      reviewCount: Number(reviewCount?.count || 0),
      sessions,
      confidenceSimulation,
    };
  }

  async listDueReviews() {
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT r.*, q.subject, q.chapter, q.topic, q.content_json, a.confidence as attempt_confidence 
       FROM review_items r 
       JOIN questions q ON q.id=r.question_id 
       LEFT JOIN attempts a ON a.id=r.last_attempt_id 
       WHERE r.due_at<=? AND q.inactive_at IS NULL 
       ORDER BY r.priority, r.due_at LIMIT 100`,
      [Date.now()]
    );
    return rows.map((row) => {
      let priority = Number(row.priority);
      // Promote guess attempts to priority 4 if previously mapped to 2
      if (priority === 2 && row.attempt_confidence === "guess") {
        priority = 4;
      }
      return {
        questionId: String(row.question_id),
        subject: String(row.subject),
        chapter: row.chapter ? String(row.chapter) : null,
        topic: row.topic ? String(row.topic) : null,
        content: JSON.parse(String(row.content_json)),
        priority,
        confidence: (row.attempt_confidence as "sure" | "doubtful" | "guess" | null) ?? null,
        dueAt: Number(row.due_at),
      };
    });
  }

  async getReviewStats(profileId: string) {
    const [wrongRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(DISTINCT a.question_id) as count FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.result='wrong'",
      [profileId]
    );
    const [doubtfulRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(DISTINCT a.question_id) as count FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='doubtful'",
      [profileId]
    );
    const [guessRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(DISTINCT a.question_id) as count FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND a.confidence='guess'",
      [profileId]
    );
    const [skippedRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(DISTINCT a.question_id) as count FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE s.profile_id=? AND (a.selected_option_id IS NULL OR a.result='unanswered')",
      [profileId]
    );
    const [reviewedSessionsRow] = await this.client.query<{ count: number; total_ms: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(active_ms), 0) as total_ms FROM sessions WHERE profile_id=? AND state='FINISHED' AND json_extract(config_json, '$.mode')='due'",
      [profileId]
    );
    const [allFinishedRow] = await this.client.query<{ count: number; total_ms: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(active_ms), 0) as total_ms FROM sessions WHERE profile_id=? AND state='FINISHED'",
      [profileId]
    );
    const [dueTotalRow] = await this.client.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM review_items WHERE due_at<=?",
      [Date.now()]
    );

    const dCount = Number(doubtfulRow?.count || 0);
    const gCount = Number(guessRow?.count || 0);

    return {
      wrongCount: Number(wrongRow?.count || 0),
      doubtfulCount: dCount,
      guessCount: gCount,
      doubtfulTotalCount: dCount + gCount,
      skippedCount: Number(skippedRow?.count || 0),
      reviewedSessionsCount: Number(reviewedSessionsRow?.count || 0),
      reviewTimeMinutes: Math.round(Number(reviewedSessionsRow?.total_ms || allFinishedRow?.total_ms || 0) / 60000),
      allFinishedCount: Number(allFinishedRow?.count || 0),
      dueTotalCount: Number(dueTotalRow?.count || 0),
    };
  }

  async analytics(profileId: string, options?: { mode?: string; windowDays?: number }) {
    let whereClause = "WHERE s.profile_id=? AND s.state='FINISHED'";
    const params: Array<string | number> = [profileId];

    if (options?.mode && options.mode !== "all") {
      whereClause += " AND json_extract(s.config_json, '$.mode') = ?";
      params.push(options.mode);
    }

    if (options?.windowDays && options.windowDays > 0) {
      const windowStart = Date.now() - options.windowDays * 86_400_000;
      whereClause += " AND a.finalized_at >= ?";
      params.push(windowStart);
    }

    const rows = await this.client.query<{
      result: "correct" | "wrong" | "unanswered";
      visited: number;
      confidence: "sure" | "doubtful" | "guess" | null;
      subject: string;
      topic: string | null;
      active_ms: number;
      group_id: string | null;
    }>(
      `SELECT a.result, a.visited, a.confidence, q.subject, q.topic, a.active_ms, q.group_id 
       FROM attempts a 
       JOIN sessions s ON s.id=a.session_id 
       JOIN questions q ON q.id=a.question_id 
       ${whereClause}`,
      params
    );

    const profileSubjects = await this.client.query<{
      name: string;
      coefficient: number;
      target_percentage: number;
      question_count?: number;
      score_group?: string | null;
    }>("SELECT name, coefficient, target_percentage, question_count, score_group FROM subjects WHERE profile_id=?", [profileId]);
    const targetMap = new Map(profileSubjects.map((s) => [s.name, s.target_percentage]));
    const coeffMap = new Map(profileSubjects.map((s) => [s.name, s.coefficient]));
    const qCountMap = new Map(profileSubjects.map((s) => [s.name, s.question_count ?? 25]));

    const [profileRow] = await this.client.query<{ penalty_numerator: number; penalty_denominator: number }>(
      "SELECT penalty_numerator, penalty_denominator FROM profiles WHERE id=? LIMIT 1",
      [profileId]
    );
    const penaltyNum = profileRow?.penalty_numerator ?? 1;
    const penaltyDen = profileRow?.penalty_denominator ?? 3;

    const totals = { correct: 0, wrong: 0, unanswered: 0, unvisited: 0, total: rows.length };
    let totalActiveMs = 0;
    let groupActiveMs = 0;

    for (const row of rows) {
      totals[row.result] += 1;
      if (!row.visited) totals.unvisited += 1;
      totalActiveMs += Number(row.active_ms || 0);
      if (row.group_id) {
        groupActiveMs += Number(row.active_ms || 0);
      }
    }

    const confidenceSimulation = simulateOverallConfidence(
      rows.map((row) => ({
        subject: canonicalizeSubject(row.subject),
        result: row.result,
        confidence: row.confidence,
      })),
      profileSubjects.map((s) => ({
        name: canonicalizeSubject(s.name),
        coefficient: Number(s.coefficient),
        targetPercentage: Number(s.target_percentage),
        questionCount: Number(s.question_count ?? 25),
        scoreGroup: s.score_group ?? null,
      }))
    );

    const bySubject = [...new Set(rows.map((row) => canonicalizeSubject(row.subject)))].map((subject) => {
      const items = rows.filter((row) => isSameSubject(row.subject, subject));
      const correct = items.filter((row) => row.result === "correct").length;
      const wrong = items.filter((row) => row.result === "wrong").length;
      const total = items.length;
      const rawPct = total > 0 ? (correct / total) * 100 : null;
      const penalizedPct = total > 0 && penaltyNum > 0
        ? ((correct - (wrong * penaltyNum) / penaltyDen) / total) * 100
        : rawPct;
      const matchingProfileSub = profileSubjects.find((ps) => isSameSubject(ps.name, subject));
      const target = matchingProfileSub ? matchingProfileSub.target_percentage : (targetMap.get(subject) ?? null);
      const coeff = matchingProfileSub ? matchingProfileSub.coefficient : (coeffMap.get(subject) ?? 1);
      const qCount = matchingProfileSub ? (matchingProfileSub.question_count ?? 25) : (qCountMap.get(subject) ?? 25);
      const targetGap = target !== null && penalizedPct !== null ? penalizedPct - target : null;
      const subjectSim = confidenceSimulation.subjects.find((s) => isSameSubject(s.subject, subject));

      return {
        subject,
        total,
        correct,
        wrong,
        percentage: penalizedPct !== null ? Math.round(penalizedPct * 10) / 10 : null,
        rawPercentage: rawPct !== null ? Math.round(rawPct * 10) / 10 : null,
        targetPercentage: target,
        targetGap: targetGap !== null ? Math.round(targetGap * 10) / 10 : null,
        coefficient: coeff,
        questionCount: qCount,
        scoreGroup: matchingProfileSub?.score_group ?? null,
        confidenceSimulation: subjectSim ?? null,
      };
    });

    const weakTopics = [...new Set(rows.map((row) => row.topic).filter(Boolean) as string[])]
      .map((topic) => {
        const items = rows.filter((row) => row.topic === topic);
        const wrong = items.filter((row) => row.result === "wrong").length;
        return {
          topic,
          total: items.length,
          wrong,
          errorRate: items.length ? Math.round((wrong / items.length) * 100) : 0,
        };
      })
      .filter((t) => t.total >= 3 && t.errorRate > 30)
      .sort((a, b) => b.errorRate - a.errorRate);

    return {
      totals,
      bySubject,
      weakTopics,
      confidenceSimulation,
      averageTimePerQuestionSec: rows.length ? Math.round(totalActiveMs / rows.length / 1000) : 0,
      groupReadingTotalSec: Math.round(groupActiveMs / 1000),
      standaloneTotalSec: Math.round((totalActiveMs - groupActiveMs) / 1000),
    };
  }

  async getSubjectStats(subject: string) {
    const allQuestions = await this.listQuestions({ limit: 10_000 });
    const questions = allQuestions.filter((q) => isSameSubject(q.subject, subject));
    if (questions.length === 0) {
      return {
        totalQuestions: 0,
        solvedCount: 0,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
        accuracyPercentage: 0,
        averageTimeSec: 0,
        chapters: [],
        topics: [],
      };
    }

    const qIds = questions.map((q) => q.id);
    const placeholders = qIds.map(() => "?").join(",");
    const attempts = await this.client.query<{
      result: "correct" | "wrong" | "unanswered";
      active_ms: number;
      question_id: string;
      finalized_at: number;
    }>(
      `SELECT a.result, a.active_ms, a.question_id, a.finalized_at FROM attempts a WHERE a.question_id IN (${placeholders}) ORDER BY a.finalized_at ASC`,
      qIds
    );

    const answeredAttempts = attempts.filter((a) => a.result === "correct" || a.result === "wrong");
    const solvedQuestionIds = new Set(answeredAttempts.map((a) => a.question_id));
    const solvedCount = solvedQuestionIds.size;
    const correctAttempts = attempts.filter((a) => a.result === "correct").length;
    const wrongAttempts = attempts.filter((a) => a.result === "wrong").length;
    const totalAnswered = correctAttempts + wrongAttempts;
    const accuracyPercentage = totalAnswered > 0 ? Math.round((correctAttempts / totalAnswered) * 100) : 0;
    const totalActiveMs = attempts.reduce((acc, a) => acc + Number(a.active_ms || 0), 0);
    const averageTimeSec = attempts.length > 0 ? Math.round(totalActiveMs / attempts.length / 1000) : 0;

    const chapterMap = new Map<string, { total: number; solved: number; correct: number }>();
    const topicMap = new Map<string, { chapter: string; total: number; solved: number; correct: number }>();

    for (const q of questions) {
      const c = q.chapter || "بدون فصل";
      const t = q.topic || "بدون موضوع";
      if (!chapterMap.has(c)) chapterMap.set(c, { total: 0, solved: 0, correct: 0 });
      chapterMap.get(c)!.total += 1;
      if (solvedQuestionIds.has(q.id)) {
        chapterMap.get(c)!.solved += 1;
      }

      if (!topicMap.has(t)) topicMap.set(t, { chapter: c, total: 0, solved: 0, correct: 0 });
      topicMap.get(t)!.total += 1;
      if (solvedQuestionIds.has(q.id)) {
        topicMap.get(t)!.solved += 1;
      }
    }

    for (const a of attempts) {
      const q = questions.find((item) => item.id === a.question_id);
      if (q && a.result === "correct") {
        const c = q.chapter || "بدون فصل";
        const t = q.topic || "بدون موضوع";
        if (chapterMap.has(c)) chapterMap.get(c)!.correct += 1;
        if (topicMap.has(t)) topicMap.get(t)!.correct += 1;
      }
    }

    const chapters = Array.from(chapterMap.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      solved: data.solved,
      percentage: data.total > 0 ? Math.round((data.solved / data.total) * 100) : 0,
      accuracy: data.solved > 0 ? Math.round((data.correct / data.solved) * 100) : 0,
    }));

    const topics = Array.from(topicMap.entries()).map(([name, data]) => ({
      name,
      chapter: data.chapter,
      total: data.total,
      solved: data.solved,
      percentage: data.total > 0 ? Math.round((data.solved / data.total) * 100) : 0,
      accuracy: data.solved > 0 ? Math.round((data.correct / data.solved) * 100) : 0,
    }));

    return {
      totalQuestions: questions.length,
      solvedCount,
      correctCount: correctAttempts,
      wrongCount: wrongAttempts,
      unansweredCount: Math.max(0, questions.length - solvedCount),
      accuracyPercentage,
      averageTimeSec,
      chapters,
      topics,
    };
  }

  async getTopicStats(subject: string, topic: string) {
    const questions = (await this.listQuestions({ subject, limit: 10_000 })).filter(
      (q) => (q.topic || "بدون موضوع") === topic
    );
    if (questions.length === 0) {
      return {
        totalQuestions: 0,
        solvedCount: 0,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
        accuracyPercentage: 0,
        averageTimeSec: 0,
      };
    }

    const attempts = await this.client.query<{
      result: "correct" | "wrong" | "unanswered";
      active_ms: number;
      question_id: string;
    }>(
      `SELECT a.result, a.active_ms, a.question_id FROM attempts a WHERE a.question_id IN (${questions.map(() => "?").join(",")})`,
      questions.map((question) => question.id)
    );

    const answeredAttempts = attempts.filter((a) => a.result === "correct" || a.result === "wrong");
    const solvedQuestionIds = new Set(answeredAttempts.map((a) => a.question_id));
    const correctAttempts = attempts.filter((a) => a.result === "correct").length;
    const wrongAttempts = attempts.filter((a) => a.result === "wrong").length;
    const totalAnswered = correctAttempts + wrongAttempts;
    const accuracyPercentage = totalAnswered > 0 ? Math.round((correctAttempts / totalAnswered) * 100) : 0;
    const totalActiveMs = attempts.reduce((acc, a) => acc + Number(a.active_ms || 0), 0);
    const averageTimeSec = attempts.length > 0 ? Math.round(totalActiveMs / attempts.length / 1000) : 0;

    return {
      totalQuestions: questions.length,
      solvedCount: solvedQuestionIds.size,
      correctCount: correctAttempts,
      wrongCount: wrongAttempts,
      unansweredCount: Math.max(0, questions.length - solvedQuestionIds.size),
      accuracyPercentage,
      averageTimeSec,
    };
  }

  async deleteAllData(): Promise<void> {
    const tables = [
      "review_items",
      "attempt_events",
      "attempts",
      "session_questions",
      "sessions",
      "question_reports",
      "question_media",
      "media_files",
      "question_options",
      "question_revisions",
      "questions",
      "question_groups",
      "sources",
      "topics",
      "chapters",
      "offline_subjects",
      "subjects",
      "profiles",
      "applied_mutations",
      "outbox",
      "sync_state",
      "sync_conflicts",
      "sync_dirty_entities",
      "sync_entity_cache",
      "owners",
    ];

    const statements: SqlStatement[] = [
      { sql: "PRAGMA foreign_keys=OFF;" },
      ...tables.map((t) => ({ sql: `DELETE FROM ${t};` })),
      { sql: "PRAGMA foreign_keys=ON;" },
    ];

    try {
      await this.client.batch(statements);
    } catch {
      // Fallback row-by-row if any table doesn't exist
      for (const stmt of statements) {
        try {
          await this.client.execute(stmt.sql, stmt.bind);
        } catch {
          // ignore table not found
        }
      }
    }
  }
}

let singleton: AppDatabase | null = null;
export function getAppDatabase() {
  return (singleton ||= new AppDatabase());
}
