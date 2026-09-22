"use client";
import { ErrorState } from "@/components/ui/testino-ui";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("GlobalError caught:", error);
  return (
    <main className="focus-shell">
      <ErrorState message={`این بخش درست بارگذاری نشد: ${error?.message || ""}`} retry={reset} />
    </main>
  );
}
