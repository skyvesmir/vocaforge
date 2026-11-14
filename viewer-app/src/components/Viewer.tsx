"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  EMPTY_TEXT,
  POSTER_FILE,
  VERSION_DEFS,
  coerceManifest,
  fileUrl,
  findSceneIndex,
  formatBytes,
  formatDateTime,
  isRecord,
  versionTag,
  type FileEntry,
  type Manifest,
  type VersionKey,
} from "@/lib/shared";
import { FilesPanel, MetricsPanel, NotesPanel, ScenesPanel } from "./Panels";

type TabKey = "scenes" | "metrics" | "notes" | "files";

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "scenes", label: "シーン" },
  { key: "metrics", label: "測定値" },
  { key: "notes", label: "制作メモ" },
  { key: "files", label: "ファイル" },
];

const noopSubscribe = () => () => {};

/** versions.json の「経過◯分」。項目が欠けていれば null。 */
function elapsedMin(versions: Manifest["versions"], key: string): number | null {
  const v = versions ? versions[key] : null;
  if (!isRecord(v)) return null;
  const n = v.elapsed_min;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export default function Viewer({
  initialManifest,
  initialNotes,
  tzOffsetMin,
}: {
  initialManifest: Manifest;
  initialNotes: string;
  tzOffsetMin: number;
}) {
  const [manifest, setManifest] = useState<Manifest>(initialManifest);
  const [notes, setNotes] = useState(initialNotes);
  const [tab, setTab] = useState<TabKey>("scenes");
  const [picked, setPicked] = useState<VersionKey | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 最初の描画はサーバーと同じ時差で出し、ブラウザで動き出したら現地時刻に直す
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const tz = hydrated ? null : tzOffsetMin;

  const byName = useMemo(() => {
    const m = new Map<string, FileEntry>();
    for (const f of manifest.files) m.set(f.name, f);
    return m;
  }, [manifest.files]);

  // 開く版: 選んだ版があればそれ。無ければ、最終版→通し版→確認用の順で、あるもの。
  const activeDef =
    VERSION_DEFS.find((v) => v.key === picked && byName.has(v.file)) ?? VERSION_DEFS.find((v) => byName.has(v.file)) ?? null;
  const activeFile = activeDef ? (byName.get(activeDef.file) ?? null) : null;
  const poster = byName.get(POSTER_FILE);
  const videoSrc = activeFile ? fileUrl(activeFile.name, { v: versionTag(activeFile) }) : null;
  const posterSrc = poster ? fileUrl(poster.name, { v: versionTag(poster) }) : undefined;

  const scenes = manifest.scenes;
  const syncScene = useCallback(
    (t: number) => {
      const idx = findSceneIndex(scenes, t);
      setCurrentIndex((prev) => (prev === idx ? prev : idx));
    },
    [scenes],
  );

  // シーンをクリック → その start_s へジャンプして再生
  const jump = useCallback(
    (startS: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = Math.max(0, startS);
      const seek = () => {
        try {
          v.currentTime = t;
        } catch {
          // 読み込み前で動かせないときは、何もしない
        }
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener("loadedmetadata", seek, { once: true });
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      syncScene(t);
    },
    [syncScene],
  );

  const wasDemo = manifest.demo;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, nRes] = await Promise.all([
        fetch("/api/manifest", { cache: "no-store" }),
        fetch("/api/notes", { cache: "no-store" }),
      ]);
      if (!mRes.ok) throw new Error(String(mRes.status));
      const next = coerceManifest(await mRes.json());
      const nextNotes = nRes.ok ? await nRes.text() : "";
      if (next.demo !== wasDemo) {
        // 中身がまるごと入れ替わったので、開く版を選び直す
        setPicked(null);
        setCurrentIndex(-1);
      }
      setManifest(next);
      setNotes(nextNotes);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [wasDemo]);

  return (
    <>
      {manifest.demo && (
        <div className="demo-banner" role="status">
          サンプル表示です（動画ができると、この表示は消えます）
        </div>
      )}
      <div className="app">
        <header className="header">
          <h1 className="title">VocaForge 紹介動画 ビューア</h1>
          <button
            type="button"
            className={failed ? "btn is-error" : "btn"}
            onClick={reload}
            disabled={loading}
            aria-busy={loading}
          >
            再読み込み
          </button>
        </header>

        <section className="card">
          <div className="video-wrap">
            {videoSrc ? (
              <video
                key={videoSrc}
                ref={videoRef}
                className="video"
                controls
                playsInline
                preload="metadata"
                poster={posterSrc}
                src={videoSrc}
                onLoadedMetadata={(e) => syncScene(e.currentTarget.currentTime)}
                onTimeUpdate={(e) => syncScene(e.currentTarget.currentTime)}
                onSeeked={(e) => syncScene(e.currentTarget.currentTime)}
              />
            ) : (
              <p className="empty">{EMPTY_TEXT}</p>
            )}
          </div>

          <div className="versions" role="group" aria-label="版の切り替え">
            {VERSION_DEFS.map((v) => {
              const f = byName.get(v.file);
              const el = elapsedMin(manifest.versions, v.key);
              const meta = f
                ? [formatBytes(f.size), formatDateTime(f.mtime, tz), el !== null ? `経過${el}分` : ""]
                    .filter((x) => x !== "")
                    .join("・")
                : EMPTY_TEXT;
              return (
                <button
                  key={v.key}
                  type="button"
                  className="version"
                  disabled={!f}
                  aria-pressed={activeDef?.key === v.key}
                  onClick={() => {
                    setPicked(v.key);
                    setCurrentIndex(-1);
                  }}
                >
                  <span className="version-label">{v.label}</span>
                  <span className="version-meta">{meta}</span>
                </button>
              );
            })}
          </div>

          <div className="player-actions">
            {activeFile ? (
              <a className="btn btn-primary" href={fileUrl(activeFile.name, { download: true })} download>
                ダウンロード
              </a>
            ) : (
              <button type="button" className="btn btn-primary" disabled>
                ダウンロード
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="tabs" role="tablist" aria-label="タブ">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-controls={`panel-${t.key}`}
                aria-selected={tab === t.key}
                className="tab"
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="panel-scenes" aria-labelledby="tab-scenes" hidden={tab !== "scenes"}>
            <ScenesPanel scenes={scenes} currentIndex={currentIndex} onJump={jump} />
          </div>
          <div role="tabpanel" id="panel-metrics" aria-labelledby="tab-metrics" hidden={tab !== "metrics"}>
            <MetricsPanel metrics={manifest.metrics} />
          </div>
          <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== "notes"}>
            <NotesPanel text={notes} />
          </div>
          <div role="tabpanel" id="panel-files" aria-labelledby="tab-files" hidden={tab !== "files"}>
            <FilesPanel files={manifest.files} tz={tz} />
          </div>
        </section>
      </div>
    </>
  );
}
