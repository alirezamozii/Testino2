"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/testino-ui";
import { TopicQuestions } from "@/features/questions/components/topic-questions";
function Content() { const params = useSearchParams(); return <TopicQuestions subject={params.get("subject") || ""} topic={params.get("topic") || ""} />; }
export default function TopicPage() { return <Suspense fallback={<LoadingState />}><Content /></Suspense>; }
