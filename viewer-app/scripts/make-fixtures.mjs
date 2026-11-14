#!/usr/bin/env node
// デモ用の見本（fixtures/）を作り直す。使い方: node scripts/make-fixtures.mjs
// - fixtures/out/ に mp4 ×2・poster.png・metrics.json・versions.json・scenes.json、fixtures/NOTES.md を書く
// - out/ には手を付けない（.gitkeep が無ければ置くだけ。中身は消さない）
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fxDir = path.join(root, "fixtures");
const fxOut = path.join(fxDir, "out");
const outDir = path.join(root, "out");

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error("ffmpeg-static の実行ファイルが見つかりません（先に npm install を）");
  process.exit(1);
}
mkdirSync(fxOut, { recursive: true });
mkdirSync(outDir, { recursive: true });

function ffmpeg(args) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    console.error(`ffmpeg が失敗しました（終了コード ${r.status}）`);
    process.exit(1);
  }
}

// 320×180・10fps・90秒・音声あり（正弦波）・小さく
const DURATION = 90;
function makeMp4(name, { freq, filter }) {
  const args = [
    "-f", "lavfi", "-i", `testsrc=size=320x180:rate=10:duration=${DURATION}`,
    "-f", "lavfi", "-i", `sine=frequency=${freq}:sample_rate=22050:duration=${DURATION}`,
  ];
  if (filter) args.push("-vf", filter);
  args.push(
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35", "-pix_fmt", "yuv420p", "-g", "20",
    "-c:a", "aac", "-b:a", "32k", "-ac", "1",
    "-t", String(DURATION),
    "-movflags", "+faststart",
    path.join(fxOut, name),
  );
  ffmpeg(args);
}

makeMp4("vocaforge-intro-1080p.mp4", { freq: 440 });
makeMp4("draft-540p.mp4", { freq: 330, filter: "hue=s=0" }); // 通し版は白黒にして、見分けがつくように
ffmpeg([
  "-ss", "5", "-i", path.join(fxOut, "vocaforge-intro-1080p.mp4"),
  "-frames:v", "1", "-update", "1",
  path.join(fxOut, "poster.png"),
]);

const writeJson = (name, data) => writeFileSync(path.join(fxOut, name), `${JSON.stringify(data, null, 2)}\n`);

const scenes = [
  ["フック", 0, 10.11],
  ["語源でつながる", 10.11, 25.44],
  ["出題が自動で変わる", 25.44, 38.05],
  ["復習の間隔はおまかせ", 38.05, 45.96],
  ["弱点だけ集中", 45.96, 58.32],
  ["続けやすさ", 58.32, 67.46],
  ["語数で成長する", 67.46, 83.53],
  ["締め", 83.53, 89.1],
].map(([title, start_s, end_s], id) => ({
  id,
  title,
  start_s,
  end_s,
  telop: [`仮のテロップ ${id + 1}`],
  lines: [`仮のセリフ ${id + 1} です。`],
}));
writeJson("scenes.json", { scenes });

writeJson("versions.json", { draft: { elapsed_min: 24 }, final: { elapsed_min: 52 } });

writeJson("metrics.json", {
  video: { width: 320, height: 180, fps: 10, duration_s: 90, codec: "h264" },
  audio: {
    codec: "aac",
    sample_rate: 22050,
    channels: 1,
    loudness: { integrated_lufs: -16.4, true_peak_dbtp: -1.2 },
  },
  scenes: { count: 8, shortest_s: 5.57, longest_s: 16.07 },
  checks: [
    { name: "duration", pass: true, value: 90 },
    { name: "silence", pass: true, value: 0 },
  ],
  note: "仮の値",
});

const notes = [
  "# 制作メモ（サンプル）",
  "",
  "これは、表示を確かめるための仮のメモです。動画ができると、実際の `NOTES.md` に置き換わります。",
  "",
  "## 進み具合",
  "",
  "- 通し版を書き出した（経過24分）",
  "- 最終版を書き出した（経過52分）",
  "  - 入れ子の箇条書き",
  "- **太字**、*斜体*、`コード`、[リンク](/api/manifest)",
  "",
  "1. 番号つきの項目",
  "2. 番号つきの項目",
  "",
  "## 版の一覧",
  "",
  "| 版 | ファイル | 経過（分） |",
  "| :-- | :-- | --: |",
  "| 通し版 | `draft-540p.mp4` | 24 |",
  "| 最終版 | `vocaforge-intro-1080p.mp4` | 52 |",
  "",
  "## コマンドの例",
  "",
  "```bash",
  "node scripts/make-fixtures.mjs",
  "```",
  "",
  "> 引用の例です。",
  "",
  "## 安全の確認用",
  "",
  "HTML は、そのまま文字として表示します: <script>alert(1)</script> <b>太字にはならない</b>",
  "",
  "[押しても何も起きないリンクの例](javascript:alert(1))",
  "",
].join("\n");
writeFileSync(path.join(fxDir, "NOTES.md"), notes);

const keep = path.join(outDir, ".gitkeep");
if (!existsSync(keep)) writeFileSync(keep, "");

for (const name of readdirSync(fxOut).sort()) {
  console.log(`fixtures/out/${name}\t${statSync(path.join(fxOut, name)).size} バイト`);
}
console.log(`fixtures/NOTES.md\t${statSync(path.join(fxDir, "NOTES.md")).size} バイト`);
console.log(`out/: ${readdirSync(outDir).join(" ")}`);
