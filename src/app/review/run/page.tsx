import { Suspense } from "react";
import { ReviewRunner } from "@/features/review/components/review-runner";
import { LoadingState } from "@/components/ui/testino-ui";

export default function ReviewRunPage() {
  return (
    <Suspense fallback={<LoadingState label="در حال بارگذاری جلسهٔ مرور…" />}>
      <ReviewRunner />
    </Suspense>
  );
}
