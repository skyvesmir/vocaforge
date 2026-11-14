// サーバー専用: OUT_DIR / NOTES_PATH を「リクエストのたびに」読む（ビルド時には読まない）。
import { promises as fs } from "node:fs";
import path from "node:path";
import { KNOWN_FILES, VERSION_DEFS, isRecord, normalizeScenes, type FileEntry, type Manifest } from "./shared";

/** 返してよい拡張子（この7種類だけ）と Content-Type。 */
export const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_NOTES_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_FILES = 1000;

const cwd = () => process.cwd();

export function outDir(): string {
  return path.resolve(/* turbopackIgnore: true */ cwd(), process.env.OUT_DIR || "out");
}
export function notesPath(): string {
  return path.resolve(/* turbopackIgnore: true */ cwd(), process.env.NOTES_PATH || "NOTES.md");
}
export function fixturesOutDir(): string {
  return path.resolve(/* turbopackIgnore: true */ cwd(), "fixtures", "out");
}
export function fixturesNotesPath(): string {
  return path.resolve(/* turbopackIgnore: true */ cwd(), "fixtures", "NOTES.md");
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

export type ActiveRoot = { demo: boolean; root: string };

/**
 * OUT_DIR に、最終版も通し版も無いときだけデモ（fixtures/out を「代わりに」使う）。
 * どちらか1つでもあれば OUT_DIR だけを使い、fixtures は一切混ぜない。
 */
export async function activeRoot(): Promise<ActiveRoot> {
  const dir = outDir();
  const [hasFinal, hasDraft] = await Promise.all([
    isFile(path.join(/* turbopackIgnore: true */ dir, VERSION_DEFS[0].file)),
    isFile(path.join(/* turbopackIgnore: true */ dir, VERSION_DEFS[1].file)),
  ]);
  const demo = !hasFinal && !hasDraft;
  return { demo, root: demo ? fixturesOutDir() : dir };
}

async function statEntry(root: string, rel: string): Promise<FileEntry | null> {
  try {
    const st = await fs.stat(path.join(/* turbopackIgnore: true */ root, rel));
    if (!st.isFile()) return null;
    return { name: rel, size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return null;
  }
}

/** audio/ の下の .wav を、下の階層（sfx/ など）まで集める。 */
async function listWavs(root: string, relDir: string, depth: number, acc: FileEntry[]): Promise<FileEntry[]> {
  if (depth > 4 || acc.length >= MAX_AUDIO_FILES) return acc;
  let entries;
  try {
    entries = await fs.readdir(path.join(/* turbopackIgnore: true */ root, relDir), { withFileTypes: true });
  } catch {
    return acc;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name.startsWith(".") || acc.length >= MAX_AUDIO_FILES) continue;
    const rel = `${relDir}/${e.name}`;
    if (e.isDirectory()) {
      await listWavs(root, rel, depth + 1, acc);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".wav")) {
      const entry = await statEntry(root, rel);
      if (entry) acc.push(entry);
    }
  }
  return acc;
}

/** JSON を読む。無い・大きすぎる・壊れている（書きかけ）ときは null。 */
async function readJson(root: string, rel: string): Promise<unknown> {
  try {
    const p = path.join(/* turbopackIgnore: true */ root, rel);
    const st = await fs.stat(p);
    if (!st.isFile() || st.size > MAX_JSON_BYTES) return null;
    let text = await fs.readFile(p, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const parsed: unknown = JSON.parse(text);
    return parsed === undefined ? null : parsed;
  } catch {
    return null;
  }
}

export async function getManifest(active?: ActiveRoot): Promise<Manifest> {
  const { demo, root } = active ?? (await activeRoot());
  const [known, wavs, scenesRaw, metrics, versionsRaw] = await Promise.all([
    Promise.all(KNOWN_FILES.map((name) => statEntry(root, name))),
    listWavs(root, "audio", 0, []),
    readJson(root, "scenes.json"),
    readJson(root, "metrics.json"),
    readJson(root, "versions.json"),
  ]);
  const files: FileEntry[] = [];
  for (const f of known) if (f) files.push(f);
  files.push(...wavs);
  return {
    demo,
    files,
    scenes: normalizeScenes(scenesRaw),
    metrics: metrics ?? null,
    versions: isRecord(versionsRaw) ? versionsRaw : null,
  };
}

/** 制作メモの本文。デモのときは fixtures/NOTES.md、それ以外は NOTES_PATH。無ければ空文字。 */
export async function getNotes(active?: ActiveRoot): Promise<string> {
  const { demo } = active ?? (await activeRoot());
  const p = demo ? fixturesNotesPath() : notesPath();
  try {
    const st = await fs.stat(p);
    if (!st.isFile()) return "";
    let text: string;
    if (st.size > MAX_NOTES_BYTES) {
      const fh = await fs.open(p, "r");
      try {
        const buf = Buffer.alloc(MAX_NOTES_BYTES);
        const { bytesRead } = await fh.read(buf, 0, MAX_NOTES_BYTES, 0);
        text = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await fh.close();
      }
    } else {
      text = await fs.readFile(p, "utf8");
    }
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return "";
  }
}

export type ResolvedFile = { abs: string; name: string; type: string };

/** 何重かにエンコードされた指定（%252e など）も、ほどいてから調べる。 */
function decodeSegment(seg: string): string | null {
  let cur = seg;
  for (let i = 0; i < 4; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      return cur; // % を含むだけの、ふつうの名前として扱う
    }
    if (next === cur) return cur;
    cur = next;
  }
  return null;
}

/**
 * /api/files/[...path] の指定を、root の中の実在するファイルに解決する。だめなら null（→ 404）。
 * - 「..」「.」・隠しファイル・「/」「\」「:」・制御文字を含む区間は不可（絶対パス・%2e%2e・バックスラッシュ対策）
 * - 拡張子は MIME にある7種類だけ
 * - シンボリックリンクをたどった実体が root の外なら不可
 * - ディレクトリは不可
 */
export async function resolveFile(root: string, segments: readonly string[]): Promise<ResolvedFile | null> {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 16) return null;
  const parts: string[] = [];
  for (const raw of segments) {
    if (typeof raw !== "string") return null;
    const seg = decodeSegment(raw);
    if (seg === null || seg === "" || seg.length > 255) return null;
    if (seg === "." || seg === ".." || seg.startsWith(".")) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\\/:\u0000-\u001f\u007f]/.test(seg)) return null;
    parts.push(seg);
  }
  const name = parts[parts.length - 1];
  const ext = path.extname(name).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MIME, ext)) return null;
  const abs = path.resolve(/* turbopackIgnore: true */ root, ...parts);
  if (!abs.startsWith(root + path.sep)) return null;
  try {
    const [realRoot, real] = await Promise.all([fs.realpath(root), fs.realpath(abs)]);
    if (!real.startsWith(realRoot + path.sep)) return null;
    const st = await fs.stat(real);
    if (!st.isFile()) return null;
    return { abs: real, name, type: MIME[ext] };
  } catch {
    return null;
  }
}
