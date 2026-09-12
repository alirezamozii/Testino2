import type { DatabasePort, CommandContext } from "../ports";
import { mapQuestion, type QuestionOptionRow, type QuestionRow } from "../mappers";
import type { ContentBlock, StoredQuestion } from "@/features/questions/domain/question-schema";
import { computeContentHash } from "@/features/questions/domain/fingerprint";
import { OutboxRepository } from "./outbox-repository";
import { ConflictError, UnauthorizedError } from "@/lib/errors";

export interface QuestionFilter {
  subject?: string;
  chapter?: string;
  topic?: string;
  status?: "draft" | "published";
  query?: string;
  limit?: number; // max 50
  cursor?: { createdAt: number; id: string } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface SaveQuestionInput {
  id?: string;
  externalKey?: string;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  groupId?: string | null;
  groupPosition?: number | null;
  content: ContentBlock[];
  options: Array<{ id?: string; key: string; content: ContentBlock[] }>;
  correctOptionKey?: string | null;
  correctOptionId?: string | null;
  explanation?: ContentBlock[];
  shuffleSafe?: boolean;
}

function normalizeSearch(term: string): string {
  return term
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export class QuestionRepository {
  private outbox: OutboxRepository;

  constructor(private db: DatabasePort) {
    this.outbox = new OutboxRepository(db);
  }

  private assertOwner(ownerId: string): void {
    if (!ownerId || typeof ownerId !== "string" || !ownerId.trim()) {
      throw new UnauthorizedError("شناسهٔ مالک برای پرس‌وجوی بانک سؤال الزامی است.");
    }
  }

  async search(ownerId: string, filter: QuestionFilter = {}): Promise<PaginatedResult<StoredQuestion>> {
    this.assertOwner(ownerId);

    const limit = Math.min(Math.max(1, filter.limit || 50), 50);
    const baseWhereClauses = ["inactive_at IS NULL"];
    const baseParams: Array<string | number> = [];

    if (filter.subject) {
      baseWhereClauses.push("subject = ?");
      baseParams.push(filter.subject);
    }
    if (filter.chapter) {
      baseWhereClauses.push("chapter = ?");
      baseParams.push(filter.chapter);
    }
    if (filter.topic) {
      baseWhereClauses.push("topic = ?");
      baseParams.push(filter.topic);
    }
    if (filter.status) {
      baseWhereClauses.push("status = ?");
      baseParams.push(filter.status);
    }

    // Count query for total
    const countSql = `SELECT COUNT(*) as total FROM questions WHERE ${baseWhereClauses.join(" AND ")}`;
    const countRows = await this.db.query<{ total: number }>(countSql, baseParams);
    const total = countRows[0]?.total ? Number(countRows[0].total) : 0;

    // Cursor pagination (createdAt, id)
    const selectWhereClauses = [...baseWhereClauses];
    const selectParams: Array<string | number> = [...baseParams];

    if (filter.cursor) {
      selectWhereClauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
      selectParams.push(filter.cursor.createdAt, filter.cursor.createdAt, filter.cursor.id);
    }

    selectParams.push(limit + 1); // fetch limit + 1 to check if has next page
    const selectSql = `SELECT * FROM questions WHERE ${selectWhereClauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`;
    const rows = await this.db.query<QuestionRow>(selectSql, selectParams);

    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    if (!pageRows.length) {
      return { items: [], nextCursor: null, total };
    }

    const placeholders = pageRows.map(() => "?").join(",");
    const options = await this.db.query<QuestionOptionRow>(
      `SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY position`,
      pageRows.map((r) => r.id)
    );

    let items = pageRows.map((row) =>
      mapQuestion(row, options.filter((opt) => opt.question_id === row.id))
    );

    if (filter.query) {
      const q = normalizeSearch(filter.query);
      items = items.filter((item) => {
        const textInContent = item.content
          .map((b) => (b.type === "text" ? normalizeSearch(b.value) : ""))
          .join(" ");
        const textInSubject = normalizeSearch(item.subject);
        return textInContent.includes(q) || textInSubject.includes(q);
      });
    }

    let nextCursor: string | null = null;
    if (hasNext && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString("base64");
    }

    return {
      items,
      nextCursor,
      total,
    };
  }

  async get(ownerId: string, id: string): Promise<StoredQuestion | null> {
    this.assertOwner(ownerId);
    const rows = await this.db.query<QuestionRow>(
      "SELECT * FROM questions WHERE id=? AND inactive_at IS NULL LIMIT 1",
      [id]
    );
    if (!rows.length) return null;
    const options = await this.db.query<QuestionOptionRow>(
      "SELECT * FROM question_options WHERE question_id=? ORDER BY position",
      [id]
    );
    return mapQuestion(rows[0], options);
  }

  async save(
    ownerId: string,
    input: SaveQuestionInput,
    context: CommandContext
  ): Promise<{ questionId: string; revision: number }> {
    this.assertOwner(ownerId);

    // 1. Idempotency check with applied_mutations
    if (context.operationId) {
      const alreadyDone = await this.outbox.isMutationApplied(ownerId, context.operationId);
      if (alreadyDone && input.id) {
        const existing = await this.get(ownerId, input.id);
        if (existing) return { questionId: existing.id, revision: 1 };
      }
    }

    const questionId = input.id || crypto.randomUUID();
    const isNew = !input.id;
    let targetRevision = 1;

    // Check existing question & revision
    if (!isNew) {
      const existingRows = await this.db.query<QuestionRow>(
        "SELECT id, created_at FROM questions WHERE id=? LIMIT 1",
        [questionId]
      );
      if (existingRows.length) {
        const revisionRows = await this.db.query<{ max_ver: number }>(
          "SELECT COALESCE(MAX(version), 1) as max_ver FROM question_revisions WHERE question_id=?",
          [questionId]
        );
        const currentRevision = Number(revisionRows[0]?.max_ver || 1);

        if (context.expectedRevision !== undefined && context.expectedRevision !== currentRevision) {
          throw new ConflictError(
            `تعارض در ویرایش سؤال: نسخهٔ موردانتظار (${context.expectedRevision}) با نسخهٔ فعلی (${currentRevision}) مطابقت ندارد.`
          );
        }
        targetRevision = currentRevision + 1;
      }
    }

    const externalKey =
      input.externalKey || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const optionIds = new Map(
      input.options.map((opt) => [opt.key, opt.id || crypto.randomUUID()])
    );

    let correctOptionId: string | null = null;
    if (input.correctOptionId) {
      correctOptionId = input.correctOptionId;
    } else if (input.correctOptionKey) {
      correctOptionId = optionIds.get(input.correctOptionKey) || null;
    }

    const status = correctOptionId ? "published" : "draft";
    const now = context.clock ? context.clock.utcNow() : Date.now();

    // Calculate content hash for revision
    const contentHash = await computeContentHash({
      content: input.content,
      options: input.options.map((o) => ({ key: o.key, content: o.content })),
      subject: input.subject,
      shuffleSafe: Boolean(input.shuffleSafe),
    });

    // Run atomic transaction covering: entity + options + revision + outbox + applied_mutations
    await this.db.transaction(async (trx) => {
      // Upsert question
      await trx.execute(
        `INSERT INTO questions(
          id, external_key, subject, chapter, topic, group_id, group_position,
          content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject=excluded.subject,
          chapter=excluded.chapter,
          topic=excluded.topic,
          content_json=excluded.content_json,
          explanation_json=excluded.explanation_json,
          correct_option_id=excluded.correct_option_id,
          status=excluded.status,
          shuffle_safe=excluded.shuffle_safe`,
        [
          questionId,
          externalKey,
          input.subject.trim(),
          input.chapter?.trim() || null,
          input.topic?.trim() || null,
          input.groupId || null,
          input.groupPosition ?? null,
          JSON.stringify(input.content),
          JSON.stringify(input.explanation || []),
          correctOptionId,
          status,
          input.shuffleSafe ? 1 : 0,
          now,
        ]
      );

      // Options
      await trx.execute("DELETE FROM question_options WHERE question_id=?", [questionId]);
      for (let pos = 0; pos < input.options.length; pos++) {
        const opt = input.options[pos];
        await trx.execute(
          "INSERT INTO question_options(id, question_id, external_key, position, content_json) VALUES(?, ?, ?, ?, ?)",
          [optionIds.get(opt.key)!, questionId, opt.key, pos, JSON.stringify(opt.content)]
        );
      }

      // Snapshot for question revision
      const snapshot: StoredQuestion = {
        id: questionId,
        externalKey,
        subject: input.subject.trim(),
        chapter: input.chapter?.trim() || null,
        topic: input.topic?.trim() || null,
        groupId: input.groupId || null,
        groupPosition: input.groupPosition ?? null,
        content: input.content,
        options: input.options.map((opt, pos) => ({
          id: optionIds.get(opt.key)!,
          key: opt.key,
          content: opt.content,
          position: pos,
        })),
        correctOptionId,
        explanation: input.explanation || [],
        status,
        shuffleSafe: Boolean(input.shuffleSafe),
        createdAt: now,
      };

      await trx.execute(
        "INSERT INTO question_revisions(id, question_id, version, snapshot_json, content_hash, created_at) VALUES(?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), questionId, targetRevision, JSON.stringify(snapshot), contentHash, now]
      );

      // Atomic Outbox enqueue
      await this.outbox.enqueue(
        ownerId,
        {
          mutationId: context.operationId || crypto.randomUUID(),
          entityType: "question",
          entityId: questionId,
          baseVersion: targetRevision,
          payload: snapshot,
        },
        trx
      );

      // Atomic Applied Mutations
      if (context.operationId) {
        await this.outbox.recordAppliedMutation(
          ownerId,
          context.operationId,
          { questionId, revision: targetRevision },
          trx
        );
      }
    });

    return { questionId, revision: targetRevision };
  }

  async archive(ownerId: string, id: string, context: CommandContext): Promise<void> {
    this.assertOwner(ownerId);
    const now = context.clock ? context.clock.utcNow() : Date.now();

    await this.db.transaction(async (trx) => {
      await trx.execute("UPDATE questions SET inactive_at=? WHERE id=?", [now, id]);

      await this.outbox.enqueue(
        ownerId,
        {
          mutationId: context.operationId || crypto.randomUUID(),
          entityType: "question_archive",
          entityId: id,
          payload: { id, inactiveAt: now },
        },
        trx
      );

      if (context.operationId) {
        await this.outbox.recordAppliedMutation(ownerId, context.operationId, { id, archived: true }, trx);
      }
    });
  }
}
