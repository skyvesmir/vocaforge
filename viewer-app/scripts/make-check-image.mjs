// 確認用の画像を作る: 4桁の数字と、色のついた丸。答えは平文で置かず、ハッシュ（遅い鍵導出）だけを check/ に置く。
// 使い方（準備のコマンドが1回だけ走らせる）: node scripts/make-check-image.mjs
import '../fonts/register.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { randomInt, randomBytes, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

export const COLORS = { 赤: '#D62F2F', 青: '#2F5FD6', 緑: '#2FA04A', 黄: '#F2C200', 紫: '#7A3FC4', 橙: '#F28A1E' };
export const derive = (salt, number, color) => pbkdf2Sync(`${number}|${color}`, salt, 200000, 32, 'sha256').toString('hex');

if (process.argv[1] && process.argv[1].endsWith('make-check-image.mjs')) {
  mkdirSync('check', { recursive: true });
  if (existsSync('check/vision.json')) { console.log('already exists'); process.exit(0); }
  const number = String(randomInt(1000, 10000));
  const names = Object.keys(COLORS);
  const color = names[randomInt(0, names.length)];
  const salt = randomBytes(16).toString('hex');
  const W = 960, H = 540;
  const c = createCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#EFEFEA'; ctx.fillRect(0, 0, W, H);
  // 目くらまし: うすい灰色の丸と線（数字や色とは無関係）
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(120,120,120,${0.10 + 0.06 * (i % 3)})`;
    ctx.beginPath(); ctx.arc(randomInt(0, W), randomInt(0, H), randomInt(14, 60), 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,120,120,0.18)'; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(randomInt(0, W), randomInt(0, H)); ctx.lineTo(randomInt(0, W), randomInt(0, H)); ctx.stroke(); }
  // 色のついた大きな丸と、その中の4桁の数字
  ctx.fillStyle = COLORS[color];
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 230, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = '#1B2240'; ctx.stroke();
  ctx.font = '700 165px "Noto Sans JP"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#1B2240';
  ctx.strokeText(number, W / 2, H / 2 + 8);
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(number, W / 2, H / 2 + 8);
  writeFileSync('check/vision.png', await c.encode('png'));
  writeFileSync('check/vision.json', JSON.stringify({ salt, hash: derive(salt, number, color), colors: names }));
  console.log('check/vision.png written');
}
