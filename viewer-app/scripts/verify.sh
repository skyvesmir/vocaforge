#!/usr/bin/env bash
# 6章の確認を curl で行う。使い方: bash scripts/verify.sh [BASE_URL]   （既定は http://localhost:3000）
# 途中で fixtures/out を out/ に一時コピーし、最後に out/ を .gitkeep だけに戻す。
# out/ に .gitkeep 以外があるときは、消してしまわないよう、何もせずに終わる。
set -u
BASE="${1:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
FX="$ROOT/fixtures/out"
TMP="$(mktemp -d)"
PASS=0
FAIL=0
BAND='サンプル表示です（動画ができると、この表示は消えます）'
MP4='vocaforge-intro-1080p.mp4'

ok() { PASS=$((PASS + 1)); echo "  OK $*"; }
ng() { FAIL=$((FAIL + 1)); echo "  NG $*"; }
eq() { if [ "$2" = "$3" ]; then ok "$1 → $3"; else ng "$1 → $3（期待: $2）"; fi; }
code() { curl -s -g -o /dev/null -w '%{http_code}' "$@"; }
st() { head -n 1 "$1" | tr -d '\r' | awk '{print $2}'; }
hd() { tr -d '\r' < "$1" | grep -i "^$2:" | head -n 1 | sed 's/^[^:]*: *//'; }
has() { if grep -qF -- "$2" "$1"; then ok "$3 がある"; else ng "$3 が無い"; fi; }
hasnot() { if grep -qF -- "$2" "$1"; then ng "$3 がある"; else ok "$3 は無い"; fi; }
mf() {
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=m.scenes;console.log("demo="+m.demo+" files="+(Array.isArray(m.files)?m.files.length:"?")+" scenes="+(Array.isArray(s)?s.length:String(s))+" metrics="+(m.metrics===null?"null":Array.isArray(m.metrics)?"array":typeof m.metrics)+" versions="+(m.versions?Object.keys(m.versions).join("+"):"null")+" keys="+Object.keys(m).join(","))' "$1" 2>/dev/null || echo 'JSONとして読めない'
}
reset_out() { mkdir -p "$OUT"; find "$OUT" -mindepth 1 ! -name .gitkeep -delete 2>/dev/null; : > "$OUT/.gitkeep"; }

if [ -n "$(find "$OUT" -mindepth 1 ! -name .gitkeep -print -quit 2>/dev/null)" ]; then
  echo "out/ に .gitkeep 以外があるので中止（消さないため）"; exit 2
fi
if [ "$(code "$BASE/api/health")" != "200" ]; then echo "$BASE に届かない"; exit 2; fi
if [ ! -f "$FX/$MP4" ]; then echo "fixtures が無い（node scripts/make-fixtures.mjs を先に）"; exit 2; fi
trap 'reset_out; rm -rf "$TMP"' EXIT
SIZE=$(stat -c %s "$FX/$MP4")
F="$BASE/api/files/$MP4"

echo "[1] /（out/ は空 → デモ）"
eq "GET /" 200 "$(curl -s -o "$TMP/a.html" -w '%{http_code}' "$BASE/")"
for w in VocaForge シーン 測定値 制作メモ ファイル 再読み込み 最終版 通し版 確認用 まだありません 経過52分 経過24分 '0〜10.11' '83.53〜89.1'; do
  has "$TMP/a.html" "$w" "「$w」"
done
has "$TMP/a.html" "$BAND" "帯「$BAND」"
has "$TMP/a.html" 'playsInline' "video の playsInline" 2>/dev/null
for t in '<video' 'poster="/api/files/poster.png' '<div class="md">' '<h2>' '<ul><li>' '<table>' '<pre><code>' '<details'; do
  has "$TMP/a.html" "$t" "$t"
done
has "$TMP/a.html" '&lt;script&gt;alert(1)&lt;/script&gt;' "文字として出た <script>"
hasnot "$TMP/a.html" '<script>alert(1)' "生の <script>alert(1)"
hasnot "$TMP/a.html" 'href="javascript:' "javascript: のリンク"

echo "[2] /api/manifest と /api/notes"
curl -s -D "$TMP/m.h" -o "$TMP/m.json" "$BASE/api/manifest"
eq "GET /api/manifest" "200 application/json" "$(st "$TMP/m.h") $(hd "$TMP/m.h" content-type)"
M="$(mf "$TMP/m.json")"; echo "     $M"
case "$M" in demo=true*) ok "demo:true";; *) ng "demo:true ではない";; esac
curl -s -D "$TMP/n.h" -o "$TMP/n.md" "$BASE/api/notes"
eq "GET /api/notes" "200 text/markdown; charset=utf-8" "$(st "$TMP/n.h") $(hd "$TMP/n.h" content-type)"

echo "[3] Range（$MP4 = $SIZE バイト）"
curl -s -D "$TMP/r.h" -o "$TMP/r.bin" -H 'Range: bytes=0-99' "$F"
eq "Range: bytes=0-99 のステータス" 206 "$(st "$TMP/r.h")"
eq "Content-Range" "bytes 0-99/$SIZE" "$(hd "$TMP/r.h" content-range)"
eq "Content-Length" 100 "$(hd "$TMP/r.h" content-length)"
eq "Accept-Ranges" bytes "$(hd "$TMP/r.h" accept-ranges)"
eq "Content-Type" video/mp4 "$(hd "$TMP/r.h" content-type)"
eq "受け取ったバイト数" 100 "$(stat -c %s "$TMP/r.bin")"
if head -c 100 "$FX/$MP4" | cmp -s - "$TMP/r.bin"; then ok "中身が元ファイルの先頭100バイトと一致"; else ng "中身が一致しない"; fi
curl -s -D "$TMP/r2.h" -o "$TMP/r2.bin" -H 'Range: bytes=1000-1999' "$F"
eq "Range: bytes=1000-1999" "206 bytes 1000-1999/$SIZE" "$(st "$TMP/r2.h") $(hd "$TMP/r2.h" content-range)"
if tail -c +1001 "$FX/$MP4" | head -c 1000 | cmp -s - "$TMP/r2.bin"; then ok "中身が元ファイルの同じ位置と一致"; else ng "中身が一致しない"; fi
curl -s -D "$TMP/r3.h" -o /dev/null -H 'Range: bytes=-10' "$F"
eq "Range: bytes=-10" "206 bytes $((SIZE - 10))-$((SIZE - 1))/$SIZE" "$(st "$TMP/r3.h") $(hd "$TMP/r3.h" content-range)"
curl -s -D "$TMP/r4.h" -o /dev/null -H "Range: bytes=$SIZE-" "$F"
eq "範囲外 Range: bytes=$SIZE-" "416 bytes */$SIZE" "$(st "$TMP/r4.h") $(hd "$TMP/r4.h" content-range)"
curl -s -D "$TMP/r5.h" -o "$TMP/full.bin" "$F"
eq "Range なし" "200 $SIZE" "$(st "$TMP/r5.h") $(hd "$TMP/r5.h" content-length)"
if cmp -s "$FX/$MP4" "$TMP/full.bin"; then ok "全体が元ファイルと一致"; else ng "全体が一致しない"; fi
curl -s -I -o "$TMP/h.h" "$F"
eq "HEAD" "200 $SIZE video/mp4 bytes" "$(st "$TMP/h.h") $(hd "$TMP/h.h" content-length) $(hd "$TMP/h.h" content-type) $(hd "$TMP/h.h" accept-ranges)"
curl -s -D "$TMP/g.h" -o /dev/null -H 'Accept-Encoding: gzip, br' -H 'Range: bytes=0-99' "$BASE/api/files/metrics.json"
eq "gzip 可の相手にも圧縮しない（metrics.json, bytes=0-99）" "206 100 []" "$(st "$TMP/g.h") $(hd "$TMP/g.h" content-length) [$(hd "$TMP/g.h" content-encoding)]"
for p in poster.png metrics.json; do
  curl -s -I -o "$TMP/t.h" "$BASE/api/files/$p"; echo "     $p → $(st "$TMP/t.h") $(hd "$TMP/t.h" content-type)"
done

echo "[4] 外に出る指定など（すべて 404 のはず）"
for p in '..%2F..%2Fpackage.json' '%2e%2e/package.json' '%2E%2E%2Fpackage.json' '..%5C..%5Cpackage.json' '../../package.json' '%2Fetc%2Fpasswd' '..%252F..%252Fpackage.json' 'nope.mp4' '.gitkeep'; do
  eq "/api/files/$p" 404 "$(code --path-as-is "$BASE/api/files/$p")"
done
# 生のバックスラッシュ（%5C ではなく \ そのもの）は、このアプリに届く前に Next.js 本体が
# 308（スラッシュに直した URL へ）を返す。直接の 404 にはできないので、たどった先が 404 であることを確かめる。
BS="$BASE/api/files/..\\..\\package.json"
curl -s -g --path-as-is -D "$TMP/bs.h" -o /dev/null "$BS"
echo "     生の \\ そのもの: 直接は $(st "$TMP/bs.h")（Location: $(hd "$TMP/bs.h" location)）← 404 ではない"
eq "生の \\ をたどった先" 404 "$(code --path-as-is -L "$BS")"

echo "[5] ?download=1"
curl -s -I -o "$TMP/d.h" "$F?download=1"
eq "Content-Disposition" "attachment; filename*=UTF-8''$MP4" "$(hd "$TMP/d.h" content-disposition)"
curl -s -I -o "$TMP/d2.h" "$F"
eq "指定なしのときは付かない" "[]" "[$(hd "$TMP/d2.h" content-disposition)]"

echo "[6] fixtures/out を out/ に一時コピー（＋ audio/・画像・.ts・ディレクトリを足す）"
cp -R "$FX/." "$OUT/"
mkdir -p "$OUT/audio/sfx" "$OUT/dir.txt"
head -c 2048 /dev/zero > "$OUT/audio/music.wav"
cp "$OUT/audio/music.wav" "$OUT/audio/sfx/hit.wav"
cp "$OUT/poster.png" "$OUT/spectrogram.png"
echo 'export {}' > "$OUT/probe.ts"
curl -s -o "$TMP/m2.json" "$BASE/api/manifest"
M="$(mf "$TMP/m2.json")"; echo "     $M"
case "$M" in demo=false*) ok "demo:false";; *) ng "demo:false ではない";; esac
eq "GET /" 200 "$(curl -s -o "$TMP/b.html" -w '%{http_code}' "$BASE/")"
hasnot "$TMP/b.html" "サンプル表示" "帯（「サンプル表示」の文字）"
for w in VocaForge 'audio/music.wav' 'audio/sfx/hit.wav' '<img src="/api/files/spectrogram.png'; do has "$TMP/b.html" "$w" "$w"; done
eq "probe.ts（対象外の拡張子）" 404 "$(code "$BASE/api/files/probe.ts")"
eq "audio（ディレクトリ）" 404 "$(code "$BASE/api/files/audio")"
eq "audio/sfx（ディレクトリ）" 404 "$(code "$BASE/api/files/audio/sfx")"
eq "dir.txt（拡張子つきのディレクトリ）" 404 "$(code "$BASE/api/files/dir.txt")"
ln -s "$ROOT/package.json" "$OUT/link.json"
eq "link.json（外を指すシンボリックリンク）" 404 "$(code "$BASE/api/files/link.json")"
curl -s -I -o "$TMP/w.h" "$BASE/api/files/audio/sfx/hit.wav"
eq "audio/sfx/hit.wav" "200 audio/wav 2048" "$(st "$TMP/w.h") $(hd "$TMP/w.h" content-type) $(hd "$TMP/w.h" content-length)"

echo "[7] 項目が欠けていても 500 にならない（/ と /api/manifest のステータス）"
try() {
  printf '%s' "$3" > "$OUT/$2"
  local a b
  a="$(code "$BASE/")"; b="$(code "$BASE/api/manifest")"
  if [ "$a" = 200 ] && [ "$b" = 200 ]; then ok "$2: $1 → $a / $b"; else ng "$2: $1 → $a / $b"; fi
}
try '空の {}' scenes.json '{}'
try 'scenes が空配列' scenes.json '{"scenes":[]}'
try 'start_s が無い' scenes.json '{"scenes":[{"id":0,"title":"x","end_s":3,"telop":["t"],"lines":["l"]}]}'
try '項目がすべて無い' scenes.json '{"scenes":[{}]}'
try '型が違う' scenes.json '{"scenes":[null,1,"a",{"id":{},"title":5,"start_s":"abc","end_s":[],"telop":"t","lines":null}]}'
try '配列だけ' scenes.json '[{"title":"y","start_s":1}]'
try 'JSONとして壊れている' scenes.json '{"scenes":['
try '空のファイル' scenes.json ''
rm -f "$OUT/scenes.json"
eq "scenes.json が無い" "200" "$(code "$BASE/")"
try '配列' metrics.json '[1,2,{"a":null}]'
try '文字列だけ' metrics.json '"text"'
try '壊れている' metrics.json '{'
try '空の {}' versions.json '{}'
try '型が違う' versions.json '{"final":null,"draft":{"elapsed_min":"x"},"review":7}'

reset_out
echo "[後始末] out/ の中身: $(ls -A "$OUT" | tr '\n' ' ')"
curl -s -o "$TMP/m3.json" "$BASE/api/manifest"
M="$(mf "$TMP/m3.json")"
case "$M" in demo=true*) ok "out/ を空に戻すと demo:true に戻る";; *) ng "demo:true に戻らない: $M";; esac

echo "結果: OK $PASS / NG $FAIL"
[ "$FAIL" -eq 0 ]
