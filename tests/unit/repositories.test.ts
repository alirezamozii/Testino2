import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { QuestionRepository } from "@/database/repositories/question-repository";
import { ProfileRepository } from "@/database/repositories/profile-repository";
import { OutboxRepository } from "@/database/repositories/outbox-repository";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";

describe("Repositories (TASK-005 & TASK-006)", () => {
  async function setup() {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    const questionRepo = new QuestionRepository(db);
    const profileRepo = new ProfileRepository(db);
    const outboxRepo = new OutboxRepository(db);

    return { db, questionRepo, profileRepo, outboxRepo };
  }

  describe("TASK-005: QuestionRepository and Outbox Atomicity", () => {
    it("enforces owner scope on all queries and mutations", async () => {
      const { questionRepo } = await setup();

      await expect(questionRepo.search("")).rejects.toThrowError(UnauthorizedError);
      await expect(questionRepo.get("", "q-1")).rejects.toThrowError(UnauthorizedError);
      await expect(
        questionRepo.save(
          "",
          {
            subject: "ریاضی",
            content: [{ type: "text", value: "سؤال ۱" }],
            options: [{ key: "a", content: [{ type: "text", value: "۱" }] }],
          },
          { ownerId: "", operationId: "op-1" }
        )
      ).rejects.toThrowError(UnauthorizedError);
    });

    it("saves question, options, revision snapshot, outbox, and applied_mutations atomically", async () => {
      const { db, questionRepo, outboxRepo } = await setup();
      const ownerId = "user-123";
      const opId = crypto.randomUUID();

      const { questionId, revision } = await questionRepo.save(
        ownerId,
        {
          subject: "اقتصاد",
          content: [{ type: "text", value: "تعریف تورم چیست؟" }],
          options: [
            { key: "a", content: [{ type: "text", value: "رشد قیمت‌ها" }] },
            { key: "b", content: [{ type: "text", value: "کاهش تقاضا" }] },
          ],
          correctOptionKey: "a",
          shuffleSafe: true,
        },
        { ownerId, operationId: opId }
      );

      expect(questionId).toBeDefined();
      expect(revision).toBe(1);

      // Verify question stored
      const question = await questionRepo.get(ownerId, questionId);
      expect(question).not.toBeNull();
      expect(question?.subject).toBe("اقتصاد");
      expect(question?.options.length).toBe(2);
      expect(question?.correctOptionId).toBe(question?.options[0].id);

      // Verify revision snapshot stored
      const revisions = await db.query<{ version: number }>(
        "SELECT version FROM question_revisions WHERE question_id=?",
        [questionId]
      );
      expect(revisions.length).toBe(1);
      expect(revisions[0].version).toBe(1);

      // Verify outbox mutation stored
      const pendingOutbox = await outboxRepo.listPending(ownerId);
      expect(pendingOutbox.some((item) => item.entity_id === questionId)).toBe(true);

      // Verify applied_mutations stored
      const applied = await outboxRepo.isMutationApplied(ownerId, opId);
      expect(applied).toBe(true);
    });

    it("throws ConflictError when expectedRevision does not match", async () => {
      const { questionRepo } = await setup();
      const ownerId = "user-123";

      // Create first version (rev 1)
      const { questionId } = await questionRepo.save(
        ownerId,
        {
          subject: "مدیریت",
          content: [{ type: "text", value: "تئوری سازمان" }],
          options: [{ key: "a", content: [{ type: "text", value: "گزینه ۱" }] }],
        },
        { ownerId, operationId: "op-create" }
      );

      // Try updating with incorrect expectedRevision (expecting 2, but is 1)
      await expect(
        questionRepo.save(
          ownerId,
          {
            id: questionId,
            subject: "مدیریت",
            content: [{ type: "text", value: "تئوری سازمان ویرایش شده" }],
            options: [{ key: "a", content: [{ type: "text", value: "گزینه ۱" }] }],
          },
          { ownerId, operationId: "op-edit", expectedRevision: 2 }
        )
      ).rejects.toThrowError(ConflictError);

      // Updating with correct expectedRevision (1) succeeds and bumps to revision 2
      const updated = await questionRepo.save(
        ownerId,
        {
          id: questionId,
          subject: "مدیریت",
          content: [{ type: "text", value: "تئوری سازمان ویرایش شده" }],
          options: [{ key: "a", content: [{ type: "text", value: "گزینه ۱" }] }],
        },
        { ownerId, operationId: "op-edit-ok", expectedRevision: 1 }
      );

      expect(updated.revision).toBe(2);
    });

    it("supports cursor pagination and filtered count query", async () => {
      const { questionRepo } = await setup();
      const ownerId = "user-123";

      // Insert 5 questions
      for (let i = 1; i <= 5; i++) {
        await questionRepo.save(
          ownerId,
          {
            subject: i <= 3 ? "ریاضی" : "آمار",
            content: [{ type: "text", value: `سؤال شماره ${i}` }],
            options: [{ key: "a", content: [{ type: "text", value: "گزینه ۱" }] }],
          },
          { ownerId, operationId: `seed-${i}` }
        );
      }

      // Query with limit 2
      const page1 = await questionRepo.search(ownerId, { limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(5);
      expect(page1.nextCursor).not.toBeNull();

      // Query next page with cursor
      const cursorData = JSON.parse(Buffer.from(page1.nextCursor!, "base64").toString("utf-8"));
      const page2 = await questionRepo.search(ownerId, { limit: 2, cursor: cursorData });
      expect(page2.items.length).toBe(2);
      expect(page2.total).toBe(5);

      // Filter by subject
      const mathQuestions = await questionRepo.search(ownerId, { subject: "ریاضی" });
      expect(mathQuestions.items.length).toBe(3);
      expect(mathQuestions.total).toBe(3);
    });

    it("archives question by setting inactive_at and excludes it from search results", async () => {
      const { questionRepo } = await setup();
      const ownerId = "user-123";

      const { questionId } = await questionRepo.save(
        ownerId,
        {
          subject: "فیزیک",
          content: [{ type: "text", value: "سؤال تست برای آرشیو" }],
          options: [{ key: "a", content: [{ type: "text", value: "گزینه ۱" }] }],
        },
        { ownerId, operationId: "op-create-arch" }
      );

      const before = await questionRepo.search(ownerId, { subject: "فیزیک" });
      expect(before.items.some((q) => q.id === questionId)).toBe(true);

      await questionRepo.archive(ownerId, questionId, { ownerId, operationId: "op-archive" });

      const after = await questionRepo.search(ownerId, { subject: "فیزیک" });
      expect(after.items.some((q) => q.id === questionId)).toBe(false);
    });
  });

  describe("TASK-006: Profiles and Taxonomy Hierarchy", () => {
    it("creates two independent profiles with their own subjects and preserves history", async () => {
      const { profileRepo } = await setup();
      const ownerId = "user-123";

      const p1 = await profileRepo.save(
        ownerId,
        {
          name: "کنکور ارشد ۱۴۰۵",
          targetTrack: "فناوری اطلاعات",
          penaltyNumerator: 1,
          penaltyDenominator: 3,
          defaultTimerMode: "active",
          subjects: [
            { name: "مدیریت عمومی", coefficient: 2, targetPercentage: 75 },
            { name: "ریاضی و آمار", coefficient: 3, targetPercentage: 60 },
          ],
        },
        { ownerId, operationId: "prof-1" }
      );

      const p2 = await profileRepo.save(
        ownerId,
        {
          name: "آزمون دکتری",
          targetTrack: "سیستم‌های اطلاعاتی",
          penaltyNumerator: 0,
          penaltyDenominator: 1,
          defaultTimerMode: "wall",
          subjects: [
            { name: "تئوری پیشرفته", coefficient: 4, targetPercentage: 80 },
            { name: "زبان تخصصی", coefficient: 0, targetPercentage: 50 }, // coefficient 0
          ],
        },
        { ownerId, operationId: "prof-2" }
      );

      const list = await profileRepo.list(ownerId);
      expect(list.length).toBe(2);

      const profile1 = await profileRepo.get(ownerId, p1.profileId);
      expect(profile1?.name).toBe("کنکور ارشد ۱۴۰۵");
      expect(profile1?.subjects.length).toBe(2);

      const profile2 = await profileRepo.get(ownerId, p2.profileId);
      expect(profile2?.name).toBe("آزمون دکتری");
      expect(profile2?.subjects.find((s) => s.name === "زبان عمومی و تخصصی")?.coefficient).toBe(0);
    });

    it("creates chapters and topics with normalized uniqueness per parent", async () => {
      const { profileRepo } = await setup();
      const ownerId = "user-123";

      const { profileId } = await profileRepo.save(
        ownerId,
        {
          name: "پروفایل تست",
          subjects: [{ name: "فیزیک", coefficient: 2, targetPercentage: 70 }],
        },
        { ownerId, operationId: "p-tax" }
      );

      const profile = await profileRepo.get(ownerId, profileId);
      const subjectId = profile!.subjects[0].id;

      // Add chapter 1
      const ch1Id = await profileRepo.addChapter(
        ownerId,
        {
          subjectId,
          name: "حرکت‌شناسی",
          position: 0,
        },
        { ownerId, operationId: "ch-1" }
      );
      expect(ch1Id).toBeDefined();

      // Adding duplicate chapter with Persian normalization (ي -> ی) should fail
      await expect(
        profileRepo.addChapter(
          ownerId,
          {
            subjectId,
            name: "حرکت‌شناسي", // with arabic ي
            position: 1,
          },
          { ownerId, operationId: "ch-dup" }
        )
      ).rejects.toThrowError(ValidationError);

      // Add topic to chapter 1
      const top1Id = await profileRepo.addTopic(
        ownerId,
        {
          chapterId: ch1Id,
          name: "سقوط آزاد",
          position: 0,
          targetSeconds: 120,
        },
        { ownerId, operationId: "top-1" }
      );
      expect(top1Id).toBeDefined();

      // Duplicate topic under same chapter fails
      await expect(
        profileRepo.addTopic(
          ownerId,
          {
            chapterId: ch1Id,
            name: "سقوط آزاد  ",
            position: 1,
          },
          { ownerId, operationId: "top-dup" }
        )
      ).rejects.toThrowError(ValidationError);

      // List taxonomy returns complete nested tree
      const taxonomy = await profileRepo.listTaxonomy(ownerId, profileId);
      expect(taxonomy.length).toBe(1);
      expect(taxonomy[0].chapters.length).toBe(1);
      expect(taxonomy[0].chapters[0].name).toBe("حرکت‌شناسی");
      expect(taxonomy[0].chapters[0].topics.length).toBe(1);
      expect(taxonomy[0].chapters[0].topics[0].name).toBe("سقوط آزاد");
    });
  });
});
