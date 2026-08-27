"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiActivity, FiArrowLeft, FiCheck, FiRotateCcw } from "react-icons/fi";

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
            正在读取本地设置…
          </div>
        ) : (
          <div className="mt-7 space-y-4">
            <SettingsSection
              title="每日新词"
              description="每天默认加入这一组新词；已经到期的复习和继续学习不受这个数字影响。完成后仍可临时再学一组。"
            >
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="daily-new-limit" className="text-base text-slate-200">
                  默认每组
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="daily-new-limit"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.dailyNewVocabularyLimit}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              dailyNewVocabularyLimit: Math.max(
                                0,
                                Math.min(100, Math.trunc(value))
                              ),
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
              description="开启后，同一个词除了“看词想义”，还会安排“看义写词”的输出练习。两种能力分别计算复习间隔。"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium text-slate-200">外语输出</div>
                  <div className="mt-1.5 text-sm leading-5 text-slate-500">
                    {draft.productionEnabled
                      ? "当前同时安排识别与输出"
                      : "当前只安排看词想义"}
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
              description="间隔算法会根据这个目标调整复习频率。目标越高，通常复习越频繁；目标越低，间隔会更宽松。"
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
                    检查离线缓存、持久存储和本地数据
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
            设置只保存在本机；下一次生成复习队列时生效。
          </p>
        </div>
      </div>
    </main>
  );
}
