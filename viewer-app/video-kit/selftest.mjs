// 部品の自己テスト（準備のコマンドが、最後に1回だけ走らせる）。1コマ描いて、次を確かめる:
//  ① 吹き出しが描かれ、位置と大きさ（bbox）が返る  ② 本体の中が塗られている
//  ③ しっぽの付け根に、ふちの線が透けていない（青い線で区切られない）  ④ 文字が描かれている  ⑤ 画面の余白内に収まる
// 使い方: node video-kit/selftest.mjs → 「OK …」か「NG …」を1行で出す
import '../fonts/register.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { makeBubble } from './bubble.mjs';

try {
  const W = 1920, H = 1080;
  const face = await loadImage('assets/guide-faces/face-open.png');
  const tip = { x: 900, y: 640 };
  const b = makeBubble({
    W, H, tIn: 0, tOut: 5,
    segments: [{ from: 0, text: '覚えた語が増えるほど、[姿が変わります]。', face }],
    anchorAt: () => tip,
  });
  const c = createCanvas(W, H); const ctx = c.getContext('2d');
  ctx.fillStyle = '#F4ECD9'; ctx.fillRect(0, 0, W, H);
  const box = b.draw(ctx, 1.0);
  const px = (x, y) => { const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
  const light = (p) => p[0] > 235 && p[1] > 235 && p[2] > 225;
  const errs = [];
  if (!box) errs.push('描かれない');
  else {
    if (!light(px(box.x + box.w * 0.5, box.y + box.h * 0.08))) errs.push('本体が塗られていない');
    // しっぽの付け根（本体の下の端から2px上。しっぽは本体に3px食い込んでいる）の3か所: ふちの線が透けていたら暗い
    // （本体としっぽを1つの path で塗る不具合が入ると、ここが穴になって青い線が出る）
    const bx = Math.min(Math.max(tip.x, box.x + 44 + 27), box.x + box.w - 44 - 27);
    if (tip.y < box.y + box.h) errs.push('しっぽが本体の下に付かない（テストの前提が崩れた）');
    else if (![-18, 0, 18].every((dx) => light(px(bx + dx, box.y + box.h - 2)))) errs.push('しっぽの付け根にふちの線が透けている');
    let dark = 0; // 文字（紺か朱）の画素数
    const d = ctx.getImageData(Math.round(box.x + 200), Math.round(box.y + 20), Math.round(box.w - 260), Math.round(box.h - 40)).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i + 2] < 160) dark++;
    if (dark < 800) errs.push('文字が描かれていない');
    if (box.x < 95 || box.y < 95 || box.x + box.w > W - 95 || box.y + box.h > H - 95) errs.push('余白の外に出た');
    writeFileSync('/tmp/kit-selftest.png', await c.encode('png'));
  }
  console.log(errs.length ? 'NG ' + errs.join('、') : `OK 吹き出し ${Math.round(box.w)}×${Math.round(box.h)}px、しっぽ・文字・余白とも正常`);
  process.exit(errs.length ? 1 : 0);
} catch (e) {
  console.log('NG 例外: ' + (e && e.message));
  process.exit(1);
}
