"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiDownload,
  FiUpload,
} from "react-icons/fi";

import {
  buildStudyBackupFilename,
  createStudyBackup,
  getStudyBackupCounts,
  parseStudyBackup,
  restoreStudyBackup,
  type StudyBackup,
} from "../../lib/storage/studyBackup";

type ShareNavigator = Navigator & {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

function formatBackupTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function downloadBackupFile(file: File, filename: string): void {
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function exportBackupFile(backup: StudyBackup): Promise<void> {
  const filename = buildStudyBackupFilename(backup.exportedAt);
  const text = JSON.stringify(backup, null, 2);
  const file = new File([text], filename, { type: "application/json" });
  const shareNavigator = navigator as ShareNavigator;
  const shareData: ShareData = {
    title: "学习数据备份",
    files: [file],
  };

  if (
    shareNavigator.share &&
    (!shareNavigator.canShare || shareNavigator.canShare(shareData))
  ) {
    try {
      await shareNavigator.share(shareData);
      return;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    }
  }

  downloadBackupFile(file, filename);
}

export function MobileStudyData() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<StudyBackup | null>(null);
  const [selectedFilename, setSelectedFilename] = useState("");
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportBackup = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const backup = await createStudyBackup();
      await exportBackupFile(backup);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "无法导出备份");
    } finally {
      setExporting(false);
    }
  }, []);

  const selectBackup = useCallback(async (file: File | null) => {
    setSelectedBackup(null);
    setSelectedFilename("");
    setRestored(false);
    setError(null);
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const backup = parseStudyBackup(parsed);
      setSelectedBackup(backup);
      setSelectedFilename(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取备份文件");
    }
  }, []);

  const restore = useCallback(async () => {
    if (!selectedBackup || restoring) return;
    if (!window.confirm("用这个备份替换当前学习数据？")) return;

    setRestoring(true);
    setRestored(false);
    setError(null);
    try {
      await restoreStudyBackup(selectedBackup);
      setRestored(true);
      setSelectedBackup(null);
      setSelectedFilename("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法恢复备份");
    } finally {
      setRestoring(false);
    }
  }, [restoring, selectedBackup]);

  const counts = selectedBackup ? getStudyBackupCounts(selectedBackup) : null;

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <header className="flex items-center gap-3">
          <Link
            href="/study/settings"
            aria-label="返回设置"
            className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition duration-150 active:scale-90 active:bg-white/10"
          >
            <FiArrowLeft aria-hidden="true" size={19} />
          </Link>
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-sky-300/80">
              学习数据
            </div>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-white">
              备份与恢复
            </h1>
          </div>
        </header>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-200">
            {error}
          </div>
        )}

        {restored && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            <FiCheckCircle aria-hidden="true" size={18} />
            备份已恢复
          </div>
        )}

        <div className="mt-7 space-y-4">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-lg font-medium text-white">导出备份</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              保存学习进度、复习间隔、复习记录和设置。
            </p>
            <button
              type="button"
              onClick={() => void exportBackup()}
              disabled={exporting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[20px] bg-sky-400 px-4 py-3.5 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:opacity-50"
            >
              <FiDownload aria-hidden="true" size={18} />
              {exporting ? "正在导出…" : "导出备份"}
            </button>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-lg font-medium text-white">恢复备份</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              选择此前导出的 JSON 备份文件。
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void selectBackup(event.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/12 bg-white/[0.055] px-4 py-3.5 text-base font-semibold text-slate-200 transition duration-150 active:scale-[0.97] active:bg-white/[0.1]"
            >
              <FiUpload aria-hidden="true" size={18} />
              选择备份文件
            </button>

            {selectedBackup && counts && (
              <div className="mt-4 rounded-2xl bg-black/20 p-4">
                <div className="truncate text-sm font-medium text-slate-200">
                  {selectedFilename}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {formatBackupTime(selectedBackup.exportedAt)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-400">
                    复习状态 <span className="text-slate-200">{counts.reviewStates}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-400">
                    复习记录 <span className="text-slate-200">{counts.reviewEvents}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-400">
                    学习进度 <span className="text-slate-200">{counts.progress}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-400">
                    当日计划 <span className="text-slate-200">{counts.dailyStudyPlans}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void restore()}
                  disabled={restoring}
                  className="mt-4 w-full rounded-[18px] bg-white px-4 py-3 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:opacity-50"
                >
                  {restoring ? "正在恢复…" : "恢复此备份"}
                </button>
              </div>
            )}
          </section>
        </div>

        <Link
          href="/study"
          className="mt-auto pt-8 text-center text-sm text-slate-500 transition active:text-slate-300"
        >
          回到今日复习
        </Link>
      </div>
    </main>
  );
}
