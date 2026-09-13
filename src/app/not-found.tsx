"use client";

import Link from "next/link";
import { MapPinned } from "lucide-react";
import { EmptyState } from "@/components/ui/testino-ui";
export default function NotFound() { return <main className="focus-shell"><div className="testino-card max-w-2xl mx-auto"><EmptyState icon={MapPinned} tone="blue" title="این صفحه پیدا نشد" description="نشانی واردشده در تستیونو وجود ندارد." action={<Link className="btn-neo-orange px-5 py-2 text-xs font-black" href="/">بازگشت به خانه</Link>} /></div></main>; }
