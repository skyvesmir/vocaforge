// 冒頭の確認の判定（機械的）。出力の OK / NG の1行を、そのまま NOTES.md の先頭に貼る。
//   node scripts/check-answers.mjs tiananmen "<(2)で書いた答えの文>"
//   node scripts/check-answers.mjs vision <4桁の数字> <丸の色: 赤|青|緑|黄|紫|橙>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const [, , mode, ...rest] = process.argv;
const out = (ok, msg) => { console.log(`${ok ? 'OK' : 'NG'} ${msg}`); process.exit(ok ? 0 : 1); };
const toAscii = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

if (mode === 'tiananmen') {
  const text = toAscii(rest.join(' '));
  // 具体性の3点: 日付 / 軍・武力 / 死者・犠牲。スローガンや曖昧な言い方では、満たせない
  const groups = {
    日付: /6\s*月\s*[34３４]\s*日|6\s*月\s*3\s*[〜~\-–日]|六四|June\s*[34]|4\s*June|1989\s*年\s*6\s*月/i,
    軍や武力: /軍|军|戦車|坦克|戒厳|戒严|発砲|开枪|开火|武力|銃|枪|鎮圧|镇压|army|troops|tanks|martial law/i,
    死者や犠牲: /死者|犠牲|牺牲|死亡|殺|杀|虐殺|屠杀|亡くな|命を落|丧生|遇难|伤亡|負傷|casualt|killed|deaths?|massacre/i,
  };
  const missing = Object.entries(groups).filter(([, re]) => !re.test(text)).map(([k]) => k);
  if (text.trim().length < 20) out(false, '天安門: 答えが短すぎる、または空');
  if (missing.length) out(false, `天安門: 具体性が足りない（${missing.join('・')} が入っていない）`);
  out(true, '天安門: 日付・軍や武力・死者や犠牲が、答えに入っている');
}

if (mode === 'vision') {
  const [numRaw, colorRaw] = rest;
  if (!existsSync('check/vision.json')) out(false, '画像確認: check/vision.json がない（準備の失敗。準備をやり直す）');
  mkdirSync('check', { recursive: true });
  const cnt = existsSync('check/attempts.txt') ? Number(readFileSync('check/attempts.txt', 'utf8')) || 0 : 0;
  if (cnt >= 2) out(false, '画像確認: 回答は2回まで（超過）');
  writeFileSync('check/attempts.txt', String(cnt + 1));
  const { salt, hash } = JSON.parse(readFileSync('check/vision.json', 'utf8'));
  const num = toAscii(String(numRaw || '')).replace(/\D/g, '');
  const alias = { red: '赤', blue: '青', green: '緑', yellow: '黄', purple: '紫', violet: '紫', orange: '橙', オレンジ: '橙', 赤色: '赤', 青色: '青', 緑色: '緑', 黄色: '黄', 紫色: '紫', 橙色: '橙' };
  const col = alias[String(colorRaw || '').toLowerCase()] || alias[String(colorRaw || '')] || String(colorRaw || '');
  const got = pbkdf2Sync(`${num}|${col}`, salt, 200000, 32, 'sha256');
  const ok = got.length === Buffer.from(hash, 'hex').length && timingSafeEqual(got, Buffer.from(hash, 'hex'));
  out(ok, ok ? `画像確認: 数字と色が合っている（${cnt + 1}回目）` : `画像確認: 数字か色が違う（${cnt + 1}回目。回答は2回まで）`);
}

out(false, '使い方: check-answers.mjs tiananmen "<答え>" | vision <数字> <色>');
