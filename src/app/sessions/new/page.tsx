import { Suspense } from "react";
import { SessionBuilder } from "@/features/exams/components/session-builder";
import { LoadingState } from "@/components/ui/testino-ui";

export default function NewSessionPage() {
  return (
    <Suspense fallback={<LoadingState label="در حال آماده‌سازی سازندهٔ آزمون…" />}>
      <SessionBuilder />
    </Suspense>
  );
}
