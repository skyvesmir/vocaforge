// 吹き出し部品の見本（3秒・1080p・30fps・音なし）。使い方の例として読む。
// 実行: node video-kit/bubble-demo.mjs（プロジェクトのルートで）→ _kit-demo/bubble-demo-3s.mp4
// 静止画だけ: STILLS=0.6,1.4 node video-kit/bubble-demo.mjs
import '../fonts/register.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { makeBubble, headPoint } from './bubble.mjs';

const W = 1920, H = 1080, FPS = 30, DUR = 3.0;
const BEAT = 0.4944;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

// 案内役: 準備が作った全身の切り抜き（背景は透明）。自分で切り抜き直さない。縮小して使い、拡大しない
const man = JSON.parse(readFileSync('assets/guide-cut/manifest.json', 'utf8')).images['guide-stage5.png'];
const guideBuf = await sharp('assets/guide-cut/guide-stage5.png').resize({ height: 640, kernel: 'lanczos3' }).png().toBuffer();
const guideImg = await loadImage(guideBuf);
const faceOpen = await loadImage('assets/guide-faces/face-open.png');
const faceSmile = await loadImage('assets/guide-faces/face-smile.png');

const GH = 560, GW = GH * man.width / man.height, FOOT_Y = 1000;
const HEAD = headPoint(man.head, 'right'); // しっぽの先にする点（頭の右がわ）
const X0 = 420, X1 = 880, T0 = 1.15, FLY = 0.5, ANT = 0.12;

function guideState(t) {
  let x = X0, hop = 0, sy = 1;
  const idle = 1 + 0.012 * Math.max(0, Math.cos(2 * Math.PI * t / BEAT));
  if (t < T0 - ANT) sy = idle;
  else if (t < T0) sy = 1 - 0.13 * Math.sin(((t - (T0 - ANT)) / ANT) * Math.PI / 2);
  else if (t < T0 + FLY) {
    const u = (t - T0) / FLY;
    x = lerp(X0, X1, 0.5 - 0.5 * Math.cos(Math.PI * u));
    hop = -100 * 4 * u * (1 - u);
    sy = 1 + 0.08 * Math.cos(Math.PI * u);
  } else {
    x = X1;
    const tau = t - (T0 + FLY);
    sy = 1 - 0.17 * Math.exp(-9 * tau) * Math.cos(15 * tau);
    if (tau > 0.35) sy *= idle;
  }
  const sx = 1 / Math.pow(sy, 0.7);
  return { x, hop, sx, sy };
}
// 画像上の点（幅・高さの割合）の、画面上の位置
function guidePoint(t, fx, fy) {
  const g = guideState(t);
  return { x: g.x + (fx - 0.5) * GW * g.sx, y: FOOT_Y + g.hop - (1 - fy) * GH * g.sy };
}

const phone = { x: 1380, y: 150, w: 400, h: 780 };
const bubble = makeBubble({
  W, H, tIn: 0.20, tOut: 2.62, side: 'right',
  avoid: (t) => {
    const g = guideState(t);
    return [
      { x: phone.x - 20, y: phone.y - 20, w: phone.w + 40, h: phone.h + 40 },           // スマホ
      { x: g.x - GW / 2 * g.sx, y: FOOT_Y + g.hop - GH * g.sy, w: GW * g.sx, h: GH * g.sy, soft: true }, // 案内役の体（やわらかい）
    ];
  },
  segments: [
    { from: 0.20, text: '最初は、[こんなに小さかった]んですよ。', face: faceOpen },
    { from: 1.80, text: '覚えた語が増えるほど、[姿が変わります]。', face: faceSmile },
  ],
  anchorAt: (t) => guidePoint(t, HEAD.fx, HEAD.fy),
});

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#F6EEDB'); g.addColorStop(1, '#EEE2C8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // ゆっくり動く大きな丸（奥の層）
  ctx.save();
  ctx.globalAlpha = 0.07; ctx.fillStyle = '#1E2B5A';
  ctx.beginPath(); ctx.arc(1560 - t * 18, 930, 520, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#BF3A33';
  ctx.beginPath(); ctx.arc(250 + t * 14, 180, 300, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 点の模様
  ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#1E2B5A';
  for (let yy = 60; yy < H; yy += 60) for (let xx = 60; xx < W; xx += 60) ctx.fillRect(xx, yy, 3, 3);
  ctx.restore();
}

function drawPhone(ctx) {
  const { x, y, w, h } = phone;
  ctx.save();
  ctx.shadowColor = 'rgba(20,28,70,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#161B3D'; rr(ctx, x, y, w, h, 56); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#232A5C'; rr(ctx, x + 18, y + 18, w - 36, h - 36, 42); ctx.fill();
  const g1 = ctx.createLinearGradient(x, y, x + w, y + 220);
  g1.addColorStop(0, '#4F46E5'); g1.addColorStop(1, '#8B5CF6');
  ctx.fillStyle = g1; rr(ctx, x + 44, y + 60, w - 88, 230, 30); ctx.fill();
  const g2 = ctx.createLinearGradient(x, y + 320, x + w, y + 520);
  g2.addColorStop(0, '#EF4444'); g2.addColorStop(1, '#F59E0B');
  ctx.fillStyle = g2; rr(ctx, x + 44, y + 320, w - 88, 160, 30); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 3; i++) { rr(ctx, x + 44, y + 510 + i * 70, w - 88, 52, 20); ctx.fill(); }
}

function drawGuide(ctx, t) {
  const g = guideState(t);
  // 影（跳ぶと小さく薄く）
  const k = clamp(-g.hop / 100, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.20 * (1 - 0.5 * k);
  ctx.fillStyle = '#1E2B5A';
  ctx.beginPath(); ctx.ellipse(g.x, FOOT_Y + 8, 150 * (1 - 0.3 * k), 20 * (1 - 0.3 * k), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(g.x, FOOT_Y + g.hop);
  ctx.scale(g.sx, g.sy);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(guideImg, -GW / 2, -GH, GW, GH);
  ctx.restore();
}

function renderFrame(ctx, t) {
  drawBackground(ctx, t);
  drawPhone(ctx);
  drawGuide(ctx, t);
  return bubble.draw(ctx, t);
}

const outDir = '_kit-demo';
mkdirSync(outDir, { recursive: true });
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const stillTimes = (process.env.STILLS || '').split(',').filter(Boolean).map(Number);
const ff = spawn(ffmpegPath, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${outDir}/bubble-demo-3s.mp4`],
  { stdio: ['pipe', 'ignore', 'inherit'] });

const boxes = [];
const N = Math.round(DUR * FPS);
for (let i = 0; i < N; i++) {
  const t = i / FPS;
  const box = renderFrame(ctx, t);
  boxes.push({ f: i, t: +t.toFixed(3), box: box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), s: +box.scale.toFixed(2) } });
  const buf = canvas.data();
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
writeFileSync(`${outDir}/bubble-boxes.json`, JSON.stringify(boxes));

for (const st of stillTimes) {
  renderFrame(ctx, st);
  writeFileSync(`${outDir}/still-${st.toFixed(2)}.png`, await canvas.encode('png'));
}
console.log('done', N, 'frames');
