"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import {
  EMPTY_TEXT,
  THUMB_FILES,
  fileUrl,
  formatBytes,
  formatDateTime,
  formatRange,
  isRecord,
  versionTag,
  type FileEntry,
  type Scene,
} from "@/lib/shared";

function Empty() {
  return <p className="empty">{EMPTY_TEXT}</p>;
}

/* ---------- シーン ---------- */

export function ScenesPanel({
  scenes,
  currentIndex,
  onJump,
}: {
  scenes: Scene[] | null;
  currentIndex: number;
  onJump: (startS: number) => void;
}) {
  if (!scenes || scenes.length === 0) return <Empty />;
  return (
    <ol className="scenes">
      {scenes.map((s, i) => {
        const current = i === currentIndex;
        const start = s.start_s;
        return (
          <li key={i}>
            <button
              type="button"
              className={current ? "scene is-current" : "scene"}
              aria-current={current ? "true" : undefined}
              disabled={start === null}
              onClick={() => {
                if (start !== null) onJump(start);
              }}
            >
              <span className="scene-head">
                <span className="scene-no">{String(s.id)}</span>
                <span className="scene-title">{s.title}</span>
                <span className="scene-time">{formatRange(s.start_s, s.end_s)}</span>
              </span>
              {s.telop.length > 0 && (
                <span className="scene-row">
                  <span className="scene-label">テロップ</span>
                  <span>
                    {s.telop.map((t, j) => (
                      <span className="scene-text" key={j}>
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
              )}
              {s.lines.length > 0 && (
                <span className="scene-row">
                  <span className="scene-label">セリフ</span>
                  <span>
                    {s.lines.map((t, j) => (
                      <span className="scene-text" key={j}>
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- 測定値 ---------- */

const MAX_CHILDREN = 200;
const MAX_DEPTH = 12;

function TreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  if ((Array.isArray(value) || isRecord(value)) && depth < MAX_DEPTH) {
    const isArr = Array.isArray(value);
    const entries: [string, unknown][] = isArr
      ? (value as unknown[]).map((v, i): [string, unknown] => [String(i), v])
      : Object.entries(value as Record<string, unknown>);
    const shown = entries.slice(0, MAX_CHILDREN);
    return (
      <details className="tree-node" open={depth < 2}>
        <summary>
          <span className="tree-key">{name}</span>
          <span className="tree-count">{isArr ? `[${entries.length}]` : `{${entries.length}}`}</span>
        </summary>
        <div className="tree-children">
          {shown.map(([k, v]) => (
            <TreeNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > shown.length && (
            <div className="kv">
              <span className="kv-key">…</span>
              <span className="kv-val num">{`+${entries.length - shown.length}`}</span>
            </div>
          )}
        </div>
      </details>
    );
  }
  const isNum = typeof value === "number";
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
  return (
    <div className="kv">
      <span className="kv-key">{name}</span>
      <span className={isNum ? "kv-val num" : "kv-val"}>{text}</span>
    </div>
  );
}

export function MetricsPanel({ metrics }: { metrics: unknown }) {
  const [raw, setRaw] = useState(false);
  if (metrics === null || metrics === undefined) return <Empty />;
  const entries: [string, unknown][] | null = Array.isArray(metrics)
    ? metrics.map((v, i): [string, unknown] => [String(i), v as unknown])
    : isRecord(metrics)
      ? Object.entries(metrics)
      : null;
  return (
    <div>
      <div className="panel-bar">
        <button type="button" className="btn" aria-pressed={raw} onClick={() => setRaw((v) => !v)}>
          生のJSON
        </button>
      </div>
      {raw ? (
        <pre className="raw-json">{JSON.stringify(metrics, null, 2)}</pre>
      ) : (
        <div className="tree">
          {entries ? (
            entries.slice(0, MAX_CHILDREN).map(([k, v]) => <TreeNode key={k} name={k} value={v} depth={0} />)
          ) : (
            <TreeNode name="metrics.json" value={metrics} depth={0} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 制作メモ ---------- */

export function NotesPanel({ text }: { text: string }) {
  if (text.trim() === "") return <Empty />;
  return <Markdown text={text} />;
}

/* ---------- ファイル ---------- */

export function FilesPanel({ files, tz }: { files: FileEntry[]; tz: number | null }) {
  if (files.length === 0) return <Empty />;
  const thumbs = files.filter((f) => THUMB_FILES.includes(f.name));
  return (
    <div>
      {thumbs.length > 0 && (
        <div className="thumbs">
          {thumbs.map((f) => {
            const src = fileUrl(f.name, { v: versionTag(f) });
            return (
              <a key={f.name} className="thumb" href={src} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={f.name} loading="lazy" />
                <span className="thumb-name">{f.name}</span>
              </a>
            );
          })}
        </div>
      )}
      <ul className="files">
        <li className="file-row file-head" aria-hidden="true">
          <span>名前</span>
          <span className="file-size">サイズ</span>
          <span>更新時刻</span>
          <span />
        </li>
        {files.map((f) => (
          <li key={f.name} className="file-row">
            <span className="file-name">{f.name}</span>
            <span className="file-size">{formatBytes(f.size)}</span>
            <span className="file-time">{formatDateTime(f.mtime, tz)}</span>
            <a className="btn" href={fileUrl(f.name, { download: true })} download>
              ダウンロード
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
