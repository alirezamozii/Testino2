import { Suspense } from "react";
import { QuestionImporter } from "@/features/imports/components/question-importer";
import { LoadingState } from "@/components/ui/testino-ui";

export default function ImportPage() {
  return (
    <Suspense fallback={<LoadingState label="در حال بارگذاری بخش ورود سؤالات و هوش مصنوعی…" />}>
      <QuestionImporter />
    </Suspense>
  );
}
