import type { DatabasePort, CommandContext } from "../ports";
import type { ChapterRow, ProfileRow, SubjectRow, TopicRow } from "../mappers";
import type { Profile } from "../app-database";
import {
  ProfileDraftSchema,
  normalizeTaxonomyName,
  type ProfileDraftInput,
  type ChapterInput,
  type TopicInput,
} from "@/features/profiles/domain/profile-schema";
import { OutboxRepository } from "./outbox-repository";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { buildScoringGroups } from "@/features/profiles/domain/score-groups";
import { canonicalizeSubject, canonicalizeSubjectRecords } from "@/features/questions/domain/subject-registry";

export interface TaxonomyHierarchy {
  subject: { id: string; name: string; coefficient: number; targetPercentage: number; questionCount: number; scoreGroup: string | null };
  chapters: Array<{
    id: string;
    name: string;
    position: number;
    topics: Array<{ id: string; name: string; position: number; targetSeconds: number | null }>;
  }>;
}

export class ProfileRepository {
  private outbox: OutboxRepository;

  constructor(private db: DatabasePort) {
    this.outbox = new OutboxRepository(db);
  }

  private assertOwner(ownerId: string): void {
    if (!ownerId || typeof ownerId !== "string" || !ownerId.trim()) {
      throw new UnauthorizedError("شناسهٔ مالک برای عملیات پروفایل الزامی است.");
    }
  }

  async list(ownerId: string): Promise<Profile[]> {
    this.assertOwner(ownerId);
    const profiles = await this.db.query<ProfileRow>(
      "SELECT * FROM profiles WHERE inactive_at IS NULL ORDER BY created_at ASC"
    );
    if (!profiles.length) return [];

    const subjects = await this.db.query<SubjectRow>(
      "SELECT * FROM subjects ORDER BY created_at ASC"
    );

    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      targetTrack: p.target_track,
      penaltyNumerator: p.penalty_numerator,
      penaltyDenominator: p.penalty_denominator,
      defaultTimerMode: p.default_timer_mode || "active",
      subjects: canonicalizeSubjectRecords(subjects
        .filter((s) => s.profile_id === p.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          coefficient: Number(s.coefficient),
          targetPercentage: Number(s.target_percentage),
          questionCount: Number(s.question_count ?? 25),
          scoreGroup: s.score_group ?? null,
        }))),
    }));
  }

  async get(ownerId: string, id: string): Promise<Profile | null> {
    this.assertOwner(ownerId);
    const profiles = await this.db.query<ProfileRow>(
      "SELECT * FROM profiles WHERE id=? AND inactive_at IS NULL LIMIT 1",
      [id]
    );
    if (!profiles.length) return null;

    const subjects = await this.db.query<SubjectRow>(
      "SELECT * FROM subjects WHERE profile_id=? ORDER BY created_at ASC",
      [id]
    );

    const p = profiles[0];
    return {
      id: p.id,
      name: p.name,
      targetTrack: p.target_track,
      penaltyNumerator: p.penalty_numerator,
      penaltyDenominator: p.penalty_denominator,
      defaultTimerMode: p.default_timer_mode || "active",
      subjects: canonicalizeSubjectRecords(subjects.map((s) => ({
        id: s.id,
        name: s.name,
        coefficient: Number(s.coefficient),
        targetPercentage: Number(s.target_percentage),
        questionCount: Number(s.question_count ?? 25),
        scoreGroup: s.score_group ?? null,
      }))),
    };
  }

  async save(
    ownerId: string,
    draft: ProfileDraftInput,
    context: CommandContext
  ): Promise<{ profileId: string; revision: number }> {
    this.assertOwner(ownerId);
    const validated = ProfileDraftSchema.parse(draft);
    if (canonicalizeSubjectRecords(validated.subjects).length !== validated.subjects.length) {
      throw new ValidationError("یک درس با نام‌های هم‌معنی بیش از یک‌بار وارد شده است.");
    }
    const invalidGroup = buildScoringGroups(validated.subjects).find((group) => group.coefficientMismatch);
    if (invalidGroup) {
      throw new ValidationError(`ضریب اعضای گروه محاسباتی «${invalidGroup.label}» باید یکسان باشد.`);
    }

    if (context.operationId) {
      const alreadyDone = await this.outbox.isMutationApplied(ownerId, context.operationId);
      if (alreadyDone && validated.id) {
        const existing = await this.get(ownerId, validated.id);
        if (existing) return { profileId: existing.id, revision: 1 };
      }
    }

    const profileId = validated.id || crypto.randomUUID();
    const isNew = !validated.id;
    let targetRevision = 1;

    if (!isNew) {
      const existing = await this.db.query<ProfileRow>(
        "SELECT id, revision FROM profiles WHERE id=? LIMIT 1",
        [profileId]
      );
      if (existing.length) {
        const currentRevision = Number(existing[0].revision || 1);
        if (context.expectedRevision !== undefined && context.expectedRevision !== currentRevision) {
          throw new ConflictError(
            `تعارض در ذخیره پروفایل: نسخهٔ موردانتظار (${context.expectedRevision}) با نسخهٔ جاری (${currentRevision}) مطابقت ندارد.`
          );
        }
        targetRevision = currentRevision + 1;
      }
    }

    const now = context.clock ? context.clock.utcNow() : Date.now();

    await this.db.transaction(async (trx) => {
      // Upsert profile
      await trx.execute(
        `INSERT INTO profiles(id, name, target_track, penalty_numerator, penalty_denominator, created_at)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           target_track=excluded.target_track,
           penalty_numerator=excluded.penalty_numerator,
           penalty_denominator=excluded.penalty_denominator`,
        [
          profileId,
          validated.name.trim(),
          validated.targetTrack?.trim() || null,
          validated.penaltyNumerator,
          validated.penaltyDenominator,
          now,
        ]
      );

      // Upsert subjects
      for (const subj of validated.subjects) {
        const subjectId = subj.id || crypto.randomUUID();
        const questionCount = subj.questionCount ?? 25;
        await trx.execute(
          `INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, question_count, score_group, created_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, name) DO UPDATE SET
             coefficient=excluded.coefficient,
             target_percentage=excluded.target_percentage,
             question_count=excluded.question_count,
             score_group=excluded.score_group`,
          [subjectId, profileId, canonicalizeSubject(subj.name), subj.coefficient, subj.targetPercentage, questionCount, subj.scoreGroup?.trim() || null, now]
        );
      }

      // Outbox
      await this.outbox.enqueue(
        ownerId,
        {
          mutationId: context.operationId || crypto.randomUUID(),
          entityType: "profile",
          entityId: profileId,
          baseVersion: targetRevision,
          payload: validated,
        },
        trx
      );

      // Applied mutations
      if (context.operationId) {
        await this.outbox.recordAppliedMutation(
          ownerId,
          context.operationId,
          { profileId, revision: targetRevision },
          trx
        );
      }
    });

    return { profileId, revision: targetRevision };
  }

  async addChapter(ownerId: string, input: ChapterInput, context: CommandContext): Promise<string> {
    this.assertOwner(ownerId);
    const chapterId = input.id || crypto.randomUUID();
    const normalizedName = normalizeTaxonomyName(input.name);

    if (!normalizedName) {
      throw new ValidationError("نام فصل معتبر نیست.");
    }

    // Check uniqueness within subject
    const existing = await this.db.query<{ id: string }>(
      "SELECT id FROM chapters WHERE subject_id=? AND normalized_name=? AND inactive_at IS NULL LIMIT 1",
      [input.subjectId, normalizedName]
    );
    if (existing.length) {
      throw new ValidationError(`فصلی با نام «${input.name}» قبلاً در این درس ثبت شده است.`);
    }

    const now = context.clock ? context.clock.utcNow() : Date.now();

    await this.db.transaction(async (trx) => {
      await trx.execute(
        `INSERT INTO chapters(id, subject_id, name, normalized_name, position, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [chapterId, input.subjectId, input.name.trim(), normalizedName, input.position ?? 0, now, now]
      );

      await this.outbox.enqueue(
        ownerId,
        {
          mutationId: context.operationId || crypto.randomUUID(),
          entityType: "chapter",
          entityId: chapterId,
          payload: { chapterId, subjectId: input.subjectId, name: input.name, normalizedName },
        },
        trx
      );
    });

    return chapterId;
  }

  async addTopic(ownerId: string, input: TopicInput, context: CommandContext): Promise<string> {
    this.assertOwner(ownerId);
    const topicId = input.id || crypto.randomUUID();
    const normalizedName = normalizeTaxonomyName(input.name);

    if (!normalizedName) {
      throw new ValidationError("نام موضوع معتبر نیست.");
    }

    // Check uniqueness within chapter
    const existing = await this.db.query<{ id: string }>(
      "SELECT id FROM topics WHERE chapter_id=? AND normalized_name=? AND inactive_at IS NULL LIMIT 1",
      [input.chapterId, normalizedName]
    );
    if (existing.length) {
      throw new ValidationError(`موضوعی با نام «${input.name}» قبلاً در این فصل ثبت شده است.`);
    }

    const now = context.clock ? context.clock.utcNow() : Date.now();

    await this.db.transaction(async (trx) => {
      await trx.execute(
        `INSERT INTO topics(id, chapter_id, name, normalized_name, position, target_seconds, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          topicId,
          input.chapterId,
          input.name.trim(),
          normalizedName,
          input.position ?? 0,
          input.targetSeconds ?? null,
          now,
          now,
        ]
      );

      await this.outbox.enqueue(
        ownerId,
        {
          mutationId: context.operationId || crypto.randomUUID(),
          entityType: "topic",
          entityId: topicId,
          payload: { topicId, chapterId: input.chapterId, name: input.name, normalizedName },
        },
        trx
      );
    });

    return topicId;
  }

  async listTaxonomy(ownerId: string, profileId: string): Promise<TaxonomyHierarchy[]> {
    this.assertOwner(ownerId);
    const subjects = await this.db.query<SubjectRow>(
      "SELECT * FROM subjects WHERE profile_id=? ORDER BY created_at ASC",
      [profileId]
    );

    const result: TaxonomyHierarchy[] = [];

    for (const subj of subjects) {
      const chapters = await this.db.query<ChapterRow>(
        "SELECT * FROM chapters WHERE subject_id=? AND inactive_at IS NULL ORDER BY position ASC, created_at ASC",
        [subj.id]
      );

      const chapterList: TaxonomyHierarchy["chapters"] = [];

      for (const ch of chapters) {
        const topics = await this.db.query<TopicRow>(
          "SELECT * FROM topics WHERE chapter_id=? AND inactive_at IS NULL ORDER BY position ASC, created_at ASC",
          [ch.id]
        );

        chapterList.push({
          id: ch.id,
          name: ch.name,
          position: ch.position,
          topics: topics.map((t) => ({
            id: t.id,
            name: t.name,
            position: t.position,
            targetSeconds: t.target_seconds,
          })),
        });
      }

      result.push({
        subject: {
          id: subj.id,
          name: subj.name,
          coefficient: Number(subj.coefficient),
          targetPercentage: Number(subj.target_percentage),
          questionCount: Number(subj.question_count ?? 25),
          scoreGroup: subj.score_group ?? null,
        },
        chapters: chapterList,
      });
    }

    return result;
  }
}
