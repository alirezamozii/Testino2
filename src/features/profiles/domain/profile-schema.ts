import { z } from "zod";

export const ScorePolicySchema = z.object({
  penaltyNumerator: z.number().int().min(0).default(1),
  penaltyDenominator: z.number().int().min(1).default(3),
  policyVersion: z.literal(1).default(1),
});

export type ScorePolicy = z.infer<typeof ScorePolicySchema>;

export const SubjectInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "نام درس الزامی است").max(200, "نام درس حداکثر ۲۰۰ کاراکتر است"),
  coefficient: z.number().min(0, "ضریب نمی‌تواند منفی باشد").max(100, "حداکثر ضریب ۱۰۰ است"),
  targetPercentage: z.number().min(0, "درصد هدف نمی‌تواند کمتر از ۰ باشد").max(100, "درصد هدف حداکثر ۱۰۰ است"),
  questionCount: z.number().int().min(1, "تعداد سؤالات باید حداقل ۱ باشد").max(200, "تعداد سؤالات حداکثر ۲۰۰ است").default(25),
  scoreGroup: z.string().trim().max(200, "نام گروه محاسباتی حداکثر ۲۰۰ کاراکتر است").optional().nullable(),
});

export type SubjectInput = z.infer<typeof SubjectInputSchema>;

export const ProfileDraftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "نام پروفایل الزامی است").max(200, "نام پروفایل حداکثر ۲۰۰ کاراکتر است"),
  targetTrack: z.string().trim().max(200).optional().nullable(),
  penaltyNumerator: z.number().int().min(0).default(1),
  penaltyDenominator: z.number().int().min(1).default(3),
  defaultTimerMode: z.enum(["active", "wall"]).default("active"),
  subjects: z.array(SubjectInputSchema).min(1, "حداقل یک درس باید در پروفایل تعریف شود"),
});

export type ProfileDraftInput = z.input<typeof ProfileDraftSchema>;
export type ProfileDraft = z.output<typeof ProfileDraftSchema>;

export const ChapterInputSchema = z.object({
  id: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  name: z.string().trim().min(1, "نام فصل الزامی است").max(200),
  position: z.number().int().min(0).default(0),
});

export type ChapterInput = z.infer<typeof ChapterInputSchema>;

export const TopicInputSchema = z.object({
  id: z.string().uuid().optional(),
  chapterId: z.string().uuid(),
  name: z.string().trim().min(1, "نام موضوع الزامی است").max(200),
  position: z.number().int().min(0).default(0),
  targetSeconds: z.number().int().positive("زمان هدف باید مثبت باشد").optional().nullable(),
});

export type TopicInput = z.infer<typeof TopicInputSchema>;

export function normalizeTaxonomyName(name: string): string {
  return name
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
