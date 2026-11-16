# video-kit — 吹き出しと切り抜きの部品（準備のコマンドが置く）

動画本体は、これを**使って**作る。吹き出しと案内役の切り抜きを、自分で作り直さない。

## 入っているもの
- `assets/guide-cut/guide-stage1〜5.png` … 案内役の**全身の切り抜き**（背景は透明。原画と同じ大きさ。縮小して使い、拡大しない）
- `assets/guide-cut/manifest.json` … 各画像の大きさ、不透明な部分の外接矩形（`bbox`）、頭の位置（`head`: 中心 cx,cy と半径 rx,ry。幅・高さに対する割合）
- `assets/guide-faces/face-open.png`・`face-smile.png` … 丸い表情アイコン（吹き出しの中に入る。そのまま使う）
- `video-kit/bubble.mjs` … 吹き出し（`makeBubble`）と、しっぽの先にする点（`headPoint`）
- `video-kit/cutout.mjs`・`scripts/make-cutouts.mjs` … 切り抜きの作り方（別の絵を切り抜くときだけ）
- `video-kit/bubble-demo.mjs` … 3秒の見本（案内役の跳ね＋吹き出し）。読んで、まねる

## 吹き出しの使い方（時刻 t の純関数。同じ t なら同じ絵）
```js
import './fonts/register.mjs';                       // フォント（描くファイルと、各ワーカーの両方で）
import { makeBubble, headPoint } from './video-kit/bubble.mjs';

const HEAD = headPoint(man.images['guide-stage5.png'].head, 'right'); // 頭の右がわ（しっぽの先にする点）
const bubble = makeBubble({
  W: 1920, H: 1080,
  tIn: 10.114, tOut: 12.6,                           // 出る時刻・縮み始める時刻（格子の点に置く）
  segments: [                                        // 文章の切り替え。from は切り替えの時刻
    { from: 10.114, text: '最初は、[こんなに小さかった]んですよ。', face: faceOpen },
    { from: 11.35,  text: '覚えた語が増えるほど、[姿が変わります]。', face: faceSmile },
  ],
  anchorAt: (t) => ({ x, y }),                       // しっぽの先 = 案内役の頭のそば。毎フレーム、案内役の位置から渡す
  avoid: (t) => [                                    // 避けるもの（配列でも、t の関数でもよい）
    { x, y, w, h },                                  //   かたい矩形: スマホ・カードなど大事なUI。本体は絶対に重ならない
    { x, y, w, h, soft: true },                      //   やわらかい矩形: 案内役の体。避けきれないときは、UIを優先する
  ],
  side: 'right',                                     // 'right' = 頭の右上に置く／'left' = 左上
});
const box = bubble.draw(ctx, t);   // 描いた位置と大きさ { x, y, w, h, tip, scale }。出ていないときは null → 重なりの記録にそのまま入れる
```

- **文字**: `[ ]` で囲むと強調（朱の文字＋マーカー）。`/` を入れると、そこで改行。何も書かなければ、文節の切れ目（「、」の後・ひらがな→漢字の所）で2行に割る。既定は 46px の Zen Maru Gothic、1行は最大 600px。
- **しっぽ**: 先は常に `anchorAt(t)` に付く。本体はバネで少し遅れてついてくる（案内役が跳んでも、置いていかれない）。
  しっぽは、本体の輪郭のうち先にいちばん近い所から先へ向かって伸びる（先が下・横・斜めのどこにあっても、つぶれない）。先が本体から `leash`（既定220px）より遠くなると、本体が寄ってくる（`makeBubble({ leash: 300 })` で変えられる）。
- **出入り**: `tIn` で、しっぽの先からポンと出る（0.24秒）。`tOut` から、しっぽの先へ縮んで消える（0.16秒）。文章が切り替わると、大きさが変わり、小さくふくらみ、顔と文字が入れ替わる。
- **余白**: 画面の端から96pxの内側に収まる。かたい矩形（`avoid`）には重ならない。
- **改行を確かめる**: `bubble.linesOf(ctx, text)` が、各行の文字列の配列を返す。

## 案内役の切り抜きを描くとき
- 足もとを原点に、画像の表示高さ GH・幅 GW = GH × width / height で描く。しっぽの先は `headPoint` の割合から（つぶれ・伸びの倍率をかけて）。
- 頭の上に吹き出しを置くので、案内役を画面の高さの50〜65%にしても、跳ぶ高さは100px前後までにすると、吹き出しが画面の上端の余白に収まる。
- 切り抜きは**自分で作り直さない**。縁や髪が欠ける原因になる。

## 確かめる
- `node video-kit/selftest.mjs`（準備のコマンドが走らせ済み）。`SETUP_REPORT.txt` に結果がある。
- 見本の書き出し: `node video-kit/bubble-demo.mjs` → `_kit-demo/bubble-demo-3s.mp4`
