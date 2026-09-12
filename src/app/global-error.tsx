"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-4">
          <h2 className="text-xl font-bold text-red-400">خطای سیستمی رخ داد</h2>
          <p className="text-sm text-slate-400">
            {error?.message || "مشکلی در بارگذاری نرم‌افزار پیش آمده است."}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
          >
            تلاش مجدد
          </button>
        </div>
      </body>
    </html>
  );
}
