/* FSRS-7 オンデバイス・パラメータ最適化
 *
 * 根拠（2026年7月 Web調査）:
 *  - srs-benchmark（Anki 1万人・7.3億レビュー）の README では、個人最適化した
 *    FSRS-7 は既定パラメータより log loss が小さい（同日復習なし: 0.3401 vs 0.3620）。
 *    なお「84.3%のユーザーで優位」は Expertium の記事の FSRS-6 同士の比較の数字で、
 *    FSRS-7 のものではない。このアプリの実装（35重みの草案版）での効果は未検証。
 *  - Anki公式FAQ: 「レビュー数が倍になるごとに再最適化」を推奨。
 *  - 本実装は fsrs-optimizer（Python/PyTorch）の座標降下版。
 *    勾配計算の代わりに座標ごとの候補探索（coordinate descent）を使い、
 *    ブラウザ内で数秒で完了する。
 *  - 過学習ガード: 時系列ホールドアウト（古い75%で学習→新しい25%で検証）を必須にする。
 *    検証用の履歴が足りないときは、最適化しない（学習した履歴で採点しない）。
 *    採用は「1件ごとの損失の差（対の差）が、標準誤差の2倍より大きく良い」かつ
 *    「相対1%以上良い」ときだけ。比較相手は、既定パラメータと、いま使っているパラメータの両方。
 *    （旧: 相対1%だけ。検証セット50〜75件では閾値が雑音の1/10〜1/25で、
 *     改善の余地がない人にも約2割で採用していた。testN<50 では学習した履歴で採点していた）
 *
 * 公開API: window.FSRSOpt = { status, optimize, applySaved, MIN_REVIEWS }
 */
(function (global) {
  'use strict';

  const MIN_REVIEWS = 300;   // これ未満では最適化しない（Anki公式は400前後を推奨）
  const MIN_TEST = 50;       // 検証に使う新しいレビュー（経過0.5日以上）の最低件数。これ未満では最適化しない
  const GATE_Z = 2;          // 採用: 対の差の平均が、標準誤差の何倍より大きく良いか
  const GATE_REL = 0.01;     // 採用: 平均 log loss が相対でこれ以上良いこと
  const DAY = 86400000;

  // 最適化対象のパラメータ（長期記憶に効く16個）。
  // 短期式(w16-24)・忘却曲線形状(w27-34)はノイズに過敏なためデフォルト固定。
  const OPT_IDX = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  // パラメータごとの下限・上限（fsrs-optimizer の clamp 相当）
  const BOUNDS = {
    0: [0.001, 100], 1: [0.001, 100], 2: [0.001, 100], 3: [0.001, 100], // S0
    4: [1, 10], 5: [0.01, 4], 6: [0.01, 4],                              // 難易度
    7: [0.001, 5], 8: [0.001, 1.2], 9: [0.001, 5],                       // 長期SInc
    10: [0.001, 3], 11: [0.001, 1.5], 12: [0.001, 2.5], 13: [0.001, 3],  // 長期Sfail
    14: [0.2, 1], 15: [1, 5]                                             // Hard/Easy係数
  };

  // ---- レビュー履歴 → カード別シーケンス構築 ----
  // 各レビューに train/test フラグを付ける（時刻の75パーセンタイルで分割）
  // ログ上限キャップで先頭が削除された系列（最初のログの s_before > 0）は、
  // 「初回レビューからのリプレイ」前提が崩れ訓練データを歪めるため除外する。
  function buildSequences() {
    const logs = Store.getLogs().slice()
      .filter(l => l && l.card_id && l.grade >= 1 && l.grade <= 4 && l.reviewed_at)
      .sort((a, b) => a.reviewed_at - b.reviewed_at);
    if (!logs.length) return { seqs: [], total: 0, evaluable: 0, testN: 0, truncated: 0 };

    const cutoff = logs[Math.floor(logs.length * 0.75)].reviewed_at;
    const byCard = {};
    for (const l of logs) (byCard[l.card_id] = byCard[l.card_id] || []).push(l);

    const seqs = [];
    let evaluable = 0, testN = 0, truncated = 0;
    for (const id in byCard) {
      const arr = byCard[id];
      // 先頭欠損検出: 真の初回レビューは s_before === 0。
      // （s_before 未記録の旧ログは後方互換のため欠損扱いしない）
      if (typeof arr[0].s_before === 'number' && arr[0].s_before > 0) {
        truncated++;
        continue;
      }
      const seq = [];
      for (let i = 0; i < arr.length; i++) {
        const elapsed = i === 0 ? 0 : Math.max(0, (arr[i].reviewed_at - arr[i - 1].reviewed_at) / DAY);
        const isTest = arr[i].reviewed_at > cutoff;
        seq.push({ grade: arr[i].grade, elapsed, test: isTest });
        if (i > 0 && elapsed >= 0.5) { evaluable++; if (isTest) testN++; }
      }
      seqs.push(seq);
    }
    return { seqs, total: logs.length, evaluable, testN, truncated };
  }

  // ---- 損失計算: 候補パラメータで履歴をリプレイし log loss を測る ----
  // phase: 'train' | 'test' | 'all' … どのレビューを損失に算入するか
  // 1件ごとの損失の配列を返す（重みが違っても、並びと件数は同じ。対の差を取るため）。
  function lossList(W, seqs, phase) {
    const eng = FSRS.makeEngine(W);
    const out = [];
    for (let k = 0; k < seqs.length; k++) {
      const seq = seqs[k];
      let S = 0, D = 0;
      for (let i = 0; i < seq.length; i++) {
        const rv = seq[i];
        if (i === 0) {
          D = eng.initDifficulty(rv.grade);
          S = Math.max(eng.initStability(rv.grade), 0.001);
          continue;
        }
        const R = eng.retrievability(rv.elapsed, S);
        // 同日再出題（<0.5日）は「直前に見たばかり」でノイズが大きく評価から除外
        // （srs-benchmark も same-day review を評価から外している）
        if (rv.elapsed >= 0.5) {
          const inPhase = phase === 'all' || (phase === 'test') === !!rv.test;
          if (inPhase) {
            const y = rv.grade > 1 ? 1 : 0;
            const p = Math.min(Math.max(R, 1e-6), 1 - 1e-6);
            out.push(-(y * Math.log(p) + (1 - y) * Math.log(1 - p)));
          }
        }
        D = eng.nextDifficulty(D, rv.grade);
        const base = rv.elapsed < 1 ? 16 : 7;
        S = Math.max(eng.stabilityUpdate(base, D, S, R, rv.grade), 0.001);
      }
    }
    return out;
  }

  function meanOf(a) {
    if (!a.length) return Infinity;
    let t = 0;
    for (let i = 0; i < a.length; i++) t += a[i];
    return t / a.length;
  }

  function computeLoss(W, seqs, phase) {
    return meanOf(lossList(W, seqs, phase));
  }

  // 対の差: base（比べる相手）の損失 − cand（候補）の損失。正なら候補が良い。
  // 戻り値: { n, gain（平均の差）, se（その標準誤差）, rel（相対改善）}
  function pairedGain(base, cand) {
    const n = Math.min(base.length, cand.length);
    if (n < 2) return { n, gain: 0, se: Infinity, rel: 0 };
    let m = 0;
    for (let i = 0; i < n; i++) m += base[i] - cand[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) { const x = base[i] - cand[i] - m; v += x * x; }
    const se = Math.sqrt(v / (n - 1) / n);
    const bm = meanOf(base.slice(0, n));
    return { n, gain: m, se, rel: bm > 0 ? m / bm : 0 };
  }
  const passesGate = g => g.n >= MIN_TEST && g.gain > GATE_Z * g.se && g.rel >= GATE_REL;

  const clampP = (i, v) => {
    const b = BOUNDS[i];
    return b ? Math.min(Math.max(v, b[0]), b[1]) : v;
  };

  // ---- 座標降下法による最適化（非同期・進捗コールバック付き）----
  async function coordinateDescent(seqs, phase, onProgress) {
    const W = FSRS.defaultWeights.slice();
    let best = computeLoss(W, seqs, phase);
    const PASSES = 4;
    const CAND = [0.7, 0.85, 0.95, 1.05, 1.2, 1.45]; // 乗算候補
    let step = 0;
    const totalSteps = PASSES * OPT_IDX.length;

    for (let pass = 0; pass < PASSES; pass++) {
      let improvedInPass = false;
      for (const idx of OPT_IDX) {
        const orig = W[idx];
        let bestV = orig;
        for (const m of CAND) {
          const v = clampP(idx, orig * m);
          if (v === bestV) continue;
          W[idx] = v;
          const L = computeLoss(W, seqs, phase);
          if (L < best - 1e-6) { best = L; bestV = v; improvedInPass = true; }
        }
        W[idx] = bestV;
        step++;
        if (onProgress) onProgress(Math.round(step / totalSteps * 100));
        // UIをブロックしない
        await new Promise(r => setTimeout(r, 0));
      }
      if (!improvedInPass) break;
    }
    return { W, loss: best };
  }

  // ---- 公開API ----
  const FSRSOpt = {
    MIN_REVIEWS,

    // 現在の状態（設定画面表示用）
    status() {
      const s = Store.getSettings();
      const logs = Store.getLogs();
      // 累計回数（キャップの影響を受けない）。再最適化推奨判定に使う。
      const cum = (Store.getReviewCount ? Store.getReviewCount() : logs.length);
      const optimizedReviews = s.fsrsOptimizedReviews || 0;
      return {
        reviews: logs.length,
        active: !!(s.fsrsWeights && s.fsrsWeights.length),
        optimizedAt: s.fsrsOptimizedAt || null,
        optimizedReviews,
        ready: logs.length >= MIN_REVIEWS,
        // Anki公式推奨「レビュー数が倍になったら再最適化」（累計で判定）
        suggestReoptimize: optimizedReviews > 0 && cum >= optimizedReviews * 2
      };
    },

    // 保存済みパラメータを適用（起動時に呼ぶ）
    applySaved() {
      const s = Store.getSettings();
      if (s.fsrsWeights && FSRS.setWeights(s.fsrsWeights)) return true;
      return false;
    },

    // 最適化本体
    async optimize(onProgress) {
      const { seqs, total, evaluable, testN, truncated } = buildSequences();
      if (total < MIN_REVIEWS) {
        return { ok: false, reason: 'not_enough', reviews: total, needed: MIN_REVIEWS };
      }
      if (!seqs.length || !evaluable) {
        return { ok: false, reason: 'not_enough', reviews: total, needed: MIN_REVIEWS, truncated };
      }
      // 検証用の新しい履歴が足りないときは、最適化しない。
      // （以前は、学習に使った履歴で採点していた。それでは「良くなった」と必ず見えてしまう）
      if (testN < MIN_TEST) {
        return { ok: false, reason: 'holdout_short', reviews: total, needed: MIN_REVIEWS,
          testN, needTest: MIN_TEST, truncated };
      }
      const defaultW = FSRS.defaultWeights.slice();
      const currentW = FSRS.getWeights();
      const hasCustom = currentW.some((v, i) => v !== defaultW[i]);

      const baseDefault = lossList(defaultW, seqs, 'test');
      const baseCurrent = hasCustom ? lossList(currentW, seqs, 'test') : null;
      const { W } = await coordinateDescent(seqs, 'train', onProgress);
      const cand = lossList(W, seqs, 'test');

      // 採用: 既定とも、いま使っているものとも、対の差で「はっきり」良いときだけ
      const vsDefault = pairedGain(baseDefault, cand);
      const vsCurrent = hasCustom ? pairedGain(baseCurrent, cand) : null;
      const ok = passesGate(vsDefault) && (!vsCurrent || passesGate(vsCurrent));
      const before = meanOf(hasCustom ? baseCurrent : baseDefault);
      const after = meanOf(cand);

      if (!ok) {
        return {
          ok: true, applied: false, before, after,
          reviews: total, evaluable, holdout: true, truncated,
          gain: vsDefault.gain, se: vsDefault.se,
          reason: 'no_improvement'
        };
      }

      FSRS.setWeights(W);
      Store.setSettings({
        fsrsWeights: W,
        fsrsOptimizedAt: Date.now(),
        // 累計回数で記録（ログキャップ後も「レビュー数倍増で再最適化」判定が正しく働く）
        fsrsOptimizedReviews: (Store.getReviewCount ? Store.getReviewCount() : total)
      });
      return { ok: true, applied: true, before, after, weights: W, reviews: total, evaluable,
        holdout: true, truncated, gain: vsDefault.gain, se: vsDefault.se };
    },

    // デフォルトへ戻す
    resetToDefault() {
      FSRS.setWeights(FSRS.defaultWeights.slice());
      Store.setSettings({ fsrsWeights: null, fsrsOptimizedAt: null, fsrsOptimizedReviews: 0 });
    }
  };

  global.FSRSOpt = FSRSOpt;

  // ロード時に保存済み個人パラメータを適用
  try { FSRSOpt.applySaved(); } catch (e) { /* store未初期化なら無視 */ }
})(window);
