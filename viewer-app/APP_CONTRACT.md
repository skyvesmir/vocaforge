# APP_CONTRACT — 動画を作る工程と、ビューアの約束事

ビューアは `out/` に置かれたファイルを「見る・ダウンロードする」だけで、動画は作らない。
ファイルはアプリの起動後に置かれる前提で、**リクエストのたびに読む**（ビルド時には読まない）。

## 1. 置き場所（環境変数）

| 環境変数 | 既定 | 意味 |
| :-- | :-- | :-- |
| `OUT_DIR` | `./out` | 成果物のフォルダ（相対パスは、アプリの作業ディレクトリから） |
| `NOTES_PATH` | `./NOTES.md` | 制作メモ（Markdown） |

デモ用の見本は `fixtures/out/` と `fixtures/NOTES.md`（固定の場所。`node scripts/make-fixtures.mjs` で作り直せる）。

## 2. `OUT_DIR` に置けるファイル（すべて、無くてよい）

| ファイル | 役割 |
| :-- | :-- |
| `vocaforge-intro-1080p.mp4` | 最終版（`versions.json` のキーは `final`） |
| `draft-540p.mp4` | 通し版（キーは `draft`） |
| `review-720p.mp4` | 確認用（キーは `review` と仮定） |
| `poster.png` | プレーヤーの poster |
| `contact-sheet.jpg` / `spectrogram.png` | 「ファイル」タブにサムネイルで表示 |
| `metrics.json` | 自由な形の JSON（木で表示） |
| `versions.json` | `{"draft":{"elapsed_min":24},"final":{"elapsed_min":52}}`。項目は欠けてよい |
| `scenes.json` | 下記 |
| `audio/**/*.wav` | `music.wav`、`mix.wav`、`sfx/` の下など（下の階層まで一覧に出す） |

`scenes.json` の形（どの項目も欠けてよい。配列だけの形も読む）:

```json
{"scenes":[{"id":0,"title":"フック","start_s":0,"end_s":10.11,"telop":["…"],"lines":["…"]}]}
```

- `id` が無ければ並び順（0 から）。`start_s` が無いシーンは、押してもジャンプしない。
- `end_s` が無ければ、次のシーンの開始までを、そのシーンとみなす。
- `telop` / `lines` は、文字列の配列（文字列1つでもよい）。
- JSON として読めない（書きかけ）あいだは「無い」のと同じ扱い。

## 3. デモ表示（見本）の決まり

- `OUT_DIR` に **最終版も通し版も無い** あいだはデモ: 画面・API とも `fixtures/out/` と `fixtures/NOTES.md` を **代わりに** 使い、ページの上に帯を出す。
  このあいだ、`OUT_DIR` にある他のファイル（確認用・JSON・音声）は画面に出ない。
- 最終版か通し版の **どちらか1つでも** `OUT_DIR` にあれば、`OUT_DIR` と `NOTES_PATH` だけを使う。見本は一切混ぜない（無いものは「まだありません」）。

## 4. API（すべて `dynamic = 'force-dynamic'`）

| メソッドとパス | 応答 |
| :-- | :-- |
| `GET /api/manifest` | `{ demo, files:[{name,size,mtime}], scenes, metrics, versions }` |
| `GET /api/notes` | 制作メモの本文。`text/markdown; charset=utf-8`。無ければ空文字（200） |
| `GET` / `HEAD /api/files/[...path]` | ファイル本体（ストリーム）。Range 対応 |
| `GET /api/health` | テンプレート既存（DB に `select 1`） |

`/api/manifest` の詳細:

- `demo`: 真偽値。
- `files`: 上の表の既知ファイルのうち、あるもの ＋ `audio/` の下の `.wav`。`name` は `/` 区切りの相対パス、`size` はバイト数、`mtime` は ISO 8601（UTC）。
- `scenes`: そろえた形の配列 `[{id,title,start_s,end_s,telop,lines}]`（欠けた数値は `null`、欠けた配列は `[]`）。`scenes.json` が無い・読めないときは `null`。
- `metrics`: `metrics.json` の中身そのまま。無ければ `null`。
- `versions`: `versions.json` の中身（オブジェクト）。無い・オブジェクトでないときは `null`。

`/api/files/[...path]` の詳細:

- 常に `Accept-Ranges: bytes`。`Range: bytes=a-b` / `a-` / `-n` → `206` と `Content-Range: bytes a-b/全体`、`Content-Length`。範囲外 → `416` と `Content-Range: bytes */全体`。Range なし（または複数範囲・不正な書式）→ `200` で全体。
- `Content-Type` は拡張子から: `mp4`→`video/mp4`、`png`→`image/png`、`jpg`→`image/jpeg`、`json`→`application/json; charset=utf-8`、`wav`→`audio/wav`、`md`→`text/markdown; charset=utf-8`、`txt`→`text/plain; charset=utf-8`。
- `?download=1` → `Content-Disposition: attachment; filename*=UTF-8''<名前>`。
- ほかに `ETag`、`Last-Modified`、`Cache-Control: no-store, no-transform`、`X-Content-Type-Options: nosniff`。`If-Range` が合わなければ全体を返す。
- **404 になるもの**: 無いファイル、ディレクトリ、上の7種類以外の拡張子（`.jpeg` も不可）、`..`・`.`・隠しファイル（`.` 始まり）、絶対パス、`%2e%2e`・`%2F`・`%5C` などエンコードした指定（二重エンコードも）、`\`・`:`・制御文字を含む名前、実体が外にあるシンボリックリンク。
- 例外（アプリ側では変えられない）: エンコードしていない生の `\` を含む URL は、Next.js 本体が先に `308`（`/` に直した URL へ）を返す。その行き先は `404`。
- デモのあいだは、同じ URL が `fixtures/out/` の中身を返す。

## 5. 再現のしかた

```bash
node scripts/make-fixtures.mjs      # fixtures/ を作り直す（ffmpeg-static を使用）
bash scripts/verify.sh              # 起動中の http://localhost:3000 に、curl で一通りの確認
node scripts/make-bundle.mjs        # app-bundle.txt を作り直す
```
