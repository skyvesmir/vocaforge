// 丸い表情アイコン（512x512、角は透明）を作る。背景（水色）は抜かず、円の中に残す。
// 使い方: node scripts/make-faces.mjs <原画のフォルダ> <出力のフォルダ>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// 中心と半径は、原画の幅に対する割合（顔・耳・髪が円に収まり、あごと手の先が入る位置）
const jobs = [
  { file: 'guide-orig-talk-open.png',  name: 'face-open.png',  cx: 0.500, cy: 0.4333, r: 0.4417 },
  { file: 'guide-orig-talk-smile.png', name: 'face-smile.png', cx: 0.500, cy: 0.4083, r: 0.4200 },
];
for (const j of jobs) {
  const p = path.join(src, j.file);
  if (!fs.existsSync(p)) { console.log('NG なし', j.file); continue; }
  const img = sharp(p); const { width: W, height: H } = await img.metadata();
  const px = await sharp(p).extract({ left: 3, top: 3, width: 1, height: 1 }).raw().toBuffer();
  const bg = { r: px[0], g: px[1], b: px[2], alpha: 1 };
  const cx = Math.round(j.cx * W), cy = Math.round(j.cy * W), r = Math.round(j.r * W);
  const pad = 120;
  const ext = await sharp(p).extend({ top: pad, bottom: pad, left: pad, right: pad, background: bg }).png().toBuffer();
  const sq = await sharp(ext)
    .extract({ left: cx - r + pad, top: cy - r + pad, width: 2 * r, height: 2 * r })
    .resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer();
  const mask = Buffer.from(`<svg width="512" height="512"><circle cx="256" cy="256" r="255" fill="#fff"/></svg>`);
  await sharp(sq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(out, j.name));
  console.log('OK', j.name);
}
