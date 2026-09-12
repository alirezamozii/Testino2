"use client";
import { ErrorState } from "@/components/ui/testino-ui";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="focus-shell"><ErrorState message="این بخش درست بارگذاری نشد. داده‌های ذخیره‌شده حذف نشده‌اند." retry={reset} /></main>; }
