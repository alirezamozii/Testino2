"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronLeft,
  Target,
  Sun,
  Moon,
  RotateCcw,
  CheckCircle2,
  Link2,
  HardDrive,
  Calculator,
  Download,
  Plus,
  Edit2,
  Save,
  Trash2,
  Palette,
  Check,
  AlertTriangle,
  Upload,
  RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDatabase } from "@/providers/database-provider";
import { useTheme, ACCENT_OPTIONS } from "@/providers/theme-provider";
import { cn } from "@/lib/utils";
import { canonicalizeSubject, isSameSubject } from "@/features/questions/domain/subject-registry";
import { CloudSyncCard } from "@/features/account/components/cloud-sync-card";
import { createBackup, restoreBackup } from "@/features/backup/domain/backup-service";
import { MediaService } from "@/features/media/domain/media-service";
import { APP_VERSION, APP_BUILD } from "@/config/version";
import { checkAppUpdate, type UpdateCheckResult } from "@/features/update/domain/update-service";
import { UpdateDialog } from "@/features/update/components/update-dialog";
import { OfflineLibraryCard } from "@/features/offline/components/offline-library-card";

export default function SettingsPage() {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const { theme, setTheme, accent, setAccent } = useTheme();

  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Queries
  const ownerQuery = useQuery({
    queryKey: ["owner"],
    queryFn: () => database.db.getCurrentOwner(),
    enabled: database.status === "ready",
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });

  const activeProfile = profilesQuery.data?.[0];

  // Profile Edit State
  const [editingName, setEditingName] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [profileTitleInput, setProfileTitleInput] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // Add Subject State
  const [newSubjName, setNewSubjName] = useState("");
  const [newSubjTarget, setNewSubjTarget] = useState(70);
  const [newSubjQuestions, setNewSubjQuestions] = useState(25);
  const [newSubjCoefficient, setNewSubjCoefficient] = useState(1);
  const [newSubjScoreGroup, setNewSubjScoreGroup] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  // Only subjects whose group editor is explicitly opened show the group input —
  // the vast majority of users never use shared score groups.
  const [groupEditorFor, setGroupEditorFor] = useState<string | null>(null);
  const [addGroupEnabled, setAddGroupEnabled] = useState(false);

  function showStatus(message: string) {
    setSaveStatus(message);
    setTimeout(() => setSaveStatus(""), 3000);
  }

  function failAction(err: unknown, fallback: string) {
    setActionError(err instanceof Error ? err.message : fallback);
    setTimeout(() => setActionError(""), 6000);
  }

  // Update checking state
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showManualUpdateDialog, setShowManualUpdateDialog] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  async function handleManualCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      const res = await checkAppUpdate();
      setUpdateResult(res);
      if (res.hasUpdate) {
        setShowManualUpdateDialog(true);
      } else {
        setUpdateFeedback(res.message || "شما از آخرین نسخه استفاده می‌کنید");
      }
    } catch {
      setUpdateFeedback("خطا در بررسی به‌روزرسانی یا عدم دسترسی به شبکه");
    } finally {
      setCheckingUpdate(false);
    }
  }

  const router = useRouter();

  async function handleDeleteAllData() {
    setIsDeleting(true);
    try {
      await database.db.deleteAllData();
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore storage errors
      }
      await queryClient.clear();
      router.replace("/onboarding/");
    } catch (err) {
      failAction(err, "خطا در پاک‌سازی داده‌ها");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  useEffect(() => {
    if (typeof navigator !== "undefined" && "storage" in navigator && "persisted" in navigator.storage) {
      navigator.storage.persisted().then(setPersisted).catch(() => setPersisted(false));
    }
  }, []);

  async function requestPersistence() {
    if (typeof navigator !== "undefined" && "storage" in navigator && "persist" in navigator.storage) {
      const isPersisted = await navigator.storage.persist();
      setPersisted(isPersisted);
    }
  }

  async function exportAllData() {
    setBackingUp(true);
    try {
      const mediaService = new MediaService(database.db.getClient());
      const { archiveBytes, manifest } = await createBackup(database.db.getClient(), mediaService);
      const blob = new Blob([archiveBytes as unknown as BlobPart], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `testino-backup-${new Date().toISOString().slice(0, 10)}.testino`;
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus(`فایل پشتیبان با موفقیت دانلود شد (${manifest.counts.questions} سؤال، ${manifest.counts.media} تصویر).`);
      setTimeout(() => setSaveStatus(""), 4000);
    } catch (err) {
      failAction(err, "خطا در تهیه فایل پشتیبان");
    } finally {
      setBackingUp(false);
    }
  }

  async function restoreData(file?: File) {
    if (!file) return;
    if (!confirm("آیا از بازیابی این فایل پشتیبان اطمینان دارید؟ اطلاعات فعلی با اطلاعات موجود در فایل پشتیبان جایگزین خواهند شد.")) return;
    setRestoring(true);
    try {
      const buffer = await file.arrayBuffer();
      const mediaService = new MediaService(database.db.getClient());
      const report = await restoreBackup(new Uint8Array(buffer), database.db.getClient(), mediaService);
      await queryClient.invalidateQueries();
      setSaveStatus(`بازیابی با موفقیت انجام شد (${report.counts.profiles} پروفایل، ${report.counts.questions} سؤال، ${report.counts.sessions} آزمون).`);
      setTimeout(() => setSaveStatus(""), 4000);
    } catch (err) {
      failAction(err, "خطا در بازیابی فایل پشتیبان");
    } finally {
      setRestoring(false);
    }
  }

  async function handleSaveIdentity() {
    if (!usernameInput.trim()) return;
    try {
      await database.db.saveOwner(usernameInput.trim(), "local");
      if (activeProfile && profileTitleInput.trim() && profileTitleInput !== activeProfile.name) {
        await database.db.updateProfile(activeProfile.id, { name: profileTitleInput.trim() });
      }
      await queryClient.invalidateQueries({ queryKey: ["owner"] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setEditingName(false);
      showStatus("اطلاعات کاربری به‌روزرسانی شد.");
    } catch (err) {
      failAction(err, "خطا در ذخیره نام");
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProfile) return;
    const name = canonicalizeSubject(newSubjName);
    if (!name) {
      setSubjectError("نام درس الزامی است.");
      return;
    }
    if (activeProfile.subjects.some((s) => isSameSubject(s.name, name))) {
      setSubjectError("این درس قبلاً اضافه شده است.");
      return;
    }

    try {
      await database.db.addSubjectToProfile(activeProfile.id, {
        name,
        targetPercentage: newSubjTarget,
        coefficient: newSubjCoefficient,
        questionCount: newSubjQuestions,
        scoreGroup: newSubjScoreGroup || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setNewSubjName("");
      setNewSubjTarget(70);
      setNewSubjQuestions(25);
      setNewSubjCoefficient(1);
      setNewSubjScoreGroup("");
      setAddGroupEnabled(false);
      showStatus(`درس «${name}» افزوده شد.`);
    } catch (err) {
      setSubjectError(err instanceof Error ? err.message : "خطا در افزودن درس");
    }
  }

  async function handleRemoveSubject(subjectId: string, subjectName: string) {
    if (!confirm(`آیا از حذف درس «${subjectName}» اطمینان دارید؟`)) return;
    try {
      await database.db.removeProfileSubject(subjectId);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus(`درس «${subjectName}» حذف شد.`);
    } catch (err) {
      failAction(err, "خطا در حذف درس");
    }
  }

  async function handleUpdateSubject(
    subjectId: string,
    field: "targetPercentage" | "coefficient" | "questionCount",
    value: number,
    previousValue: number,
  ) {
    // Tabbing through the input must not fire a spurious DB write + toast.
    if (!Number.isFinite(value) || value === previousValue) return;
    try {
      await database.db.updateProfileSubject(subjectId, { [field]: value });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus("تنظیمات درس ذخیره شد.");
    } catch (err) {
      failAction(err, "خطا در ذخیره تنظیمات درس");
    }
  }

  async function handleUpdateScoreGroup(subjectId: string, value: string, previousValue: string) {
    if (value === previousValue) return;
    try {
      await database.db.updateProfileSubject(subjectId, { scoreGroup: value || null });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus(value ? "گروه ذخیره شد." : "گروه حذف شد.");
    } catch (err) {
      failAction(err, "خطا در ذخیره گروه");
    }
  }

  const username = ownerQuery.data?.displayName || "کاربر تستیونو";
  const userTrack = activeProfile?.targetTrack || activeProfile?.name || "دانش‌آموز کنکور";

  async function toggleNegativeScore() {
    if (!activeProfile) return;
    const enabled = Boolean(activeProfile.penaltyNumerator);
    await database.db.updateProfilePreferences(activeProfile.id, { penaltyNumerator: enabled ? 0 : 1, penaltyDenominator: 3 });
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    setSaveStatus(enabled ? "نمرهٔ منفی برای آزمون‌های بعدی خاموش شد." : "نمرهٔ منفی طبق فرمول رسمی سازمان سنجش فعال شد.");
  }

  return (
    <div className="page settings-page max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header with Back Button */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="w-11 h-11 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors shadow-[2px_2px_0px_var(--neo-shadow)]"
        >
          <ChevronRight size={20} />
        </Link>
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)] tracking-tight">تنظیمات و ترجیحات</h1>
          <p className="text-xs font-bold text-[var(--muted)] mt-0.5">مدیریت هویت، دروس و ترجیحات آزمونی</p>
        </div>
        <div className="w-11" />
      </div>

      {saveStatus && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black flex items-center gap-2 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{saveStatus}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-2xl border-2 border-red-300 text-xs font-black flex items-center gap-2 shadow-[2px_2px_0px_#EF4444]">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 2-Column Responsive Layout on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main/Right Column (7 cols): Profile & Preferences */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Profile Header Card */}
          <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-[var(--pastel-orange)] border-2 border-[var(--line-strong)] text-white flex items-center justify-center font-black text-2xl shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                {username.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <strong className="block text-base sm:text-lg font-black text-[var(--ink)] truncate">
                  {username}
                </strong>
                <span className="text-xs text-[var(--muted)] font-bold mt-0.5 block truncate">
                  {userTrack}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!editingName) {
                  setUsernameInput(username);
                  setProfileTitleInput(activeProfile?.name || "");
                }
                setEditingName(!editingName);
              }}
              className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0"
              title="ویرایش نام"
            >
              <Edit2 size={16} />
            </button>
          </div>

          {/* Name Edit Drawer */}
          {editingName && (
            <div className="card-neo p-5 space-y-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)]">
              <div className="space-y-1">
                <label className="text-xs font-black text-[var(--ink)]">نام نمایشی شما</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black text-[var(--ink)]">عنوان آزمون یا مقطع</label>
                <input
                  type="text"
                  value={profileTitleInput}
                  onChange={(e) => setProfileTitleInput(e.target.value)}
                  className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveIdentity}
                className="btn-neo-orange w-full py-2.5 text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
              >
                <Save size={15} />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          )}

          {/* Cloud Account & Supabase Sync */}
          <CloudSyncCard />

          {ownerQuery.data && activeProfile && activeProfile.subjects.length > 0 && (
            <OfflineLibraryCard
              ownerId={ownerQuery.data.id}
              profileId={activeProfile.id}
              subjects={activeProfile.subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
            />
          )}

          {/* 2. Preferences Card */}
          <div className="card-neo p-4 sm:p-5 rounded-3xl bg-[var(--surface)] divide-y-2 divide-[var(--line-strong)]/15">
            {/* Preference: Theme */}
            <div className="py-3.5 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between text-right gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                    حالت نمایش رنگی
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    {theme === "dark"
                      ? "حالت شب نئوبروتال فعال است"
                      : "حالت روز (روشن و کاغذی گرم) فعال است"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-2)] rounded-2xl border-2 border-[var(--line-strong)] shrink-0">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border",
                    theme === "light"
                      ? "bg-[var(--surface)] text-[var(--ink)] border-[var(--line-strong)] shadow-[1.5px_1.5px_0px_var(--neo-shadow)]"
                      : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  روز (کاغذی)
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border",
                    theme === "dark"
                      ? "bg-[var(--surface)] text-[var(--ink)] border-[var(--line-strong)] shadow-[1.5px_1.5px_0px_var(--neo-shadow)]"
                      : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                  )}
                >
                  شب (تیره)
                </button>
              </div>
            </div>

            {/* Preference: 10 Accent Colors */}
            <div className="py-3.5 flex flex-col gap-3 text-right">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                    <Palette size={18} />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                      رنگ مکمل و تم برنامه (۱۰ رنگ)
                    </span>
                    <span className="text-[11px] text-[var(--muted)] font-bold">
                      رنگ ناوبری فعال، دکمه‌های اصلی و نشانگرها
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--ink)] shrink-0">
                  {ACCENT_OPTIONS.find((a) => a.id === accent)?.name || "آبی کلاسیک"}
                </span>
              </div>

              {/* 10 Color Swatches */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-1">
                {ACCENT_OPTIONS.map((opt) => {
                  const isSelected = opt.id === accent;
                  const displayColor = theme === "dark" ? opt.darkColor : opt.color;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAccent(opt.id)}
                      title={opt.name}
                      className={cn(
                        "group flex flex-col items-center gap-1.5 p-1.5 rounded-2xl border-2 transition-all cursor-pointer relative",
                        isSelected
                          ? "border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-105"
                          : "border-transparent hover:bg-[var(--surface-2)]/60"
                      )}
                    >
                      <div
                        className="w-7 h-7 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center transition-transform group-hover:scale-110 shadow-xs"
                        style={{ backgroundColor: displayColor }}
                      >
                        {isSelected && (
                          <Check size={14} strokeWidth={3.5} className="text-white drop-shadow-xs" />
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-[var(--ink-soft)] truncate max-w-full text-center leading-tight">
                        {opt.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preference: Negative Score */}
            <div className="py-3.5 flex items-center justify-between text-right gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <Calculator size={18} />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                    نمرهٔ منفی آزمون (فرمول سازمان سنجش)
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    {activeProfile?.penaltyNumerator
                      ? "فعال (فرمول رسمی سازمان سنجش: ۳ پاسخ غلط = ابطال ۱ پاسخ درست)"
                      : "غیرفعال (بدون کسر نمره منفی)"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleNegativeScore}
                disabled={!activeProfile}
                className={cn(
                  "w-14 h-7 rounded-full border-2 border-[var(--line-strong)] transition-colors relative p-0.5 flex items-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0",
                  activeProfile?.penaltyNumerator ? "bg-[var(--pastel-green)]" : "bg-[var(--surface-3)]"
                )}
                aria-pressed={Boolean(activeProfile?.penaltyNumerator)}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full bg-[var(--surface)] dark:bg-slate-200 border border-[var(--line-strong)] shadow-xs transition-transform transform",
                    activeProfile?.penaltyNumerator ? "translate-x-[-26px]" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Preference: SQLite Permanence */}
            <div className="py-3.5 flex items-center justify-between text-right gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/50 border-2 border-[var(--line-strong)] text-sky-700 dark:text-sky-300 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <HardDrive size={18} />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                    حافظهٔ دائمی روی دستگاه
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    {persisted ? "مرورگر اجازهٔ پاک‌سازی خودکار داده‌ها را ندارد" : "ذخیرهٔ استاندارد روی دستگاه"}
                  </span>
                </div>
              </div>

              {persisted === false && (
                <button
                  type="button"
                  onClick={requestPersistence}
                  className="btn-neo-yellow py-1.5 px-3 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0"
                >
                  ثبت دائم
                </button>
              )}
            </div>

            {/* About Testino item */}
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="py-3.5 last:pb-1 w-full flex items-center justify-between text-right hover:bg-[var(--surface-2)] rounded-2xl transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border-2 border-[var(--line-strong)] flex items-center justify-center p-1.5 shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <img src="/logo.png" alt="لوگو" className="w-full h-full object-contain" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                    درباره تستینو
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    نسخه ۱.۰ • بانک هوشمند و موتور مرور آفلاین
                  </span>
                </div>
              </div>
              <ChevronLeft size={18} className="text-[var(--muted)]" />
            </button>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3">
            <Link
              href="/onboarding/"
              className="card-neo w-full p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border-2 border-[var(--line-strong)] text-amber-800 dark:text-amber-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors shadow-[3px_3px_0px_var(--neo-shadow)]"
            >
              <RotateCcw size={18} />
              <span>راه‌اندازی مجدد پروفایل و درس‌ها</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="card-neo w-full p-4 rounded-3xl bg-red-50 dark:bg-red-950/30 border-2 border-red-400 text-red-700 dark:text-red-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors shadow-[3px_3px_0px_#EF4444] cursor-pointer"
            >
              <Trash2 size={18} />
              <span>حذف تمام داده‌ها (ریست کامل برنامه)</span>
            </button>
          </div>
        </div>

        {/* Side/Left Column (5 cols): Subject Management & Backup */}
        <div className="lg:col-span-5 space-y-5">
          {/* Subject Manager Card */}
          {activeProfile && (
            <div className="card-neo p-5 space-y-4 rounded-3xl bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b-2 border-[var(--line-strong)]/20 pb-3">
                <div className="flex items-center gap-2">
                  <Target size={18} className="text-[var(--testino-orange)]" />
                  <h3 className="text-sm font-black text-[var(--ink)]">
                    اهداف و دروس من ({activeProfile.subjects.length} درس)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-[var(--muted)]">ضریب و هدف</span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {activeProfile.subjects.map((s) => {
                  const qCount = s.questionCount ?? 25;
                  const correctVal = (100 / qCount).toFixed(2);
                  const wrongVal = (100 / (3 * qCount)).toFixed(2);
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-3 shadow-[2px_2px_0px_var(--neo-shadow)]"
                    >
                      {/* Top Row: Full Subject Name & Delete Button */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--testino-orange)] shrink-0" />
                          <span className="font-black text-sm text-[var(--ink)] truncate">
                            {s.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(s.id, s.name)}
                          className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors shrink-0 shadow-sm"
                          title="حذف درس"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* 3-Column Metrics Grid: Question Count, Coefficient, Target Percentage */}
                      <div className="grid grid-cols-3 gap-2 bg-[var(--surface)] p-2 rounded-xl border border-[var(--line-strong)]/20">
                        {/* Question Count */}
                        <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)]/15">
                          <span className="text-[10px] font-bold text-[var(--muted)] mb-1">تعداد سؤال</span>
                          <input
                            aria-label={`تعداد سؤالات ${s.name}`}
                            type="number"
                            min="1"
                            max="200"
                            defaultValue={qCount}
                            onBlur={(event) => handleUpdateSubject(s.id, "questionCount", Number(event.currentTarget.value), qCount)}
                            className="w-full max-w-[64px] bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-lg px-1.5 py-1 text-center text-xs font-black text-[var(--ink)] focus:outline-none focus:border-sky-500 shadow-sm"
                            title="تعداد سؤالات این درس در آزمون کنکور"
                          />
                        </div>

                        {/* Coefficient */}
                        <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)]/15">
                          <span className="text-[10px] font-bold text-[var(--muted)] mb-1">ضریب درس</span>
                          <input
                            aria-label={`ضریب ${s.name}`}
                            type="number"
                            min="0"
                            max="20"
                            defaultValue={s.coefficient}
                            onBlur={(event) => handleUpdateSubject(s.id, "coefficient", Number(event.currentTarget.value), s.coefficient)}
                            className="w-full max-w-[64px] bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-lg px-1.5 py-1 text-center text-xs font-black text-[var(--ink)] focus:outline-none focus:border-sky-500 shadow-sm"
                          />
                        </div>

                        {/* Target Percentage */}
                        <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)]/15">
                          <span className="text-[10px] font-bold text-[var(--muted)] mb-1">درصد هدف</span>
                          <div className="flex items-center justify-center gap-1 w-full max-w-[64px]">
                            <input
                              aria-label={`هدف ${s.name}`}
                              type="number"
                              min="0"
                              max="100"
                              defaultValue={s.targetPercentage}
                              onBlur={(event) => handleUpdateSubject(s.id, "targetPercentage", Number(event.currentTarget.value), s.targetPercentage)}
                              className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-lg px-1 py-1 text-center text-xs font-black text-[var(--ink)] focus:outline-none focus:border-sky-500 shadow-sm"
                            />
                            <span className="text-[10px] font-black text-[var(--muted)] shrink-0">٪</span>
                          </div>
                        </div>
                      </div>

                      {/* Formula Breakdown Badges */}
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold pt-0.5 px-0.5">
                        <span className="text-[var(--brand-green)] flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-300/40">
                          <span>صحیح:</span>
                          <span dir="ltr" className="font-black">+{correctVal}٪</span>
                        </span>
                        <span className="text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-300/40">
                          <span>غلط:</span>
                          <span dir="ltr" className="font-black">-{wrongVal}٪</span>
                        </span>
                        <span className="text-[var(--ink)] flex items-center gap-1 bg-[var(--surface)] px-2 py-0.5 rounded-md border border-[var(--line-strong)]/20">
                          <span>ضریب:</span>
                          <span dir="ltr" className="font-black">×{s.coefficient}</span>
                        </span>
                      </div>

                      {/* Shared Score Group Link */}
                      <div className="pt-1 border-t border-[var(--line-strong)]/15">
                        {s.scoreGroup || groupEditorFor === s.id ? (
                          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] bg-[var(--surface)] p-1.5 rounded-xl border border-[var(--line-strong)]/20">
                            <span className="shrink-0 text-[11px]">گروه مشترک با:</span>
                            <input
                              aria-label={`گروه مشترک ${s.name}`}
                              type="text"
                              defaultValue={s.scoreGroup ?? ""}
                              onBlur={(event) => handleUpdateScoreGroup(s.id, event.currentTarget.value.trim(), s.scoreGroup ?? "")}
                              placeholder="مثلاً: اقتصاد"
                              className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)]/40 rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink)] focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setGroupEditorFor(s.id)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors py-0.5"
                          >
                            <Link2 size={12} className="text-sky-500 shrink-0" />
                            <span className="truncate">تعیین گروه مشترک تراز با درس دیگر (اختیاری)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inline Add Subject — 2-Row Spacious Layout */}
              <form onSubmit={handleAddSubject} className="space-y-2.5 pt-3 border-t-2 border-[var(--line-strong)]/20 bg-[var(--surface-2)] p-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                    <Plus size={14} className="text-[var(--testino-orange)]" />
                    <span>افزودن درس جدید به برنامه</span>
                  </span>
                </div>

                {/* Row 1: Full-Width Subject Name Input */}
                <input
                  type="text"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  placeholder="نام درس جدید را اینجا بنویسید (مثلاً: ریاضی، ادبیات)..."
                  className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2 text-xs font-black text-[var(--ink)] placeholder:text-[var(--muted)] placeholder:font-normal focus:outline-none focus:border-sky-500 shadow-sm"
                />

                {/* Row 2: 4-Column Grid for Metrics & Action */}
                <div className="grid grid-cols-4 gap-2 items-center">
                  {/* Question Count */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/20">
                    <span className="text-[10px] font-bold text-[var(--muted)] mb-1">تعداد سؤال</span>
                    <input
                      aria-label="تعداد سؤال درس جدید"
                      type="number"
                      min="1"
                      max="200"
                      value={newSubjQuestions}
                      onChange={(e) => setNewSubjQuestions(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-[var(--surface-2)] border border-[var(--line-strong)]/40 rounded-lg py-1 text-xs font-black text-center text-[var(--ink)] focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Coefficient */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/20">
                    <span className="text-[10px] font-bold text-[var(--muted)] mb-1">ضریب درس</span>
                    <input
                      aria-label="ضریب درس جدید"
                      type="number"
                      min="0"
                      max="100"
                      value={newSubjCoefficient}
                      onChange={(e) => setNewSubjCoefficient(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-[var(--surface-2)] border border-[var(--line-strong)]/40 rounded-lg py-1 text-xs font-black text-center text-[var(--ink)] focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Target Percentage */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/20">
                    <span className="text-[10px] font-bold text-[var(--muted)] mb-1">درصد هدف</span>
                    <div className="flex items-center justify-center gap-0.5 w-full">
                      <input
                        aria-label="هدف درصدی درس جدید"
                        type="number"
                        min="0"
                        max="100"
                        value={newSubjTarget}
                        onChange={(e) => setNewSubjTarget(Math.max(0, Math.min(100, Number(e.target.value))))}
                        className="w-full bg-[var(--surface-2)] border border-[var(--line-strong)]/40 rounded-lg py-1 text-xs font-black text-center text-[var(--ink)] focus:outline-none focus:border-sky-500"
                      />
                      <span className="text-[10px] font-black text-[var(--muted)] shrink-0">٪</span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="h-full min-h-[48px] btn-neo-orange rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-0.5 active:translate-y-0.5"
                    title="افزودن درس جدید"
                  >
                    <Plus size={16} />
                    <span className="text-[10px] font-black">افزودن</span>
                  </button>
                </div>

                {/* Optional Score Group */}
                <div className="pt-1">
                  {addGroupEnabled ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] bg-[var(--surface)] p-2 rounded-xl border border-[var(--line-strong)]/20">
                      <span className="shrink-0 text-[11px]">گروه مشترک:</span>
                      <input
                        type="text"
                        value={newSubjScoreGroup}
                        onChange={(e) => setNewSubjScoreGroup(e.target.value)}
                        placeholder="نام درس مشترک؛ مثلاً: اقتصاد"
                        className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)]/40 rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink)] focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddGroupEnabled(true)}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors py-0.5"
                    >
                      <Link2 size={12} className="text-sky-500 shrink-0" />
                      <span>این درس با درس دیگری هم‌گروه تراز است؟ (اختیاری)</span>
                    </button>
                  )}
                </div>
              </form>
              {subjectError && <p className="text-[10px] text-red-600 font-bold">{subjectError}</p>}
            </div>
          )}

          {/* Backup & Restore Card (TASK-029) */}
          <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                <Download size={18} />
              </div>
              <div>
                <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                  پشتیبان‌گیری و بازیابی داده‌ها (ZIP)
                </strong>
                <span className="text-[11px] text-[var(--muted)] font-bold">
                  بسته کامل پروفایل، سؤالات، آزمون‌ها و تصاویر
                </span>
              </div>
            </div>

            <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
              فایل خروجی شامل کلیه اطلاعات پایگاه داده و تصاویر است که با رعایت کامل حریم خصوصی و بدون نشت توکن تهیه می‌شود.
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={exportAllData}
                disabled={backingUp || restoring}
                className="btn-neo-blue w-full py-2.5 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2"
              >
                <Download size={15} />
                <span>{backingUp ? "در حال تهیه پشتیبان…" : "دانلود فایل پشتیبان کامل (.testino)"}</span>
              </button>

              <label className="btn-neo-yellow w-full py-2.5 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 cursor-pointer">
                <Upload size={15} />
                <span>{restoring ? "در حال بازیابی اطلاعات…" : "بازیابی از فایل پشتیبان"}</span>
                <input
                  type="file"
                  accept=".testino,.zip,application/zip"
                  className="hidden"
                  disabled={backingUp || restoring}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) restoreData(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="dialog-backdrop animate-in fade-in" onClick={() => setShowAbout(false)}>
          <div
            className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center space-y-3">
              <img
                src="/logo.png"
                alt="لوگوی تستینو"
                className="w-20 h-20 object-contain drop-shadow-md"
              />
              <div className="flex items-center justify-center">
                <img
                  src="/name.png"
                  alt="تستینو Testino"
                  className="h-9 w-auto object-contain dark:hidden"
                />
                <img
                  src="/name-dark.png"
                  alt="تستینو Testino"
                  className="h-9 w-auto object-contain hidden dark:block"
                />
              </div>
              <p className="text-xs text-[var(--muted)] font-bold">
                بانک هوشمند سؤال و موتور مرور آفلاین
              </p>
              <div className="w-full py-3 px-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-right space-y-2.5 text-xs font-bold shadow-[2px_2px_0px_var(--neo-shadow)]">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">نسخه:</span>
                  <strong className="font-black text-[var(--ink)]">v{APP_VERSION} (بیلد {APP_BUILD})</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">موتور ذخیره‌سازی:</span>
                  <strong className="font-black text-emerald-600 dark:text-emerald-400">SQLite WASM (OPFS)</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">شعار:</span>
                  <strong className="font-black text-[var(--testino-orange)]">آزمون امروز، موفقیت فردا</strong>
                </div>
                
                {/* Update Checker Button */}
                <div className="pt-2 border-t border-[var(--line-strong)] space-y-2">
                  <button
                    type="button"
                    onClick={handleManualCheckUpdate}
                    disabled={checkingUpdate}
                    className="w-full py-2 px-3 rounded-xl bg-[var(--surface)] text-[var(--ink)] border-2 border-[var(--line-strong)] font-black text-xs flex items-center justify-center gap-2 hover:bg-[var(--surface-2)] active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_var(--neo-shadow)] disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? "animate-spin text-[var(--accent)]" : ""}`} />
                    {checkingUpdate ? "در حال بررسی سرور..." : "بررسی به‌روزرسانی"}
                  </button>

                  {updateFeedback && (
                    <div className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[11px] font-bold text-center text-[var(--ink)]">
                      {updateFeedback}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAbout(false)}
              className="btn-neo-orange w-full py-2.5 text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Manual Update Dialog */}
      {showManualUpdateDialog && updateResult && (
        <UpdateDialog
          update={updateResult}
          onClose={() => setShowManualUpdateDialog(false)}
        />
      )}

      {/* Delete All Data Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="dialog-backdrop animate-in fade-in" onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
          <div
            className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-red-500 shadow-[6px_6px_0px_#EF4444]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 border-2 border-red-500 flex items-center justify-center text-red-600 shadow-[2px_2px_0px_#EF4444]">
                <AlertTriangle size={28} />
              </div>
              <h3 className="text-base font-black text-[var(--ink)]">
                آیا از حذف تمام داده‌ها مطمئن هستید؟
              </h3>
              <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
                تمام سؤالات، پاسخ‌ها، کارنامه‌ها، تاریخچه آزمون‌ها و پروفایل کاربری به‌طور دائم از این دستگاه پاک خواهند شد و این عملیات غیرقابل بازگشت است.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleDeleteAllData}
                disabled={isDeleting}
                className="w-full py-3 rounded-2xl border-2 border-[var(--line-strong)] bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm shadow-[3px_3px_0px_var(--neo-shadow)] transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                <span>{isDeleting ? "در حال پاک‌سازی..." : "بله، همه داده‌ها را پاک کن"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="w-full py-2.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] font-black text-xs hover:bg-[var(--surface-3)] transition-colors"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
