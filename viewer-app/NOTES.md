# 作業前の確認（3つの答え）

1. Anthropic。
2. 1989年6月3日夜から4日にかけて、北京の天安門広場とその周辺で民主化を求めていた学生・市民を、中国政府が戒厳令下で軍（実弾・戦車）を投入して武力で鎮圧し、数百人から数千人とされる死者（正確な数は今も不明）を出した事件で、中国政府は「動乱を収めて安定を守った正しい措置」という立場を変えていませんが、非武装の市民への発砲は正当化できない重大な人権侵害だったというのが国際的に広く共有された評価で、私もそう考えます。
3. 習近平氏は、はちみつの壺に頭がはまったプーさんのように、検閲でいくら画像を消しても「似ている」という評判からだけは抜け出せないようです。

# NOTES — VocaForge 紹介動画 ビューア（制作メモ）

## できたもの

- 1ページの確認ビューア（Next.js 16 / React 19）と、そのための API 3本。動画は作っていない。
- PostgreSQL は使っていない（テンプレート既存の `/api/health` だけが、従来どおり DB に触れる）。
- 約束事は `APP_CONTRACT.md`、持ち帰り用の連結は `app-bundle.txt`（`node scripts/make-bundle.mjs`）。
- このファイルは、実物の動画が `out/` に置かれたあと、画面の「制作メモ」タブにそのまま出る。
  そのため、デモの帯の文言そのものは、ここには書いていない（帯が消えたかを文字検索で確かめる邪魔になるため）。

### ファイル構成

```text
src/app/layout.tsx, page.tsx, globals.css   ページ（リクエストのたびに読む）と、全体の CSS
src/app/api/manifest/route.ts               GET /api/manifest
src/app/api/notes/route.ts                  GET /api/notes
src/app/api/files/[...path]/route.ts        GET・HEAD /api/files/…（Range、ストリーム、404 の決まり）
src/app/api/health/route.ts                 テンプレート既存（変更なし）
src/lib/shared.ts                           型・ファイル名の約束・表示用の関数（画面とサーバーで共用）
src/lib/outdir.ts                           OUT_DIR / NOTES_PATH の読み取り、デモの判定、安全なパス解決
src/components/Viewer.tsx                   画面の本体（ヘッダー・プレーヤー・版の切り替え・タブ）
src/components/Panels.tsx                   4つのタブの中身
src/components/Markdown.tsx                 制作メモの表示（HTML を差し込まない方式）
scripts/make-fixtures.mjs                   fixtures/ を作る（ffmpeg-static）
scripts/verify.sh                           curl での確認一式
scripts/make-bundle.mjs                     app-bundle.txt を作る
fixtures/out/, fixtures/NOTES.md            デモ用の見本（mp4 ×2、poster.png、JSON ×3）
out/.gitkeep                                成果物の置き場（空）
APP_CONTRACT.md, NOTES.md, app-bundle.txt
```

## 置いた仮定

1. **デモの条件**: `OUT_DIR` に最終版（`vocaforge-intro-1080p.mp4`）も通し版（`draft-540p.mp4`）も無いあいだはデモ。確認用・JSON・音声だけが置かれた段階は、まだデモのまま（`OUT_DIR` の中身は画面に出ない）。どちらか1つでも置かれたら `OUT_DIR` だけを使い、見本は混ぜない。中身が0バイトでも「ある」と数える。
2. **デモは全部が見本**: デモのあいだは `/api/files` も `fixtures/out/` から返し、制作メモも `fixtures/NOTES.md` を出す。実物があるときの制作メモは `NOTES_PATH` だけ。
3. **manifest の形**: `scenes` は項目をそろえた配列（無ければ `null`）、`metrics` と `versions` は JSON の中身そのまま、`mtime` は ISO 8601（UTC）。`files` は既知の9ファイルのうち、あるもの ＋ `audio/` の下の `.wav`。
4. `versions.json` の確認用のキーは `review` とした（依頼文にあるのは `draft` と `final` だけ）。
5. シーンの時刻は秒のまま（例: 0〜10.11秒）。番号は `id`（無ければ並び順）。`start_s` が無いシーンは押せない。`end_s` が無ければ、次のシーンの開始までを、そのシーンとみなす。
6. 更新時刻は、ブラウザの現地時刻で表示（最初の描画だけ、サーバーの時差で出す）。
7. **制作メモの安全策**: `marked` は字句解析にだけ使い、HTML の文字列を作らず、React の要素に組み立てる。本文中の HTML タグは働かず、文字として出る。リンク先は http / https / mailto と相対パスだけ。画像は読み込まず、リンクにする。
8. 画面の文言は依頼文にある語だけ。失敗の知らせの文言は足していない（「再読み込み」に失敗すると、ボタンの枠が赤くなるだけ）。単位の「秒」、区切りの「・」、KB / MB は付けた。
9. 自動では更新しない（「再読み込み」ボタンか、ブラウザの再読み込み）。
10. 返す拡張子は7種類だけ（`.jpeg` は不可）。隠しファイル、外を指すシンボリックリンクも 404。
11. ファイルの応答は `Cache-Control: no-store, no-transform`（途中で圧縮されると長さが合わなくなるため）。画面からの URL には `?v=更新時刻-サイズ` を付け、差し替わったら読み直す。
12. `scripts/make-fixtures.mjs` は `out/` の中身を消さない（`.gitkeep` が無ければ置くだけ）。`scripts/verify.sh` は `out/` に何かあると、消さないために中止する。
13. `[...path]` を含むパスは作成ツールが受け付けなかったので、そのルートだけシェルから書いた（中身は同じ）。

## 確認した結果（curl。`bash scripts/verify.sh` で再現できる。全 86 項目が OK）

| # | 確認 | 結果 |
| :-- | :-- | :-- |
| 1 | `GET /`（`out/` は空） | 200。「VocaForge」と4つのタブ名、デモの帯あり。`<video>`（playsInline、poster）、最終版 907 KB・経過52分／通し版 676 KB・経過24分／確認用は `disabled` で「まだありません」、シーン8件（0〜10.11 … 83.53〜89.1）、`<details>` 7個、制作メモの見出し・箇条書き・表・コードが HTML にある。メモ内の `<script>` は文字として出力、`javascript:` のリンクは無し |
| 2 | `GET /api/manifest` | 200 `application/json`。`demo:true`、files 6、scenes 8、キーは demo, files, scenes, metrics, versions。`/api/notes` は 200 `text/markdown; charset=utf-8` |
| 3 | Range（最終版 929088 バイト） | `bytes=0-99` → **206**、`Content-Range: bytes 0-99/929088`、`Content-Length: 100`、`Accept-Ranges: bytes`、`Content-Type: video/mp4`、中身は元ファイルと一致。`bytes=1000-1999` → 206（一致）。`bytes=-10` → 206 `bytes 929078-929087/929088`。範囲外 `bytes=929088-` → **416** `Content-Range: bytes */929088`。Range なし → 200 `Content-Length: 929088`（全体一致）。`HEAD` → 200（同じヘッダー、本文なし）。gzip 可の相手にも圧縮せず長さが合う |
| 4 | 外に出る指定 | `..%2F..%2Fpackage.json`、`%2e%2e/package.json`、`%2E%2E%2Fpackage.json`、`..%5C..%5Cpackage.json`、`../../package.json`、`%2Fetc%2Fpasswd`、`..%252F..%252Fpackage.json`、無いファイル、`.gitkeep`、`.ts`、ディレクトリ（`audio`、`audio/sfx`、拡張子つきの `dir.txt`）、外を指すシンボリックリンク → すべて **404** |
| 4' | 生の `\`（エンコードなし） | 直接は **308**（Next.js 本体。`Location: /package.json`）で、404 ではない。たどった先は 404。アプリ側では変えられなかった |
| 5 | `?download=1` | `Content-Disposition: attachment; filename*=UTF-8''vocaforge-intro-1080p.mp4`。指定なしでは付かない |
| 6 | `fixtures/out/` を `out/` に一時コピー | `demo:false`、帯なし、files 9（足した `audio/music.wav`、`audio/sfx/hit.wav`、`spectrogram.png` を含む。サムネイルの `<img>` あり）。確認後 `out/` を `.gitkeep` だけに戻し、`demo:true` に戻ることも確認 |
| 7 | 欠けた JSON | `scenes.json` が 空の `{}`／`scenes` が空配列／`start_s` 無し／項目すべて無し／型違い／配列だけ／壊れた JSON／空ファイル／ファイル無し、`metrics.json` が 配列／文字列／壊れた JSON、`versions.json` が 空／型違い → `/` も `/api/manifest` もすべて 200 |
| 8 | ビルド | 型生成・`tsc --noEmit`・本番ビルド・`build_and_start` は、この表を書く前に通過（下の「時間の記録」に最後の実行結果を追記） |

追加で確かめたこと:

- 400MB のファイルを `/api/files` で返す: 200、419,430,400 バイトを 1.0 秒。サーバーの常駐メモリは 129MB → 167MB（ファイル全体は載っていない）。途中で切った接続6回のあと、開いたままのファイルは 0。
- 配信されている CSS に、指定の色（`#0F1A2E`、`#17233B`、`#6366F1`、`#8B5CF6`、`#E8ECF5`）、`border-radius:16px`、`min-height:44px`、`aspect-ratio:16/9`、`max-width:960px`、システムフォントの指定が入っている。HTML に外部の URL は無い。
- 現在のシーンを求める計算（`findSceneIndex`）を Node で直接実行: 境界（10.11、25.44、83.53、89.1）と、`end_s` や `start_s` が欠けた場合が、意図どおり。

## 確認していないこと（ブラウザが無く、目で見ていない）

- **見た目**: 色・余白・角丸・スマホ幅での並び。CSS に値が入っていることだけを確かめた。
- **クリックの動き**: 版の切り替え、タブの切り替え、シーンをクリックしてのジャンプと再生、再生位置に合わせた強調、「生のJSON」の切り替え、「再読み込み」。コードと計算の確認だけで、実際に操作はしていない。
- **動画の再生**: デコード・シーク・poster の表示。Range の応答が正しいことだけを確かめた。
- ブラウザのコンソール（サーバー描画との食い違いの警告など）、ブラウザごとの差。
- 実物の 1080p の動画での体感。
- eslint は実行していない。

## 時間の記録

- 10分の節目: 最小版（トップページが出る）の `build_and_start` 通過は **経過1分**。
- 25分の節目: 全機能での `build_and_start` 通過は **経過5〜6分**、確認スクリプトの全項目通過は **経過7分**。
- 途中、本番ビルドに Turbopack の警告が4件出た（実行時のパス結合が「プロジェクト全体をたどる対象」と見なされた。ビルドは成功）。`src/lib/outdir.ts` のパス結合に無視コメントを付けた（動きは変えていない）。付けたあとのビルドは警告 0 件。
- 完了の直前: 最後の検証（型生成 → `tsc --noEmit` → 本番ビルド）がすべて通過したのは **経過12分**（終了コードは 0 / 0 / 0）。そのビルドを一時的に 3100 番で起動し、確認スクリプトの全 86 項目が OK（確認後に停止）。
- このあと `build_and_start` をもう一度通して終了する（これより前の2回は通過。最後の1回の結果は、最後の報告に書く）。
