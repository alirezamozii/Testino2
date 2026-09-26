"use client";

import React from "react";
import { Edit2, Save } from "lucide-react";
import { NeoButton, NeoInput } from "@/components/ui/neo-primitives";

export interface SettingsProfileCardProps {
  username: string;
  userTrack: string;
  avatarUrl: string | null;
  avatarError: boolean;
  onAvatarError: () => void;
  editingName: boolean;
  onToggleEditingName: () => void;
  usernameInput: string;
  onUsernameInputChange: (val: string) => void;
  profileTitleInput: string;
  onProfileTitleInputChange: (val: string) => void;
  onSaveIdentity: () => void;
}

export function SettingsProfileCard({
  username,
  userTrack,
  avatarUrl,
  avatarError,
  onAvatarError,
  editingName,
  onToggleEditingName,
  usernameInput,
  onUsernameInputChange,
  profileTitleInput,
  onProfileTitleInputChange,
  onSaveIdentity,
}: SettingsProfileCardProps) {
  return (
    <>
      <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-[var(--pastel-orange)] border-2 border-[var(--line-strong)] text-white flex items-center justify-center font-black text-2xl shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 overflow-hidden">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={username}
                referrerPolicy="no-referrer"
                onError={onAvatarError}
                className="w-full h-full object-cover"
              />
            ) : (
              username.slice(0, 1)
            )}
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
          onClick={onToggleEditingName}
          className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 cursor-pointer"
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
            <NeoInput
              value={usernameInput}
              onChange={(e) => onUsernameInputChange(e.target.value)}
              className="w-full bg-[var(--surface)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black text-[var(--ink)]">عنوان آزمون یا مقطع</label>
            <NeoInput
              value={profileTitleInput}
              onChange={(e) => onProfileTitleInputChange(e.target.value)}
              className="w-full bg-[var(--surface)]"
            />
          </div>
          <NeoButton
            type="button"
            variant="primary"
            size="md"
            onClick={onSaveIdentity}
            className="w-full text-xs font-black flex items-center justify-center gap-2"
          >
            <Save size={15} />
            <span>ذخیره تغییرات</span>
          </NeoButton>
        </div>
      )}
    </>
  );
}
