import { Suspense } from "react";
import { PromptBuilder } from "@/features/prompts/components/prompt-builder";
import { LoadingState } from "@/components/ui/testino-ui";

export const metadata = {
  title: "پرامپت بیلدر هوش مصنوعی | تستیونو",
  description: "مهندسی پرامپت‌های استخراج ۱۰ درس کنکور کارشناسی ارشد مدیریت با خروجی استاندارد JSON و فرمول‌های KaTeX",
};

export default function PromptsPage() {
  return (
    <Suspense fallback={<LoadingState label="در حال آماده‌سازی پرامپت بیلدر هوشمند…" />}>
      <PromptBuilder />
    </Suspense>
  );
}
