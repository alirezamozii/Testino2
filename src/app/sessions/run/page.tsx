import { Suspense } from "react";
import { SessionPlayer } from "@/features/exams/components/session-player";
import { LoadingState } from "@/components/ui/testino-ui";
export default function SessionRunPage(){return <Suspense fallback={<LoadingState label="در حال باز کردن جلسه…" />}><SessionPlayer/></Suspense>}
