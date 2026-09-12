import { Suspense } from "react";
import { BookletStudio } from "@/features/questions/components/booklet-studio";
import { LoadingState } from "@/components/ui/testino-ui";

export const metadata = {
  title: "استودیوی بازبینی ساید‌بای‌ساید دفترچه کنکور | تستیونو",
  description: "تطبیق کلمه به کلمه و شکل به شکل سؤالات با PDF رسمی کنکور و ویرایش فوری درجا",
};

export default function BookletPage() {
  return (
    <Suspense fallback={<LoadingState label="در حال بارگذاری استودیوی بازبینی ساید‌بای‌ساید…" />}>
      <BookletStudio />
    </Suspense>
  );
}
