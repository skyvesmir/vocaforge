// 全身の切り抜き: 白地の原画（stage1〜5）から、背景だけを透明にする。絵は描き直さない（外周からの塗りつぶし）。
// 使い方: node scripts/make-cutouts.mjs <原画のフォルダ> <出力のフォルダ>
// 出力: <出力>/guide-stage1.png〜5.png（原画と同じ大きさ。縮小して使う。拡大しない）と manifest.json
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cutoutWhiteBackground } from '../video-kit/cutout.mjs';

const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// 頭の位置（画像の幅・高さに対する割合）。吹き出しのしっぽの先や、避ける範囲を決めるときの目安
const HEADS = JSON.parse(fs.existsSync(new URL('./guide-heads.json', import.meta.url)) ? fs.readFileSync(new URL('./guide-heads.json', import.meta.url), 'utf8') : '{}');
const manifest = { note: 'bbox・head は、画像の幅・高さに対する割合（0〜1）。head は頭の中心(cx,cy)と半径(rx,ry)の目安。', images: {} };
for (let n = 1; n <= 5; n++) {
  const f = `guide-orig-stage${n}.png`;
  const p = path.join(src, f);
  if (!fs.existsSync(p)) { console.log('NG なし', f); continue; }
  // 1・2段階は線画（白い毛並みが中にある）。3〜5段階は色のついた絵
  const cut = await cutoutWhiteBackground(p, n <= 2 ? { mode: 'lineart', sealRadius: 8 } : {});
  const name = `guide-stage${n}.png`;
  await sharp(cut.data, { raw: { width: cut.width, height: cut.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(out, name));
  let x0 = cut.width, y0 = cut.height, x1 = 0, y1 = 0, opaque = 0;
  for (let y = 0; y < cut.height; y++) for (let x = 0; x < cut.width; x++) {
    if (cut.data[(y * cut.width + x) * 4 + 3] > 16) { opaque++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  manifest.images[name] = {
    width: cut.width, height: cut.height,
    bbox: { x0: +(x0 / cut.width).toFixed(4), y0: +(y0 / cut.height).toFixed(4), x1: +((x1 + 1) / cut.width).toFixed(4), y1: +((y1 + 1) / cut.height).toFixed(4) },
    opaque_ratio: +(opaque / (cut.width * cut.height)).toFixed(3),
    head: HEADS[name] || null,
  };
  console.log('OK', name);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
