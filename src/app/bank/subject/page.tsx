"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/testino-ui";
import { SubjectDetail } from "@/features/questions/components/subject-browser";
function Content() { const params = useSearchParams(); return <SubjectDetail name={params.get("name") || ""} />; }
export default function SubjectPage() { return <Suspense fallback={<LoadingState />}><Content /></Suspense>; }
