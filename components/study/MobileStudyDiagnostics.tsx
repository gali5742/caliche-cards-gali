"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiCheck,
  FiCopy,
  FiDatabase,
  FiHardDrive,
  FiRefreshCw,
  FiShield,
  FiWifi,
} from "react-icons/fi";

import {
  formatStudyDiagnosticsReport,
  loadStudyDiagnostics,
  type StudyDiagnosticsSnapshot,
} from "../../lib/runtime/studyDiagnostics";
import { requestPersistentStorage } from "../../lib/platform/storageDiagnostics";

function formatBytes(value: number | null): string {
  if (value === null) return "未知";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let next = value / 1024;
  let index = 0;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  return `${next.toFixed(next >= 100 ? 0 : next >= 10 ? 1 : 2)} ${units[index]}`;
}

function StatusBadge({
  value,
  unknownLabel = "未知",
}: {
  value: boolean | null;
  unknownLabel?: string;
}) {
  if (value === null) {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">
        {unknownLabel}
      </span>
    );
  }

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        value
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
          : "border-amber-300/20 bg-amber-300/10 text-amber-200"
      }`}
    >
      {value ? "正常" : "未满足"}
    </span>
  );
}

function DiagnosticRow({
  label,
  value,
  status,
}: {
  label: string;
  value: React.ReactNode;
  status?: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/8 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="flex items-center gap-2 text-right text-sm text-slate-200">
        {value}
        {status !== undefined && <StatusBadge value={status} />}
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
          {icon}
        </div>
        <div className="text-base font-medium text-white">{title}</div>
      </div>
      {children}
    </section>
  );
}

export function MobileStudyDiagnostics() {
  const [snapshot, setSnapshot] = useState<StudyDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await loadStudyDiagnostics());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取诊断信息");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const storagePercent = useMemo(() => {
    const usage = snapshot?.storage.usageBytes;
    const quota = snapshot?.storage.quotaBytes;
    if (usage == null || quota == null || quota <= 0) return null;
    return Math.min(100, (usage / quota) * 100);
  }, [snapshot]);

  const requestPersistence = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      const granted = await requestPersistentStorage();
      await load();
      if (granted === null) {
        setError("当前浏览器不支持请求持久存储，或请求失败。可继续使用，但需要依赖备份防止系统清理数据。");
      } else if (!granted) {
        setError("浏览器这次没有授予持久存储。若使用 iPhone，请从主屏幕安装后的 Web App 中重新打开再试。"
        );
      }
    } finally {
      setRequesting(false);
    }
  }, [load]);

  const copyReport = useCallback(async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(formatStudyDiagnosticsReport(snapshot));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("无法复制诊断结果；可以直接截图这个页面。"
      );
    }
  }, [snapshot]);

  const offlineReady =
    snapshot?.pwa.offlineRoutes.every((route) => route.cached) ?? false;

  return (
    <main className="min-h-[100dvh] bg-[#07111d] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href="/study/settings"
              aria-label="返回设置"
              className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition active:scale-95"
            >
              <FiArrowLeft aria-hidden="true" size={18} />
            </a>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
                device
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-white">
                设备与离线诊断
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 disabled:opacity-40"
            aria-label="刷新诊断"
          >
            <FiRefreshCw aria-hidden="true" size={17} />
          </button>
        </header>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          用于 iPhone/PWA 实机检查。这里不会上传学习数据，只读取当前设备的浏览器能力、缓存和本地数据库计数。
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-5 text-amber-100">
            {error}
          </div>
        )}

        {loading && !snapshot ? (
          <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-500">
            正在检查本机状态…
          </div>
        ) : snapshot ? (
          <div className="mt-6 space-y-4">
            <Panel icon={<FiShield aria-hidden="true" size={17} />} title="存储生存状态">
              <DiagnosticRow
                label="HTTPS / 安全上下文"
                value={snapshot.storage.secureContext ? "是" : "否"}
                status={snapshot.storage.secureContext}
              />
              <DiagnosticRow
                label="主屏幕独立模式"
                value={snapshot.storage.standalone ? "是" : "否"}
                status={snapshot.storage.standalone}
              />
              <DiagnosticRow
                label="Storage API"
                value={snapshot.storage.storageApiSupported ? "可用" : "不可用"}
                status={snapshot.storage.storageApiSupported}
              />
              <DiagnosticRow
                label="持久化模式"
                value={
                  snapshot.storage.persistent === null
                    ? "无法确认"
                    : snapshot.storage.persistent
                      ? "已持久化"
                      : "best-effort"
                }
                status={snapshot.storage.persistent}
              />

              {!snapshot.storage.persistent && snapshot.storage.persistRequestSupported && (
                <button
                  type="button"
                  onClick={() => void requestPersistence()}
                  disabled={requesting}
                  className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {requesting ? "正在请求…" : "请求持久存储"}
                </button>
              )}
            </Panel>

            <Panel icon={<FiHardDrive aria-hidden="true" size={17} />} title="存储空间">
              <DiagnosticRow label="当前使用" value={formatBytes(snapshot.storage.usageBytes)} />
              <DiagnosticRow label="浏览器配额" value={formatBytes(snapshot.storage.quotaBytes)} />
              {storagePercent !== null && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{ width: `${Math.max(1, storagePercent)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-right text-[11px] text-slate-600">
                    已使用约 {storagePercent.toFixed(2)}%
                  </div>
                </div>
              )}
            </Panel>

            <Panel icon={<FiWifi aria-hidden="true" size={17} />} title="PWA 与离线壳">
              <DiagnosticRow
                label="Service Worker"
                value={snapshot.pwa.serviceWorkerSupported ? "支持" : "不支持"}
                status={snapshot.pwa.serviceWorkerSupported}
              />
              <DiagnosticRow
                label="当前页面已被接管"
                value={snapshot.pwa.controlledByServiceWorker ? "是" : "否"}
                status={snapshot.pwa.controlledByServiceWorker}
              />
              <DiagnosticRow
                label="注册状态"
                value={snapshot.pwa.registrationState ?? "无"}
                status={snapshot.pwa.registrationState === "activated"}
              />
              <DiagnosticRow
                label="核心离线页面"
                value={offlineReady ? "全部缓存" : "有缺失"}
                status={offlineReady}
              />
              <div className="mt-3 space-y-2">
                {snapshot.pwa.offlineRoutes.map((route) => (
                  <div
                    key={route.path}
                    className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 font-mono text-[11px]"
                  >
                    <span className="text-slate-500">{route.path}</span>
                    <span className={route.cached ? "text-emerald-300" : "text-amber-200"}>
                      {route.cached ? "cached" : "missing"}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel icon={<FiDatabase aria-hidden="true" size={17} />} title="本地学习数据库">
              <DiagnosticRow label="ReviewItem" value={snapshot.database.reviewItems} />
              <DiagnosticRow label="FSRS 状态" value={snapshot.database.reviewStates} />
              <DiagnosticRow label="ReviewEvent" value={snapshot.database.reviewEvents} />
              <DiagnosticRow label="学习进度" value={snapshot.database.progress} />
              <DiagnosticRow label="设置" value={snapshot.database.settings} />
            </Panel>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
              <div className="text-sm font-medium text-white">iPhone 实机检查顺序</div>
              <ol className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                <li>1. Safari 中添加到主屏幕，再从主屏幕打开。</li>
                <li>2. 确认“主屏幕独立模式”为正常，并请求持久存储。</li>
                <li>3. 完成几张复习，刷新这里确认 ReviewEvent / FSRS 状态增加。</li>
                <li>4. 开飞行模式，彻底关闭 Web App 后重新打开，检查首页、复习页和设置页。</li>
                <li>5. 恢复网络后再次打开，确认原学习状态仍在。</li>
              </ol>
            </section>

            <button
              type="button"
              onClick={() => void copyReport()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
            >
              {copied ? (
                <>
                  <FiCheck aria-hidden="true" size={16} />
                  已复制诊断结果
                </>
              ) : (
                <>
                  <FiCopy aria-hidden="true" size={16} />
                  复制诊断结果
                </>
              )}
            </button>
          </div>
        ) : null}

        <footer className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-slate-700">
          local only · no upload
        </footer>
      </div>
    </main>
  );
}
