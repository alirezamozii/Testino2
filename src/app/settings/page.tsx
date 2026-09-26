"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useDatabase } from "@/providers/database-provider";
import { useTheme } from "@/providers/theme-provider";
import { canonicalizeSubject, isSameSubject } from "@/features/questions/domain/subject-registry";
import { partitionSubjectsForDisplay, normalizeScoreGroup } from "@/features/profiles/domain/score-groups";
import { CloudSyncCard } from "@/features/account/components/cloud-sync-card";
import { createBackup, restoreBackup } from "@/features/backup/domain/backup-service";
import { registerSubject } from "@/platform/shared-subjects";
import { syncCommunityQuestionsForSubjects } from "@/platform/community-questions";
import { MediaService } from "@/features/media/domain/media-service";
import { useAuthAvatar } from "@/platform/auth/use-avatar";
import { checkAppUpdate, type UpdateCheckResult } from "@/features/update/domain/update-service";
import { UpdateDialog } from "@/features/update/components/update-dialog";
import { OfflineLibraryCard } from "@/features/offline/components/offline-library-card";
import { getSupabaseClient } from "@/platform/auth/supabase-client";
import {
  SettingsProfileCard,
  SettingsAppearanceCard,
  SettingsSubjectsCard,
  SettingsBackupCard,
  SettingsAboutModal,
  SettingsDeleteDataModal,
} from "@/features/settings";

export default function SettingsPage() {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const router = useRouter();
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
  const avatarUrl = useAuthAvatar();
  const [avatarError, setAvatarError] = useState(false);

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
  const [subjectError, setSubjectError] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draggedSubjectId, setDraggedSubjectId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [groupEditorFor, setGroupEditorFor] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Update checking state
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showManualUpdateDialog, setShowManualUpdateDialog] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState("");

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  function showStatus(message: string) {
    setSaveStatus(message);
    setTimeout(() => setSaveStatus(""), 3000);
  }

  function failAction(err: unknown, fallback: string) {
    setActionError(err instanceof Error ? err.message : fallback);
    setTimeout(() => setActionError(""), 6000);
  }

  async function handleManualCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateFeedback("");
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
      const cleanName = usernameInput.trim();
      const isAccount = ownerQuery.data?.kind === "account";
      await database.db.saveOwner(cleanName, isAccount ? "account" : "local", ownerQuery.data?.authUserId || undefined);
      if (isAccount) {
        try {
          const client = getSupabaseClient();
          if (client) {
            await client.auth.updateUser({
              data: {
                display_name: cleanName,
                full_name: cleanName,
              },
            });
          }
        } catch {
          // ignore cloud metadata error
        }
      }
      if (activeProfile && profileTitleInput.trim() && profileTitleInput !== activeProfile.name) {
        await database.db.updateProfile(activeProfile.id, { name: profileTitleInput.trim() });
      }
      await queryClient.invalidateQueries({ queryKey: ["owner"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-shell"] });
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
        scoreGroup: null,
      });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });

      void registerSubject(name, {
        recommendedCoefficient: newSubjCoefficient,
        recommendedQuestions: newSubjQuestions,
      });
      void syncCommunityQuestionsForSubjects([name], database.db);

      setNewSubjName("");
      setNewSubjTarget(70);
      setNewSubjQuestions(25);
      setNewSubjCoefficient(1);
      showStatus(`درس «${name}» افزوده و در کاتالوگ جامعه ثبت شد.`);
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
    previousValue: number
  ) {
    if (!Number.isFinite(value) || value === previousValue) return;
    try {
      await database.db.updateProfileSubject(subjectId, { [field]: value });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus("تنظیمات درس ذخیره شد.");
    } catch (err) {
      failAction(err, "خطا در ذخیره تنظیمات درس");
    }
  }

  async function handleMergeSubjects(sourceId: string, targetId: string) {
    if (!activeProfile || sourceId === targetId) return;
    const source = activeProfile.subjects.find((s) => s.id === sourceId);
    const target = activeProfile.subjects.find((s) => s.id === targetId);
    if (!source || !target) return;

    const groupName =
      normalizeScoreGroup(target.scoreGroup) ||
      normalizeScoreGroup(source.scoreGroup) ||
      `${target.name} و ${source.name}`;

    try {
      await database.db.updateProfileSubject(source.id, { scoreGroup: groupName });
      if (normalizeScoreGroup(target.scoreGroup) !== groupName) {
        await database.db.updateProfileSubject(target.id, { scoreGroup: groupName });
      }
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus(`درس‌های «${source.name}» و «${target.name}» در گروه «${groupName}» ادغام شدند.`);
    } catch (err) {
      failAction(err, "خطا در ادغام دروس");
    } finally {
      setDraggedSubjectId(null);
      setDragOverTargetId(null);
    }
  }

  async function handleUpdateScoreGroup(subjectId: string, groupName: string, previousValue: string) {
    if (groupName === previousValue) return;
    try {
      await database.db.updateProfileSubject(subjectId, { scoreGroup: groupName || null });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus("گروه ذخیره شد.");
    } catch (err) {
      failAction(err, "خطا در ذخیره گروه");
    }
  }

  async function handleUngroupSubject(subjectId: string, subjectName: string) {
    try {
      await database.db.updateProfileSubject(subjectId, { scoreGroup: null });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      showStatus(`درس «${subjectName}» از گروه خارج شد.`);
    } catch (err) {
      failAction(err, "خطا در خروج از گروه");
    }
  }

  async function toggleNegativeScore() {
    if (!activeProfile) return;
    const enabled = Boolean(activeProfile.penaltyNumerator);
    await database.db.updateProfilePreferences(activeProfile.id, {
      penaltyNumerator: enabled ? 0 : 1,
      penaltyDenominator: 3,
    });
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    setSaveStatus(
      enabled
        ? "نمرهٔ منفی برای آزمون‌های بعدی خاموش شد."
        : "نمرهٔ منفی طبق فرمول رسمی سازمان سنجش فعال شد."
    );
  }

  const username = ownerQuery.data?.displayName || "کاربر تستیونو";
  const userTrack = activeProfile?.targetTrack || activeProfile?.name || "دانش‌آموز کنکور";

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
          <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)] tracking-tight">
            تنظیمات و ترجیحات
          </h1>
          <p className="text-xs font-bold text-[var(--muted)] mt-0.5">
            مدیریت هویت، دروس و ترجیحات آزمونی
          </p>
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
        {/* Main/Right Column (5 cols): Profile & Preferences */}
        <div className="lg:col-span-5 space-y-5">
          <SettingsProfileCard
            username={username}
            userTrack={userTrack}
            avatarUrl={avatarUrl}
            avatarError={avatarError}
            onAvatarError={() => setAvatarError(true)}
            editingName={editingName}
            onToggleEditingName={() => {
              if (!editingName) {
                setUsernameInput(username);
                setProfileTitleInput(activeProfile?.name || "");
              }
              setEditingName(!editingName);
            }}
            usernameInput={usernameInput}
            onUsernameInputChange={setUsernameInput}
            profileTitleInput={profileTitleInput}
            onProfileTitleInputChange={setProfileTitleInput}
            onSaveIdentity={handleSaveIdentity}
          />

          <CloudSyncCard />

          {ownerQuery.data && activeProfile && activeProfile.subjects.length > 0 && (
            <OfflineLibraryCard
              ownerId={ownerQuery.data.id}
              profileId={activeProfile.id}
              subjects={activeProfile.subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
              }))}
            />
          )}

          <SettingsAppearanceCard
            theme={theme}
            onSetTheme={setTheme}
            accent={accent}
            onSetAccent={setAccent}
            hasPenalty={Boolean(activeProfile?.penaltyNumerator)}
            onToggleNegativeScore={toggleNegativeScore}
            canTogglePenalty={Boolean(activeProfile)}
            persisted={persisted}
            onRequestPersistence={requestPersistence}
            onOpenAbout={() => setShowAbout(true)}
            onDeleteConfirm={() => setShowDeleteConfirm(true)}
          />
        </div>

        {/* Side/Left Column (7 cols): Subject Management & Backup */}
        <div className="lg:col-span-7 space-y-5">
          {activeProfile && (
            <SettingsSubjectsCard
              activeProfile={activeProfile}
              partitionedEntries={partitionSubjectsForDisplay(activeProfile.subjects)}
              expandedGroups={expandedGroups}
              onToggleGroup={toggleGroup}
              draggedSubjectId={draggedSubjectId}
              onSetDraggedSubjectId={setDraggedSubjectId}
              dragOverTargetId={dragOverTargetId}
              onSetDragOverTargetId={setDragOverTargetId}
              groupEditorFor={groupEditorFor}
              onSetGroupEditorFor={setGroupEditorFor}
              onMergeSubjects={handleMergeSubjects}
              onUpdateSubject={handleUpdateSubject}
              onUngroupSubject={handleUngroupSubject}
              onRemoveSubject={handleRemoveSubject}
              onUpdateScoreGroup={handleUpdateScoreGroup}
              newSubjName={newSubjName}
              onNewSubjNameChange={setNewSubjName}
              newSubjQuestions={newSubjQuestions}
              onNewSubjQuestionsChange={setNewSubjQuestions}
              newSubjCoefficient={newSubjCoefficient}
              onNewSubjCoefficientChange={setNewSubjCoefficient}
              newSubjTarget={newSubjTarget}
              onNewSubjTargetChange={setNewSubjTarget}
              onAddSubject={handleAddSubject}
              subjectError={subjectError}
            />
          )}

          <SettingsBackupCard
            backingUp={backingUp}
            restoring={restoring}
            onExportAllData={exportAllData}
            onRestoreFile={restoreData}
          />
        </div>
      </div>

      <SettingsAboutModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        checkingUpdate={checkingUpdate}
        onCheckUpdate={handleManualCheckUpdate}
        updateFeedback={updateFeedback}
      />

      {showManualUpdateDialog && updateResult && (
        <UpdateDialog
          update={updateResult}
          onClose={() => setShowManualUpdateDialog(false)}
        />
      )}

      <SettingsDeleteDataModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        isDeleting={isDeleting}
        onConfirmDelete={handleDeleteAllData}
      />
    </div>
  );
}
