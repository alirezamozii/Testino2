"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/testino-ui";
import { QuestionDetail } from "@/features/questions/components/question-detail";
function Content() { const params = useSearchParams(); return <QuestionDetail id={params.get("id") || ""} />; }
export default function QuestionPage() { return <Suspense fallback={<LoadingState />}><Content /></Suspense>; }
