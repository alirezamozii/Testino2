import type { Metadata } from "next";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/900.css";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";

export const metadata: Metadata = {
  title: "تستیونو | Testino",
  description: "بانک سؤال و موتور مرور آفلاین",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Applies the persisted/system theme to <html> BEFORE first paint to avoid a
  // light-theme flash for dark users. Runs before hydration; React does not
  // manage data-theme/class on <html> in JSX, so this is hydration-safe.
  const themeInitScript = `(function(){try{var t=localStorage.getItem("testino-theme");var d=t==="dark"||((!t||t==="")&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d){r.setAttribute("data-theme","dark");r.classList.add("dark")}else{r.setAttribute("data-theme","light");r.classList.remove("dark")}}catch(e){}})();`;
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppProviders>
          <ServiceWorkerRegistration />
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
