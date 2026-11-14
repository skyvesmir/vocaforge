#!/usr/bin/env bash
# VocaForge 紹介動画: 最初の準備を、1本でまとめて行う。
#   git clone --depth 1 -b assets/viewer-app https://github.com/skyvesmir/vocaforge.git _v && bash _v/viewer-app/setup.sh
# 長くかかるので、中身はバックグラウンドで走る。bash の180秒制限に引っかからない。
#   - 150秒以内に終われば、そのまま報告が出る
#   - 終わらなければ「実行中」と出る。同じ `bash _v/viewer-app/setup.sh` をもう一度打つと、続きを待つ（何度でも）
# 作らないもの: 動画、効果音の配置、台本（そこは創作の部分）。
REPO="${VF_REPO:-https://github.com/skyvesmir/vocaforge.git}"
ROOT="$(pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"

# ---- 前景: バックグラウンドで起動して、待つだけ ----
if [ -z "$VF_BG" ]; then
  [ -f "$ROOT/.start_ts" ] || date +%s > "$ROOT/.start_ts"
  if [ ! -f "$ROOT/.setup.pid" ] && [ ! -f "$ROOT/.setup.done" ]; then
    VF_BG=1 VF_HERE="$HERE" nohup bash "$0" > "$ROOT/setup.log" 2>&1 &
    echo $! > "$ROOT/.setup.pid"
    echo "準備を開始しました（バックグラウンド）。"
  fi
  for i in $(seq 1 30); do
    [ -f "$ROOT/.setup.done" ] && break
    sleep 5
  done
  if [ -f "$ROOT/.setup.done" ]; then
    cat "$ROOT/SETUP_REPORT.txt" 2>/dev/null
    echo "経過$(( ($(date +%s) - $(cat "$ROOT/.start_ts")) / 60 ))分"
  else
    echo "まだ実行中です。進み具合:"; tail -n 8 "$ROOT/setup.log"
    echo "→ もう一度 \`bash _v/viewer-app/setup.sh\` を打つと、続きを待てます。"
    echo "経過$(( ($(date +%s) - $(cat "$ROOT/.start_ts")) / 60 ))分"
  fi
  exit 0
fi

# ---- 背景: 本体 ----
set +e
cd "$ROOT" || exit 1
HERE="$VF_HERE"
REPORT="$ROOT/SETUP_REPORT.txt"
: > "$REPORT"
el() { echo "$(( ($(date +%s) - $(cat .start_ts)) / 60 ))分$(( ($(date +%s) - $(cat .start_ts)) % 60 ))秒"; }
say() { echo "$*" | tee -a "$REPORT"; }
step() { echo "[$(el)] $*"; }

say "== VocaForge 準備の報告 =="

# 1. 曲と解析結果
step "曲を取得"
rm -rf _song && git clone -q --depth 1 -b assets/intro-music "$REPO" _song 2>&1 | tail -2
if [ -f _song/intro-music/song.wav ]; then
  mkdir -p intro-music && cp _song/intro-music/* intro-music/ && rm -rf _song
  DUR=$(python3 -c "import soundfile as sf;i=sf.info('intro-music/song.wav');print(f'{i.duration:.3f}秒 {i.samplerate}Hz {i.channels}ch')" 2>/dev/null)
  say "OK 曲: intro-music/song.wav（$DUR）、analysis.json、README.md"
else
  say "NG 曲の取得に失敗"
fi

# 2. 画面のスクショ・案内役の絵（語彙データは取らない。名前を含むファイル名にしない）
step "絵を取得"
mkdir -p assets/screens assets/guide assets/guide-originals
rm -rf _main && git clone -q --depth 1 --filter=blob:none --sparse "$REPO" _main 2>&1 | tail -1
(cd _main && git sparse-checkout set docs/images public/static/karo >/dev/null 2>&1)
cp _main/docs/images/*.png assets/screens/ 2>/dev/null
for f in _main/public/static/karo/*.webp; do
  [ -f "$f" ] || continue
  b=$(basename "$f" | sed 's/^karo-/guide-/; s/^stage/guide-stage/')
  cp "$f" "assets/guide/$b"
done
rm -rf _main
rm -rf _orig && git clone -q --depth 1 -b assets/karo-originals "$REPO" _orig 2>&1 | tail -1
for f in _orig/karo-originals/stage*.png _orig/karo-originals/talk_*.png; do
  [ -f "$f" ] || continue
  b=$(basename "$f" | sed 's/^stage/guide-orig-stage/; s/^talk_/guide-orig-talk-/')
  cp "$f" "assets/guide-originals/$b"
done
rm -rf _orig
NS=$(ls assets/screens 2>/dev/null | wc -l); NG=$(ls assets/guide 2>/dev/null | wc -l); NO=$(ls assets/guide-originals 2>/dev/null | wc -l)
say "$([ "$NS" -ge 2 ] && echo OK || echo NG) 絵: assets/screens ${NS}枚（画面）、assets/guide ${NG}枚（縮小版）、assets/guide-originals ${NO}枚（原画）"

# 3. Python の依存 → earshot → 効果音の一括書き出し
step "Python の依存と earshot"
pip install -q --user --break-system-packages numpy scipy soundfile soxr pyloudnorm 2>&1 | tail -2
rm -rf earshot && git clone -q --depth 1 https://github.com/Leonxlnx/earshot earshot 2>&1 | tail -1
export PYTHONPATH="$ROOT/earshot"
mkdir -p sfx
: > sfx/manifest.txt
# 名前|bankのid|音程（空なら既定）。音程はハ長調の音（C D E G A）にそろえてある
SFX="pop_a|pop/0|
pop_b|pop/2|
land_light_a|fit/land.light/finger_wood|
land_light_b|fit/land.light/finger_phone|
text_C5|mallet/celesta|C5
text_D5|mallet/celesta|D5
text_E5|mallet/celesta|E5
text_G5|mallet/celesta|G5
text_A5|mallet/celesta|A5
tick_a|hover_tick/mid|
tick_b|hover_tick/detent|
confirm_C5|notify/m0|C5
confirm_G5|notify/m2|G5
confirm_soft|click/soft|
key_a|pro_typing_key/soft|
key_b|pro_typing_key/tick|
key_c|pro_typing_key/blip|
whoosh_a|swipe/glide|
whoosh_b|swipe/flick|
whoosh_c|swipe/cloth|
bell_C6|mallet/glock|C6
bell_E6|mallet/glock|E6
bell_G6|mallet/glock|G6
bell_up|mallet/up4|
land_hit|cut_hit/punch|C2"
step "効果音を書き出し"
echo "$SFX" | while IFS='|' read -r name id pitch; do
  [ -n "$name" ] || continue
  if [ -n "$pitch" ]; then
    python3 -m earshot sfx render "$id" -o "sfx/$name.wav" --pitch "$pitch" 2>&1 | tail -1 >> sfx/manifest.txt
  else
    python3 -m earshot sfx render "$id" -o "sfx/$name.wav" 2>&1 | tail -1 >> sfx/manifest.txt
  fi
done
python3 - <<'PY'
import re, json, glob, os
rows = []
for ln in open('sfx/manifest.txt', encoding='utf-8'):
    m = re.match(r'wrote (\S+): (\S+) seed \d+: ([\d.]+) s, onset ([\d.]+) s, peak at ([\d.]+) s, end ([\d.]+) s, (-?[\d.]+) dBFS, (-?[\d.]+) LUFS momentary max(.*)', ln.strip())
    if not m:
        continue
    pitch = re.search(r'pitch ([A-G][#b]?\d)', m.group(9))
    rows.append({"file": os.path.basename(m.group(1)), "bank_id": m.group(2), "dur_s": float(m.group(3)),
                 "onset_s": float(m.group(4)), "peak_s": float(m.group(5)), "end_s": float(m.group(6)),
                 "peak_dbfs": float(m.group(7)), "lufs_momentary_max": float(m.group(8)),
                 "pitch": pitch.group(1) if pitch else None,
                 "pitch_ok": ("did not land" not in m.group(9)), "checks": m.group(9).split("checks:")[-1].strip()})
json.dump({"note": "onset/peak は、各WAVの先頭からの秒。配置はこの値を引いて（映像イベントの時刻 - peak_s など）", "sounds": rows},
          open('sfx/manifest.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(rows))
PY
NW=$(ls sfx/*.wav 2>/dev/null | wc -l)
NP=$(python3 -c "import json;d=json.load(open('sfx/manifest.json'));print(sum(1 for s in d['sounds'] if s['pitch'] and not s['pitch_ok']))" 2>/dev/null)
say "$([ "$NW" -ge 20 ] && echo OK || echo NG) 効果音: sfx/*.wav ${NW}個、sfx/manifest.json（onset/peak/音量つき）。音程指定が効かなかったもの: ${NP:-?}個"

# 4. ビューアを、テンプレートのプロジェクトに配置
step "ビューアを配置"
if [ -d src/app ] && [ -f package.json ]; then
  mkdir -p src/components src/lib scripts fixtures out
  cp -r "$HERE/src/app/." src/app/
  cp -r "$HERE/src/components/." src/components/
  cp -r "$HERE/src/lib/." src/lib/
  cp "$HERE"/scripts/* scripts/
  cp -r "$HERE/fixtures/." fixtures/
  cp "$HERE/APP_CONTRACT.md" ./APP_CONTRACT.md
  touch out/.gitkeep
  cp "$HERE/.gitignore" .gitignore.viewer 2>/dev/null
  # package.json: ビューアの依存を、足りない分だけ足す（既存は上書きしない）
  node -e '
    const fs=require("fs");const a=JSON.parse(fs.readFileSync("package.json","utf8"));
    const b=JSON.parse(fs.readFileSync(process.argv[1]+"/package.json","utf8"));
    for(const k of ["dependencies","devDependencies"]){a[k]=a[k]||{};for(const [n,v] of Object.entries(b[k]||{})) if(!(n in a[k])) a[k][n]=v;}
    a.scripts=a.scripts||{};for(const [n,v] of Object.entries(b.scripts||{})) if(!(n in a.scripts)) a.scripts[n]=v;
    fs.writeFileSync("package.json",JSON.stringify(a,null,2)+"\n");' "$HERE"
  say "OK ビューア: src/app・src/components・src/lib・scripts・fixtures・APP_CONTRACT.md を配置、package.json に依存を追加"
else
  say "NG ビューア: src/app か package.json が無い（テンプレートの形が想定と違う）。ls の結果: $(ls | tr '\n' ' ')"
fi

# 5. npm（映像の道具も一緒に）
step "npm install（1〜2分かかる）"
npm install --no-audit --no-fund ffmpeg-static @napi-rs/canvas sharp 2>&1 | tail -3
FF=$(node -e 'console.log(require("ffmpeg-static"))' 2>/dev/null)
[ -n "$FF" ] && FFV=$("$FF" -version 2>/dev/null | head -1)
say "$([ -n "$FFV" ] && echo OK || echo NG) 映像の道具: ffmpeg-static（${FFV:-不明}）、@napi-rs/canvas、sharp"

# 6. ビルドの確認
step "ビルドの確認"
DATABASE_URL="${DATABASE_URL:-postgres://u:p@127.0.0.1:5432/x}" npx next build > build.log 2>&1
if [ $? -eq 0 ]; then say "OK ビルド: next build が通った（ログ: build.log）"; else say "NG ビルド: 失敗。末尾: $(tail -n 5 build.log | tr '\n' ' ')"; fi

# 7. フォント
step "フォントの確認"
FC=$(fc-list :lang=ja 2>/dev/null | head -3 | cut -d: -f2 | sort -u | tr '\n' ' ')
CF=$(node -e 'const {GlobalFonts}=require("@napi-rs/canvas");console.log(GlobalFonts.families.map(f=>f.family).filter(n=>/CJK|JP|Gothic|Mincho|ゴシック|明朝/i.test(n)).slice(0,6).join(", "))' 2>/dev/null)
say "$([ -n "$CF" ] && echo OK || echo 要確認) 日本語フォント: canvasから見えるもの=[${CF:-なし}] fc-list=[${FC:-なし}]"

# 8. 掃除と締め
rm -rf _v 2>/dev/null
say ""
say "置いたもの: intro-music/  assets/  sfx/  earshot/  APP_CONTRACT.md（ビューアの約束事）  .start_ts（時間の起点）"
say "※ビューアの画面表示・動画再生は、ここでは確認していない。"
say "完了（経過 $(el)）"
touch .setup.done
rm -f .setup.pid
