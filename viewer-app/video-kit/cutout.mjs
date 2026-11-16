// video-kit/cutout.mjs — 白地の絵から、外周からの塗りつぶしで背景だけを透明にする（絵は描き直さない）
import sharp from 'sharp';

// 返す: { data(RGBA raw), width, height }
// 正方形の窓で膨らませる（横→縦の2回。R は片側の幅）
function dilate(mask, w, h, R) {
  const N = w * h;
  const tmp = new Uint8Array(N), out = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -1e9;
    // 右から左へ、いちばん近い1の位置を使って、距離 R 以内を1にする
    const near = new Int32Array(w).fill(1e9);
    let p = -1e9;
    for (let x = 0; x < w; x++) { if (mask[row + x]) p = x; near[x] = x - p; }
    p = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (mask[row + x]) p = x; near[x] = Math.min(near[x], p - x); tmp[row + x] = near[x] <= R ? 1 : 0; }
    void last;
  }
  for (let x = 0; x < w; x++) {
    const near = new Int32Array(h).fill(1e9);
    let p = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) p = y; near[y] = y - p; }
    p = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) p = y; near[y] = Math.min(near[y], p - y); out[y * w + x] = near[y] <= R ? 1 : 0; }
  }
  return out;
}

// mode: 'fill'（既定。色のついた絵。外周から塗りつぶし、まっ白な広い島も背景にする）
//       'lineart'（線画。白いままの毛並みが中にある。線のすきまを sealRadius で塞いでから外周を塗りつぶし、島は消さない）
export async function cutoutWhiteBackground(file, { thresh = 236, spread = 16, closeGaps = 2, islandMin = 500, mode = 'fill', sealRadius = 8 } = {}) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const N = w * h;
  const isBg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    isBg[i] = (mn >= thresh && mx - mn <= spread) ? 1 : 0;
  }
  if (mode === 'lineart') {
    const ink = new Uint8Array(N);
    for (let i = 0; i < N; i++) ink[i] = isBg[i] ? 0 : 1;
    const seal = dilate(ink, w, h, sealRadius);       // 線を膨らませて、すきまを塞ぐ
    const outside = new Uint8Array(N);
    const st = new Int32Array(N); let sp0 = 0;
    const seed = (i) => { if (!seal[i] && !outside[i]) { outside[i] = 1; st[sp0++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp0 > 0) {
      const i = st[--sp0]; const x = i % w, y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    const back = dilate(outside, w, h, sealRadius + 1); // 塞いだ分だけ、外側を戻す
    const flood0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) flood0[i] = (back[i] && isBg[i]) ? 1 : 0;
    return finish(data, flood0, w, h);
  }
  // 線の細いすきまから、中へ背景が漏れないように、背景候補を closeGaps だけ細らせて塗りつぶしの通り道にする
  let pass = isBg;
  for (let it = 0; it < closeGaps; it++) {
    const nxt = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // 画面の外は「背景」として数える（外周のピクセルを残すため）
      if (pass[i] && (x === 0 || pass[i - 1]) && (x === w - 1 || pass[i + 1]) && (y === 0 || pass[i - w]) && (y === h - 1 || pass[i + w])) nxt[i] = 1;
    }
    pass = nxt;
  }
  // 外周から塗りつぶし
  const flood = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i) => { if (!flood[i] && (pass[i] || isEdge(i))) { flood[i] = 1; stack[sp++] = i; } };
  const isEdge = () => false;
  for (let x = 0; x < w; x++) { if (pass[x]) push(x); if (pass[(h - 1) * w + x]) push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { if (pass[y * w]) push(y * w); if (pass[y * w + w - 1]) push(y * w + w - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    if (x > 0 && pass[i - 1] && !flood[i - 1]) { flood[i - 1] = 1; stack[sp++] = i - 1; }
    if (x < w - 1 && pass[i + 1] && !flood[i + 1]) { flood[i + 1] = 1; stack[sp++] = i + 1; }
    if (y > 0 && pass[i - w] && !flood[i - w]) { flood[i - w] = 1; stack[sp++] = i - w; }
    if (y < h - 1 && pass[i + w] && !flood[i + w]) { flood[i + w] = 1; stack[sp++] = i + w; }
  }
  // 外周から届かない、まっ白で広い島（しっぽと服のすきまなど）も背景にする。
  // 目のハイライトのような小さな白は、面積で除く。
  const pure = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    pure[i] = (Math.min(r, g, b) >= 251 && Math.max(r, g, b) - Math.min(r, g, b) <= 4) ? 1 : 0;
  }
  const seen = new Uint8Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (!pure[s0] || flood[s0] || seen[s0]) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const i = comp[q], x = i % w, y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && pure[j] && !flood[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
    }
    if (comp.length >= islandMin) for (const i of comp) flood[i] = 1;
  }
  // 細らせた分を戻す（背景候補で、塗りつぶし領域に近いものも背景にする）
  for (let it = 0; it < closeGaps + 1; it++) {
    const add = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!flood[i] && isBg[i] && (flood[i - 1] || flood[i + 1] || flood[i - w] || flood[i + w])) add.push(i);
    }
    for (const i of add) flood[i] = 1;
  }
  return finish(data, flood, w, h);
}

// 縁の処理と、透明度の書き込み（flood=背景のマスク）
function finish(data, flood, w, h) {
  const N = w * h;
  // 縁: 背景に接する2px以内の「白に近い」ピクセルを、白さに応じて半透明にする（白いフチを残さない）
  const band = new Uint8Array(N);
  for (let it = 0; it < 2; it++) {
    // 1周ごとに、前の周の結果のコピーを元にする（その場で更新すると、右下へ全部に広がる）
    const src = it === 0 ? flood : Uint8Array.from(band);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!flood[i] && !band[i] && (src[i - 1] || src[i + 1] || src[i - w] || src[i + w])) band[i] = 1;
    }
  }
  const out = Buffer.from(data);
  for (let i = 0; i < N; i++) {
    if (flood[i]) { out[i * 4 + 3] = 0; continue; }
    if (band[i]) {
      const mn = Math.min(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
      const a = Math.max(0, Math.min(1, (255 - mn) / 70));
      out[i * 4 + 3] = Math.round(a * 255);
    } else out[i * 4 + 3] = 255;
  }
  return { data: out, width: w, height: h, floodPixels: flood.reduce((s, v) => s + v, 0) };
}

export async function cutoutToPng(file, outPng, height) {
  const { data, width, height: hh } = await cutoutWhiteBackground(file);
  let img = sharp(data, { raw: { width, height: hh, channels: 4 } });
  if (height) img = img.resize({ height, kernel: 'lanczos3' });
  await img.png().toFile(outPng);
}
