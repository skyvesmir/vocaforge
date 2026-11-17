// video-kit/bubble.mjs — 吹き出し部品（時刻 t の純関数。同じ t なら同じ絵）
//
// 使い方:
//   const b = makeBubble({ W:1920, H:1080, tIn:0.2, tOut:2.6,
//     segments:[{ from:0.2, text:'最初は、[こんなに小さかった]んですよ。', face: imgOpen },
//               { from:1.8, text:'覚えた語が増えるほど、[姿が変わります]。', face: imgSmile }],
//     anchorAt:(t)=>({x,y}),   // しっぽの先 = 案内役の頭のそば（毎フレーム、案内役から渡す）
//     avoid:[{x,y,w,h}], side:'right' });
//   const box = b.draw(ctx, t);   // 描いた位置と大きさ（重なり検査用）。出ていないときは null
//
// 文字中の [ ] は強調（朱の文字＋マーカー）。しっぽの先は常に anchorAt(t) にぴたりと付き、
// 本体はバネで少し遅れてついてくる。画面の端の余白と avoid の矩形は、本体が避ける。

const NAVY = '#1E2B5A';
const SHU = '#BF3A33';
const PAPER = '#FFFDF7';
const MARK = '#FFE7A3';
const NO_START = '、。，．！？」』）〕】…';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const outBack = (x, s = 1.70158) => { x = clamp(x, 0, 1); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const inBack = (x, s = 1.70158) => { x = clamp(x, 0, 1); const c = s + 1; return c * x * x * x - s * x * x; };
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

const charClass = (ch) => (/[\u3041-\u3096]/.test(ch) ? 'H' : /[\u30A1-\u30FA\u30FC]/.test(ch) ? 'T'
  : /[\u4E00-\u9FFF\u3005]/.test(ch) ? 'K' : /[A-Za-z0-9]/.test(ch) ? 'L' : 'P');
// 文節の切れ目か（ひらがな→漢字・カタカナ・英字、漢字→カタカナ・英字、カタカナ・英字→漢字、句読点の後）
function canBreak(a, b) {
  if ('、。，．！？'.includes(a)) return true;
  const ca = charClass(a), cb = charClass(b);
  if (ca === 'H') return cb === 'K' || cb === 'T' || cb === 'L';
  if (ca === 'K') return cb === 'T' || cb === 'L';
  if (ca === 'T' || ca === 'L') return cb === 'K';
  return false;
}

function rrPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}


// 案内役の切り抜き（assets/guide-cut/manifest.json の head）から、しっぽの先にする点（画像の幅・高さに対する割合）を返す。
//   side 'right' = 頭の右がわ（吹き出しを右上に置くとき）、'left' = 左がわ
//   例: const p = headPoint(man.images['guide-stage5.png'].head, 'right');  // { fx, fy }
//       画面上の位置 = 足もとを原点に、(fx-0.5)*画像の表示幅, -(1-fy)*画像の表示高さ（つぶれ・伸びの倍率をかけて）
export function headPoint(head, side = 'right') {
  const k = side === 'left' ? -1 : 1;
  return { fx: head.cx + k * 1.12 * head.rx, fy: head.cy + 0.10 * head.ry };
}

// 角丸の矩形の輪郭で、点 q にいちばん近い点と、そこでの外向きの法線、輪郭までの距離（外が正、中が負）
function nearestOnOutline(box, r, q) {
  const cx = Math.min(box.x + box.w - r, Math.max(box.x + r, q.x));
  const cy = Math.min(box.y + box.h - r, Math.max(box.y + r, q.y));
  const vx = q.x - cx, vy = q.y - cy;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) { // 中の芯の矩形にある: いちばん近い辺へ
    const d = [q.x - box.x, box.x + box.w - q.x, q.y - box.y, box.y + box.h - q.y];
    const m = Math.min(...d), i = d.indexOf(m);
    if (i === 0) return { x: box.x, y: q.y, nx: -1, ny: 0, d: -m };
    if (i === 1) return { x: box.x + box.w, y: q.y, nx: 1, ny: 0, d: -m };
    if (i === 2) return { x: q.x, y: box.y, nx: 0, ny: -1, d: -m };
    return { x: q.x, y: box.y + box.h, nx: 0, ny: 1, d: -m };
  }
  const nx = vx / len, ny = vy / len;
  return { x: cx + nx * r, y: cy + ny * r, nx, ny, d: len - r };
}

export function makeBubble(cfg) {
  const C = {
    margin: 96, family: 'Zen Maru Gothic', fontPx: 46, maxTextW: 600, faceD: 128,
    padX: 40, padY: 28, gap: 28, radius: 44, border: 5, tailW: 54,
    popIn: 0.24, popOut: 0.16, omega: 16, zeta: 0.62, side: 'right', avoid: [],
    offX: 70, offY: 60, swapDur: 0.18, leash: Infinity, ...cfg,
  };
  const cache = new Map();

  function layout(ctx, text) {
    if (cache.has(text)) return cache.get(text);
    const chars = []; const manual = []; let emph = false;
    for (const ch of text) {
      if (ch === '[') { emph = true; continue; }
      if (ch === ']') { emph = false; continue; }
      if (ch === '/') { manual.push(chars.length); continue; }   // 自分で改行を決めたいとき
      chars.push({ ch, emph });
    }
    ctx.font = `700 ${C.fontPx}px "${C.family}"`;
    for (const c of chars) c.w = ctx.measureText(c.ch).width;
    const sum = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += chars[i].w; return s; };
    const n = chars.length, total = sum(0, n);
    let breaks = manual.slice();
    if (!manual.length && total > C.maxTextW) {
      // 2行に割る。文節の切れ目（「、」「。」の後、ひらがな→漢字・カタカナ・英字）を選ぶ。
      // 単語の途中や、「んです」「ます」のような語尾の直前では切らない。強調の途中も、なるべく避ける
      let best = null;
      for (let k = 1; k < n; k++) {
        if (NO_START.includes(chars[k].ch)) continue;
        const w1 = sum(0, k), w2 = total - w1;
        if (w1 > C.maxTextW || w2 > C.maxTextW) continue;
        const a = chars[k - 1], b = chars[k];
        let sc = Math.abs(w1 - w2) * 0.5;
        if (!canBreak(a.ch, b.ch)) sc += 400;
        if (a.emph && b.emph) sc += 120;
        if ('、。'.includes(a.ch)) sc -= 100;
        if (Math.min(w1, w2) < C.fontPx * 5.5) sc += 100;
        if (!best || sc < best.sc) best = { k, sc };
      }
      if (best) breaks = [best.k];
      else {
        let s2 = 0;
        for (let i = 0; i < n; i++) {
          if (s2 + chars[i].w > C.maxTextW && !NO_START.includes(chars[i].ch)) { breaks.push(i); s2 = 0; }
          s2 += chars[i].w;
        }
      }
    }
    const lines = []; let a = 0;
    for (const b of [...breaks, n]) { lines.push({ chars: chars.slice(a, b), width: sum(a, b) }); a = b; }
    const lineH = Math.round(C.fontPx * 1.4);
    const width = Math.max(...lines.map((l) => l.width));
    const height = lines.length * lineH;
    const faceD = C.faceD;
    const inner = Math.max(height, faceD);
    const out = {
      lines, lineH, width, height,
      w: C.padX * 2 + faceD + C.gap + width,
      h: inner + C.padY * 2,
    };
    cache.set(text, out);
    return out;
  }

  // 時刻 t の「文章の切り替え」の状態
  function segState(ctx, t) {
    const segs = C.segments;
    let i = 0;
    for (let k = 0; k < segs.length; k++) if (t >= segs[k].from) i = k;
    const cur = layout(ctx, segs[i].text);
    if (i === 0) return { i, cur, prev: null, k: 1, w: cur.w, h: cur.h };
    const prev = layout(ctx, segs[i - 1].text);
    const k = clamp((t - segs[i].from) / C.swapDur, 0, 1);
    const e = smooth(k);
    return { i, cur, prev, k, w: lerp(prev.w, cur.w, e), h: lerp(prev.h, cur.h, e) };
  }

  // 本体を、画面の端の余白と、避けるもの（スマホ・案内役の体など）から押し出す
  function resolve(x, y, w, h, t) {
    const m = C.margin, W = C.W, H = C.H;
    const rects = typeof C.avoid === 'function' ? C.avoid(t) : C.avoid;
    // 「やわらかい」矩形（案内役の体など）を先に避け、「かたい」矩形（スマホ・カードなどの大事なUI）を最後に避ける。
    // 両方は避けきれないとき、UIの上には重ならない
    const groups = [rects.filter((r) => r.soft), rects.filter((r) => !r.soft)];
    for (const group of groups) for (let pass = 0; pass < 2; pass++) {
      for (const r of group) {
        const pad = 28;
        const ox = x < r.x + r.w + pad && x + w > r.x - pad;
        const oy = y < r.y + r.h + pad && y + h > r.y - pad;
        if (ox && oy) {
          const opts = [
            { dx: r.x - pad - w - x, dy: 0 },
            { dx: r.x + r.w + pad - x, dy: 0 },
            { dx: 0, dy: r.y - pad - h - y },
          ].filter((o) => x + o.dx >= m && x + o.dx + w <= W - m && y + o.dy >= m);
          if (opts.length) {
            opts.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
            x += opts[0].dx; y += opts[0].dy;
          }
        }
      }
    }
    return { x: clamp(x, m, W - m - w), y: clamp(y, m, H - m - h) };
  }

  // しっぽの先から、本体のいちばん良い位置（左上）を決める
  function place(anchor, w, h, t) {
    const x = anchor.x + (C.side === 'right' ? -C.offX : -(w - C.offX));
    const y = anchor.y - h - C.offY;
    return resolve(x, y, w, h, t);
  }

  // 本体の位置: バネで、目標へ遅れてついていく（決まった刻みで積分するので、同じ t なら同じ位置）
  function bodyPos(ctx, t) {
    const dt = 1 / 120;
    const { omega: w0, zeta: z } = C;
    const t0 = C.tIn;
    let s = segState(ctx, t0);
    let p = place(C.anchorAt(t0), s.w, s.h, t0);
    let vx = 0, vy = 0;
    for (let ts = t0 + dt; ts < t + dt * 0.5; ts += dt) {
      s = segState(ctx, ts);
      const g = place(C.anchorAt(ts), s.w, s.h, ts);
      const ax = w0 * w0 * (g.x - p.x) - 2 * z * w0 * vx;
      const ay = w0 * w0 * (g.y - p.y) - 2 * z * w0 * vy;
      vx += ax * dt; vy += ay * dt;
      p = { x: p.x + vx * dt, y: p.y + vy * dt };
    }
    const sf = segState(ctx, t);
    // 任意（既定では無効）: leash（px）を指定したときだけ、しっぽの先と本体の輪郭の距離が leash を超えたぶん、本体を先へ寄せる
    if (Number.isFinite(C.leash)) {
      const rr0 = Math.min(C.radius, sf.h / 2);
      const nn = nearestOnOutline({ x: p.x, y: p.y, w: sf.w, h: sf.h }, rr0, C.anchorAt(t));
      if (nn.d > C.leash) p = { x: p.x + nn.nx * (nn.d - C.leash), y: p.y + nn.ny * (nn.d - C.leash) };
    }
    // バネのゆきすぎで、避けるものに重ならないように、最後にもう一度押し出す
    return resolve(p.x, p.y, sf.w, sf.h, t);
  }

  // しっぽ: 本体の輪郭のうち、先にいちばん近い点から、先へ向かって伸びる。
  // 先がどこにあっても（下・横・斜め）、根もとは輪郭に沿って付き、軸は先を向くので、つぶれた細い三角にならない。
  // 先が本体の中・すぐ近くにあるときは、根もとを細くして消える（連続的に）。
  function drawTail(ctx, box, tip) {
    const r = Math.min(C.radius, box.h / 2);
    const P = nearestOnOutline(box, r, tip);
    const L = P.d;
    if (L <= 1) return;
    const tw = C.tailW * Math.min(1, L / 36);
    const tx = -P.ny, ty = P.nx;                       // 輪郭に沿う向き
    const pa = nearestOnOutline(box, r, { x: P.x + tx * tw / 2, y: P.y + ty * tw / 2 }); // 根もと（下に付くとき左）
    const pb = nearestOnOutline(box, r, { x: P.x - tx * tw / 2, y: P.y - ty * tw / 2 }); // 根もと（下に付くとき右）
    const inset = 3;                                    // 本体に3px食い込ませる（塗りの継ぎ目を隠す）
    const ax = pa.x - pa.nx * inset, ay = pa.y - pa.ny * inset;
    const bx = pb.x - pb.nx * inset, by = pb.y - pb.ny * inset;
    // 軸（根もとの中心から先）に沿って、左は0.62、右は0.42の所に制御点（右がわが少しふくらむ、すっとした形）
    const ux = tip.x - P.x, uy = tip.y - P.y;
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(P.x + ux * 0.62 + tx * tw * 0.10, P.y + uy * 0.62 + ty * tw * 0.10, tip.x, tip.y);
    ctx.quadraticCurveTo(P.x + ux * 0.42 - tx * tw * 0.25, P.y + uy * 0.42 - ty * tw * 0.25, bx, by);
    ctx.closePath();
  }

  function drawText(ctx, lay, x, y, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `700 ${C.fontPx}px "${C.family}"`;
    const top = y + (lay.lines.length ? 0 : 0);
    lay.lines.forEach((ln, li) => {
      let cx = x;
      const cy = top + li * lay.lineH + lay.lineH / 2;
      // マーカー（強調の下地）
      let runStart = null, runW = 0;
      const flush = () => {
        if (runStart !== null) {
          ctx.fillStyle = MARK;
          ctx.beginPath();
          rrPath(ctx, runStart, cy + C.fontPx * 0.10, runW, C.fontPx * 0.32, 6);
          ctx.fill();
          runStart = null; runW = 0;
        }
      };
      for (const c of ln.chars) {
        if (c.emph) { if (runStart === null) runStart = cx; runW += c.w; } else flush();
        cx += c.w;
      }
      flush();
      cx = x;
      for (const c of ln.chars) {
        ctx.fillStyle = c.emph ? SHU : NAVY;
        ctx.fillText(c.ch, cx, cy + C.fontPx * 0.04);
        cx += c.w;
      }
    });
    ctx.restore();
  }

  function draw(ctx, t) {
    if (t < C.tIn || t > C.tOut + C.popOut) return null;
    const tip = C.anchorAt(t);
    // ポン（出）と縮み（消）
    let s;
    if (t < C.tOut) s = outBack((t - C.tIn) / C.popIn);
    else s = 1 - inBack((t - C.tOut) / C.popOut);
    if (t < C.tIn + C.popIn) s = outBack((t - C.tIn) / C.popIn);
    if (s <= 0.002) return null;

    const st = segState(ctx, t);
    const pos = bodyPos(ctx, t);
    const box = { x: pos.x, y: pos.y, w: st.w, h: st.h };

    ctx.save();
    // しっぽの先を原点にして、ポンと出る（少しだけ傾いて出る）
    ctx.translate(tip.x, tip.y);
    ctx.scale(s, s);
    ctx.rotate((1 - clamp(s, 0, 1)) * -0.10);
    ctx.translate(-tip.x, -tip.y);
    // 文章が切り替わった直後の、小さなふくらみ
    if (st.i > 0) {
      const pulse = 1 + 0.045 * Math.sin(Math.PI * clamp((t - C.segments[st.i].from) / 0.24, 0, 1));
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy);
    }

    // 本体＋しっぽ（ふち→影つきで塗る）
    ctx.lineJoin = 'round';
    ctx.beginPath();
    rrPath(ctx, box.x, box.y, box.w, box.h, C.radius);
    drawTail(ctx, box, tip);
    ctx.save();
    ctx.shadowColor = 'rgba(30,43,90,0.30)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = C.border * 2;
    ctx.stroke();
    ctx.restore();
    // 塗りは、本体としっぽを別々に行う。1つの path にまとめて塗ると、向きが逆のしっぽが本体と重なる所が
    // 「穴」になり、しっぽの付け根にふちの線が透けて見える（青い線で区切られる）。
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    rrPath(ctx, box.x, box.y, box.w, box.h, C.radius);
    ctx.fill();
    ctx.beginPath();
    drawTail(ctx, box, tip);
    ctx.fill();

    // 顔アイコン（丸。準備のコマンドが作った画像をそのまま使う）
    const D = C.faceD;
    const fx = box.x + C.padX + D / 2, fy = box.y + box.h / 2;
    const segs = C.segments;
    const faceCur = segs[st.i].face, facePrev = st.prev ? segs[st.i - 1].face : null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const fk = smooth(st.k);
    const drawFace = (img, a, hop) => {
      if (!img || a <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.drawImage(img, fx - D / 2, fy - D / 2 - hop, D, D);
      ctx.restore();
    };
    const hop = st.i > 0 ? 10 * Math.sin(Math.PI * clamp((t - segs[st.i].from) / 0.3, 0, 1)) : 0;
    if (facePrev && fk < 1) drawFace(facePrev, 1 - fk, 0);
    drawFace(faceCur, st.prev ? fk : 1, hop);
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy - hop * (fk > 0.5 ? 1 : 0), D / 2 + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = NAVY;
    ctx.stroke();
    ctx.restore();

    // 文字
    const tx = box.x + C.padX + D + C.gap;
    const place1 = (lay) => box.y + (box.h - lay.height) / 2;
    if (st.prev) {
      drawText(ctx, st.prev, tx, place1(st.prev), 1 - clamp(st.k * 2, 0, 1));
      drawText(ctx, st.cur, tx, place1(st.cur), clamp(st.k * 2 - 1, 0, 1));
    } else {
      drawText(ctx, st.cur, tx, place1(st.cur), 1);
    }
    ctx.restore();

    // 重なり検査用の位置（ポンの拡縮は、しっぽの先を中心に反映）
    return {
      x: tip.x + (box.x - tip.x) * s, y: tip.y + (box.y - tip.y) * s,
      w: box.w * s, h: box.h * s, tip, scale: s,
    };
  }

  // 改行の結果（確認用）: 各行の文字列の配列
  const linesOf = (ctx, text) => layout(ctx, text).lines.map((l) => l.chars.map((c) => c.ch).join(''));
  return { draw, linesOf };
}
