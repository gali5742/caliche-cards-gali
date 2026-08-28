"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiArchive,
  FiArrowLeft,
  FiCheck,
  FiRotateCcw,
} from "react-icons/fi";

import type { StudySettings } from "../../domain/settings/types";
import { IndexedDbSettingsRepository } from "../../lib/repositories/indexedDbSettingsRepository";
import {
  loadStudySettingsSnapshot,
  persistStudySettings,
} from "../../lib/runtime/studySettings";

function sameSettings(a: StudySettings, b: StudySettings): boolean {
  return (
    a.dailyNewVocabularyLimit === b.dailyNewVocabularyLimit &&
    a.productionEnabled === b.productionEnabled &&
    a.fsrsRequestRetention === b.fsrsRequestRetention
  );
}

function normalizeDailyNewVocabularyLimit(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;

  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
      <div className="text-lg font-medium text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function MobileStudySettings() {
  const [saved, setSaved] = useState<StudySettings | null>(null);
  const [draft, setDraft] = useState<StudySettings | null>(null);
  const [defaults, setDefaults] = useState<StudySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadStudySettingsSnapshot(
        new IndexedDbSettingsRepository()
      );
      setSaved(snapshot.settings);
      setDraft(snapshot.settings);
      setDefaults(snapshot.defaults);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取设置");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => Boolean(saved && draft && !sameSettings(saved, draft)),
    [draft, saved]
  );

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSavedNotice(false);
    setError(null);
    try {
      const next = await persistStudySettings(
        draft,
        new IndexedDbSettingsRepository()
      );
      setSaved(next);
      setDraft(next);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 1800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存设置");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <header className="flex items-center gap-3">
          <Link
            href="/study"
            aria-label="返回今日复习"
            className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition duration-150 active:scale-90 active:bg-white/10"
          >
            <FiArrowLeft aria-hidden="true" size={19} />
          </Link>
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-sky-300/80">
              学习
            </div>
            <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-white">
              设置
            </h1>
          </div>
        </header>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-200">
            {error}
          </div>
        )}

        {loading || !draft ? (
          <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-500">
            正在读取设置…
          </div>
        ) : (
          <div className="mt-7 space-y-4">
            <SettingsSection
              title="每日新词"
              description="每天先加入这一组新词，完成后可继续加组。"
            >
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="daily-new-limit" className="text-base text-slate-200">
                  默认每组
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="daily-new-limit"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    value={draft.dailyNewVocabularyLimit}
                    onChange={(event) => {
                      const value = normalizeDailyNewVocabularyLimit(
                        event.target.value
                      );
                      event.currentTarget.value = String(value);
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              dailyNewVocabularyLimit: value,
                            }
                          : current
                      );
                    }}
                    className="w-20 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-center text-lg text-white outline-none focus:border-sky-400/50"
                  />
                  <span className="text-sm text-slate-500">词</span>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title="主动回忆"
              description="开启后增加“看义写词”，两种练习分别安排复习间隔。"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-slate-200">外语输出</div>
                  <div className="mt-1.5 text-sm leading-5 text-slate-500">
                    {draft.productionEnabled
                      ? "看词想义 + 看义写词"
                      : "只做看词想义"}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="外语输出"
                  aria-checked={draft.productionEnabled}
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            productionEnabled: !current.productionEnabled,
                          }
                        : current
                    )
                  }
                  className={`relative h-8 w-14 shrink-0 rounded-full transition duration-150 active:scale-95 ${
                    draft.productionEnabled ? "bg-sky-400" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                      draft.productionEnabled ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </SettingsSection>

            <SettingsSection
              title="目标记忆率"
              description="目标越高，复习通常越频繁；目标越低，间隔会更宽松。"
            >
              <div className="flex items-end justify-between gap-4">
                <span className="text-base text-slate-200">当前目标</span>
                <span className="text-4xl font-semibold tracking-tight text-white">
                  {Math.round(draft.fsrsRequestRetention * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={70}
                max={99}
                step={1}
                value={Math.round(draft.fsrsRequestRetention * 100)}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          fsrsRequestRetention: Number(event.target.value) / 100,
                        }
                      : current
                  )
                }
                aria-label="目标记忆率"
                className="mt-6 w-full accent-sky-400"
              />
              <div className="mt-2 flex justify-between text-xs text-slate-600">
                <span>70%</span>
                <span>默认 90%</span>
                <span>99%</span>
              </div>
            </SettingsSection>

            <Link
              href="/study/data"
              className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.035] px-5 py-4 transition duration-150 active:scale-[0.98] active:bg-white/[0.08]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                  <FiArchive aria-hidden="true" size={18} />
                </div>
                <div>
                  <div className="text-base font-medium text-slate-200">备份与恢复</div>
                  <div className="mt-1 text-xs text-slate-500">
                    导出或恢复学习数据
                  </div>
                </div>
              </div>
              <span className="text-xl text-slate-600">›</span>
            </Link>

            <Link
              href="/study/diagnostics"
              className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.035] px-5 py-4 transition duration-150 active:scale-[0.98] active:bg-white/[0.08]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                  <FiActivity aria-hidden="true" size={18} />
                </div>
                <div>
                  <div className="text-base font-medium text-slate-200">设备与离线诊断</div>
                  <div className="mt-1 text-xs text-slate-500">
                    检查离线缓存、存储状态和学习数据
                  </div>
                </div>
              </div>
              <span className="text-xl text-slate-600">›</span>
            </Link>

            {defaults && (
              <button
                type="button"
                onClick={() => setDraft({ ...defaults })}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-slate-500 transition duration-150 active:scale-[0.98] active:bg-white/5"
              >
                <FiRotateCcw aria-hidden="true" size={15} />
                恢复默认值
              </button>
            )}
          </div>
        )}

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!draft || !dirty || saving}
            className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-sky-400 px-5 py-4 text-base font-semibold text-slate-950 transition duration-150 active:scale-[0.97] active:brightness-90 disabled:bg-white/10 disabled:text-slate-600"
          >
            {savedNotice ? (
              <>
                <FiCheck aria-hidden="true" size={18} />
                已保存
              </>
            ) : saving ? (
              "正在保存…"
            ) : dirty ? (
              "保存设置"
            ) : (
              "设置已保存"
            )}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-600">
            保存后从下一轮复习起生效。
          </p>
        </div>
      </div>
    </main>
  );
}
