import { Suspense } from "react";
import { AiTools } from "@/features/ai/components/ai-tools";

export default function Page() {
  return (
    <Suspense fallback={<div className="page py-12 text-center text-sm font-bold text-neutral-400">در حال بارگذاری استودیو هوش مصنوعی…</div>}>
      <AiTools />
    </Suspense>
  );
}
