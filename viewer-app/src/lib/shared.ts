// 画面（クライアント）とサーバーの両方で使う、型・約束事・表示用の小さな関数。
// Node 専用の機能（fs など）は、ここでは使わない。

export type FileEntry = { name: string; size: number; mtime: string };

export type Scene = {
  id: number | string;
  title: string;
  start_s: number | null;
  end_s: number | null;
  telop: string[];
  lines: string[];
};

export type Manifest = {
  demo: boolean;
  files: FileEntry[];
  scenes: Scene[] | null;
  metrics: unknown;
  versions: Record<string, unknown> | null;
};

/** 版の並び順は、最初に開く版を決める順（最終版→通し版→確認用）でもある。 */
export const VERSION_DEFS = [
  { key: "final", label: "最終版", file: "vocaforge-intro-1080p.mp4" },
  { key: "draft", label: "通し版", file: "draft-540p.mp4" },
  { key: "review", label: "確認用", file: "review-720p.mp4" },
] as const;

export type VersionKey = (typeof VERSION_DEFS)[number]["key"];

export const POSTER_FILE = "poster.png";
export const THUMB_FILES: readonly string[] = ["contact-sheet.jpg", "spectrogram.png"];

export const KNOWN_FILES: readonly string[] = [
  "vocaforge-intro-1080p.mp4",
  "draft-540p.mp4",
  "review-720p.mp4",
  "poster.png",
  "contact-sheet.jpg",
  "spectrogram.png",
  "metrics.json",
  "versions.json",
  "scenes.json",
];

export const EMPTY_TEXT = "まだありません";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringList(v: unknown): string[] {
  if (typeof v === "string") return v === "" ? [] : [v];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      if (x !== "") out.push(x);
    } else if (typeof x === "number" && Number.isFinite(x)) {
      out.push(String(x));
    }
  }
  return out;
}

/**
 * scenes.json の中身を、どの項目が欠けていても落ちない形にそろえる。
 * ファイルが無い・JSONとして読めないとき（null）は null のまま返す。
 * {"scenes":[…]} の形のほか、配列だけの形も受け付ける。
 */
export function normalizeScenes(raw: unknown): Scene[] | null {
  if (raw === null || raw === undefined) return null;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw) && Array.isArray(raw.scenes)) list = raw.scenes;
  return list.slice(0, 2000).map((item, i) => {
    const o = isRecord(item) ? item : {};
    let id: number | string = i;
    if (typeof o.id === "number" && Number.isFinite(o.id)) id = o.id;
    else if (typeof o.id === "string" && o.id !== "") id = o.id;
    return {
      id,
      title: typeof o.title === "string" ? o.title : "",
      start_s: toNumber(o.start_s),
      end_s: toNumber(o.end_s),
      telop: toStringList(o.telop),
      lines: toStringList(o.lines),
    };
  });
}

/** /api/manifest の応答を、形が崩れていても落ちないように受け取る。 */
export function coerceManifest(x: unknown): Manifest {
  const m = isRecord(x) ? x : {};
  const files: FileEntry[] = [];
  if (Array.isArray(m.files)) {
    for (const f of m.files) {
      if (isRecord(f) && typeof f.name === "string" && f.name !== "") {
        files.push({
          name: f.name,
          size: typeof f.size === "number" && Number.isFinite(f.size) ? f.size : 0,
          mtime: typeof f.mtime === "string" ? f.mtime : "",
        });
      }
    }
  }
  return {
    demo: m.demo === true,
    files,
    scenes: normalizeScenes(m.scenes),
    metrics: m.metrics === undefined ? null : m.metrics,
    versions: isRecord(m.versions) ? m.versions : null,
  };
}

/** いま再生している位置のシーン（無ければ -1）。end_s が無いシーンは、次のシーンの開始までとみなす。 */
export function findSceneIndex(scenes: Scene[] | null, t: number): number {
  if (!scenes || !Number.isFinite(t)) return -1;
  const tt = t + 0.02; // ジャンプ直後の、わずかな誤差を吸収する
  let found = -1;
  for (let i = 0; i < scenes.length; i++) {
    const start = scenes[i].start_s;
    if (start === null) continue;
    let end = scenes[i].end_s;
    if (end === null) {
      end = Infinity;
      for (let j = i + 1; j < scenes.length; j++) {
        const next = scenes[j].start_s;
        if (next !== null && next > start) {
          end = next;
          break;
        }
      }
    }
    if (tt >= start && tt < end) found = i;
  }
  return found;
}

/** 更新のたびに URL が変わるようにする印（キャッシュよけ）。 */
export function versionTag(f: FileEntry): string {
  return `${Date.parse(f.mtime) || 0}-${f.size}`;
}

export function fileUrl(name: string, opts?: { download?: boolean; v?: string }): string {
  const p = name.split("/").map(encodeURIComponent).join("/");
  const q: string[] = [];
  if (opts?.download) q.push("download=1");
  if (opts?.v) q.push(`v=${encodeURIComponent(opts.v)}`);
  return `/api/files/${p}${q.length > 0 ? `?${q.join("&")}` : ""}`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 更新時刻の表示（YYYY-MM-DD HH:mm）。
 * offsetMin は Date#getTimezoneOffset() と同じ向き（日本時間なら -540）。null なら、その環境の現地時刻。
 * サーバーとブラウザで最初の描画をそろえるため、最初はサーバーの時差を渡し、あとでブラウザの現地時刻に直す。
 */
export function formatDateTime(iso: string, offsetMin: number | null): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const off = offsetMin === null ? new Date(t).getTimezoneOffset() : offsetMin;
  const d = new Date(t - off * 60000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

const sec = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : String(Math.round(n * 100) / 100));

/** シーンの区間（start_s〜end_s、秒）。 */
export function formatRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return "—";
  return `${sec(start)}〜${sec(end)}秒`;
}
