"use client";

import Link from "next/link";
import { MapPinned } from "lucide-react";
import { EmptyState } from "@/components/ui/testino-ui";
export default function NotFound() { return <main className="focus-shell"><div className="testino-card max-w-2xl mx-auto"><EmptyState icon={MapPinned} tone="blue" title="این صفحه پیدا نشد" description="نشانی واردشده در تستیونو وجود ندارد." action={<Link className="btn-primary-orange" href="/">بازگشت به خانه</Link>} /></div></main>; }
