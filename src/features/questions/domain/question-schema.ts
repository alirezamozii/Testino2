import { z } from "zod";

export const textBlockSchema = z.object({
  type: z.literal("text"),
  value: z.string().trim().min(1).max(20_000),
  direction: z.enum(["rtl", "ltr", "auto"]).optional(),
  emphasis: z.enum(["normal", "strong", "underline"]).optional(),
});

export const formulaBlockSchema = z.object({
  type: z.literal("formula"),
  latex: z.string().trim().min(1).max(10_000),
  display: z.boolean().default(false),
});

export const imageBlockSchema = z.object({
  type: z.literal("image"),
  mediaId: z.string().trim().min(1).optional(),
  mediaKey: z.string().trim().min(1).optional(),
  url: z.string().optional(),
  dataUrl: z.string().optional(),
  alt: z.string().trim().default("تصویر سوال"),
});

export const inlineCellSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().trim() }),
  z.object({ type: z.literal("formula"), latex: z.string().trim() }),
]);
export type InlineCell = z.infer<typeof inlineCellSchema>;

export const tableBlockSchema = z.object({
  type: z.literal("table"),
  headers: z.array(inlineCellSchema).min(1).max(20),
  rows: z.array(z.array(inlineCellSchema).min(1).max(20)).min(1).max(100),
  caption: z.string().trim().optional(),
}).superRefine((table, ctx) => {
  const colCount = table.headers.length;
  for (let i = 0; i < table.rows.length; i++) {
    if (table.rows[i].length !== colCount) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", i],
        message: `تعداد ستون‌های ردیف ${i + 1} (${table.rows[i].length}) با سرستون‌ها (${colCount}) مطابقت ندارد.`,
      });
    }
  }
});

export const chartBlockSchema = z.object({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "xy", "coordinate"]),
  labels: z.array(z.string().trim().min(1)).min(1).max(1000).optional(),
  series: z.array(z.object({
    name: z.string().trim().min(1),
    values: z.array(z.number().finite()),
  })).min(1).max(10).optional(),
  xRange: z.tuple([z.number(), z.number()]).optional(),
  yRange: z.tuple([z.number(), z.number()]).optional(),
  xLabel: z.string().trim().optional(),
  yLabel: z.string().trim().optional(),
  lines: z.array(z.object({
    label: z.string().trim().optional(),
    points: z.array(z.tuple([z.number(), z.number()])).min(2),
    color: z.string().optional(),
    dashed: z.boolean().optional(),
    strokeWidth: z.number().optional(),
    labelPosition: z.enum(["start", "end", "mid", "smart"]).optional(),
  })).optional(),
  regions: z.array(z.object({
    label: z.string().trim().optional(),
    points: z.array(z.tuple([z.number(), z.number()])).min(3),
    color: z.string().optional(),
    opacity: z.number().optional(),
  })).optional(),
  points: z.array(z.object({
    label: z.string().trim(),
    x: z.number(),
    y: z.number(),
    highlight: z.boolean().optional(),
    color: z.string().optional(),
    labelDirection: z.enum(["top", "bottom", "left", "right", "top-right", "top-left", "bottom-right", "bottom-left"]).optional(),
  })).optional(),
  arrows: z.array(z.object({
    label: z.string().trim().optional(),
    from: z.tuple([z.number(), z.number()]),
    to: z.tuple([z.number(), z.number()]),
    color: z.string().optional(),
  })).optional(),
  caption: z.string().trim().optional(),
}).superRefine((chart, ctx) => {
  if (chart.chartType === "bar" || chart.chartType === "line") {
    if (!chart.labels || !chart.series) {
      ctx.addIssue({
        code: "custom",
        message: "نمودار میله‌ای یا خطی نیازمند labels و series است.",
      });
      return;
    }
    const labelCount = chart.labels.length;
    for (let i = 0; i < chart.series.length; i++) {
      if (chart.series[i].values.length !== labelCount) {
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "values"],
          message: `طول مقادیر سری «${chart.series[i].name}» (${chart.series[i].values.length}) با تعداد برچسب‌ها (${labelCount}) مطابقت ندارد.`,
        });
      }
    }
  }
});

export const blockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  formulaBlockSchema,
  imageBlockSchema,
  tableBlockSchema,
  chartBlockSchema,
]);
export type ContentBlock = z.infer<typeof blockSchema>;

export const importOptionSchema = z.object({
  key: z.string().trim().min(1).max(128),
  content: z.array(blockSchema).min(1).max(100),
});

export const sourceSchema = z.object({
  key: z.string().trim().min(1).max(128).optional(),
  kind: z.enum(["EXAM", "AI", "PERSONAL"]).default("PERSONAL"),
  title: z.string().trim().max(300).optional(),
  year: z.number().int().optional(),
  number: z.string().trim().max(50).optional(),
});

export const importQuestionSchema = z.object({
  key: z.string().trim().min(1).max(128),
  subject: z.string().trim().min(1).max(200).optional(),
  chapter: z.string().trim().min(1).max(200).nullish(),
  topic: z.string().trim().min(1).max(200).nullish(),
  content: z.array(blockSchema).min(1).max(100),
  options: z.array(importOptionSchema).length(4),
  correctOptionKey: z.string().trim().min(1).max(128).nullish(),
  explanation: z.array(blockSchema).max(100).default([]),
  shuffleSafe: z.boolean().default(false),
  source: sourceSchema.optional(),
  sourceNumber: z.string().trim().max(50).optional(),
  groupKey: z.string().trim().min(1).max(128).nullish(),
  groupPosition: z.number().int().min(0).nullish(),
  referenceMediaKey: z.string().trim().nullish(),
}).superRefine((question, context) => {
  const keys = new Set(question.options.map((option) => option.key));
  if (keys.size !== question.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "شناسهٔ گزینه‌ها باید یکتا باشد." });
  }
  if (question.correctOptionKey && !keys.has(question.correctOptionKey)) {
    context.addIssue({ code: "custom", path: ["correctOptionKey"], message: "پاسخ صحیح باید یکی از گزینه‌ها باشد." });
  }
});

export const importGroupSchema = z.object({
  key: z.string().trim().min(1).max(128),
  kind: z.enum(["reading", "cloze", "shared"]),
  subject: z.string().trim().min(1).max(200).optional(),
  chapter: z.string().trim().min(1).max(200).nullish(),
  topic: z.string().trim().min(1).max(200).nullish(),
  content: z.union([
    z.array(blockSchema).min(1).max(100),
    z.string().trim().min(1).transform((val) => [
      {
        type: "text" as const,
        value: val,
        direction: (/[a-zA-Z]/.test(val) ? "ltr" : "rtl") as "ltr" | "rtl",
      },
    ]),
  ]),
  questionKeys: z.array(z.string().trim().min(1).max(128)).optional().default([]),
});

export const taxonomyTopicSchema = z.string().trim().min(1).max(200);
export const taxonomyChapterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  topics: z.array(taxonomyTopicSchema).default([]),
});
export const taxonomySubjectSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  chapters: z.array(taxonomyChapterSchema).default([]),
});

export const importEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  defaults: z.object({
    subject: z.string().trim().min(1).max(200),
    chapter: z.string().trim().min(1).max(200).nullish(),
    topic: z.string().trim().min(1).max(200).nullish(),
    source: sourceSchema.optional(),
  }),
  taxonomy: z.array(taxonomySubjectSchema).optional().default([]),
  groups: z.array(importGroupSchema).optional().default([]),
  media: z.array(z.object({
    key: z.string().trim().min(1),
    path: z.string().trim().min(1),
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })).optional().default([]),
  questions: z.array(importQuestionSchema).min(1).max(10_000),
});

export type ImportEnvelope = z.infer<typeof importEnvelopeSchema>;
export type ImportQuestion = z.infer<typeof importQuestionSchema>;
export type ImportGroup = z.infer<typeof importGroupSchema>;

export interface StoredQuestion {
  id: string;
  externalKey: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  groupId?: string | null;
  groupPosition?: number | null;
  groupContent?: ContentBlock[] | null;
  groupKind?: "reading" | "cloze" | "shared" | null;
  content: ContentBlock[];
  options: Array<{ id: string; key: string; content: ContentBlock[] }>;
  correctOptionId: string | null;
  explanation: ContentBlock[];
  status: "draft" | "published";
  shuffleSafe: boolean;
  source?: { kind: "EXAM" | "AI" | "PERSONAL"; title?: string; year?: number; number?: string };
  reportCount?: number;
  createdAt: number;
  batchId?: string | null;
}
