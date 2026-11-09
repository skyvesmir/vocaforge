/* 学習キュー生成（session.js から切り出し／内容は無変更）
 * - 出題プールの抽出
 * - Retrievability 降順ソート
 * - reviewPerDay / newPerDay の上限適用
 * - セクション選択時の新規上限の例外
 * - 出題ゼロのときは、その理由（上限到達／他に期限あり／完了）を返す（自動で別のカードは出さない）
 * - 弱点集中モードの対象抽出（リーチ語のみ）
 */
(function () {
  'use strict';
  const VF = window.VF;
  const ns = (window.__VFSession = window.__VFSession || {});

  // 復習が残っているか（全デッキ横断）。新規学習の解禁判定に使う。
  function hasGlobalDueReviews(now) {
    now = now || Date.now();
    const limit = Store.dueLimit(now);   // 期限は日単位で判定（store.js dueLimit 参照）
    const states = Store.getAllCards();
    const all = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    for (let i = 0; i < all.length; i++) {
      const s = states[all[i].id];
      if (s && s.state !== 'new' && s.due < limit) return true;
    }
    return false;
  }
  window.__hasGlobalDueReviews = hasGlobalDueReviews;

  // 上限に達したあと、ボタンで今日だけ復習枠を足して続ける。
  // 足すのは枠だけ。期限・並び順（R降順）・新規カードの解禁条件は一切変えない。
  const EXTRA_STEP = 20;
  ns.EXTRA_STEP = EXTRA_STEP;
  ns.continueReview = function () {
    Store.addReviewExtra(EXTRA_STEP, Date.now());
    window.__startSession('mix', 'due');
  };

  function buildQueue(deck, group) {
    const settings = Store.getSettings();
    const now = Date.now();
    const dueBefore = Store.dueLimit(now);   // 期限は日単位で判定（store.js dueLimit 参照）
    const states = Store.getAllCards();
    const daily = Store.getDaily(now);

    // 対象カードプール
    let pool;
    if (deck === 'mix') {
      pool = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    } else {
      pool = VF.deckCards(deck, group);
    }

    const due = [], fresh = [];
    pool.forEach(c => {
      const s = states[c.id];
      if (!s || s.state === 'new') fresh.push(c);
      else if (s.due < dueBefore) due.push(c);
    });

    // 復習の並び: Retrievability降順（想起確率が高い順）
    // 上限（reviewPerDay）があるとき、どの期限カードを今日の枠に入れるかの選び方。
    // Anki フォーラムの提案（forums.ankiweb.net "Improving sort orders"、根拠は FSRS 作者側のシミュレーション）では、
    // 「上限があるなら、同じ保持率を最少の学習時間で維持できる」とされる。公式の結論ではなく、条件付きの主張。
    // この実装での理想化シミュレーションでも、期限の古い順より時間コストが約1.5%低く、平均想起確率はほぼ同じ（0.936 対 0.937）。
    // 一方で、最古の期限超過は長くなる（31日 対 22日）。万能の最良ではなく、時間効率と古いカードの放置を交換する暫定方針。
    // 選ばれたカードの表示順は、あとで interleave でシャッフルする。
    const rNow = {};
    due.forEach(c => {
      const st = states[c.id];
      const elapsed = st.last_review ? Math.max(0, (now - st.last_review) / 86400000) : 0;
      rNow[c.id] = FSRS.retrievability(elapsed, st.stability || 0.001);
    });
    due.sort((a, b) => rNow[b.id] - rNow[a.id]);

    // 「あと20件続ける」で足した今日だけの枠（ローカル専用）。上限の数字そのものは変えない。
    const extraToday = Store.getReviewExtra ? Store.getReviewExtra(now) : 0;
    // 上限OFFのときは期限カードを全部出す（上限・追加枠・hiddenDue は意味を持たない）
    const capOn = settings.reviewCapEnabled !== false;
    let revAllowed = capOn ? Math.max(0, settings.reviewPerDay + extraToday - daily.review) : Infinity;
    const dueQueue = due.slice(0, revAllowed);

    // 復習専用モード: ①ホームの「復習を開始」(group==='due') か ②復習がまだ残っている間は新規を出さない
    const reviewOnly = (group === 'due');

    // 新規学習は「復習が終わってから」解禁する。
    //  - この対象プール内に未消化の復習があるうちは新規を出さない
    //  - 全デッキで見ても復習が残っていれば新規は出さない（復習優先の徹底）
    let queue;
    if (reviewOnly) {
      queue = dueQueue; // 復習だけ
    } else if (dueQueue.length > 0 || hasGlobalDueReviews(now)) {
      // まだ復習が残っている → 復習を優先し、新規は出さない
      queue = dueQueue;
    } else {
      // 復習が片付いた → ここで初めて新規を解禁
      let newAllowed = Math.max(0, settings.newPerDay - daily.new);
      if (group && group !== 'due' && group !== 'all' && deck !== 'mix') {
        // 特定セクションを明示選択した場合は上限を緩める（学習意欲尊重）
        // 1回あたりの個数は設定「セクション学習の新規カード数」で変更可能（下限10）
        newAllowed = Math.max(newAllowed, Math.max(10, settings.sectionNewLimit || 50));
      }
      queue = fresh.slice(0, newAllowed);
    }

    // 出題が空のとき、自動で別のカード（期限前・未学習）を出すことはしない。
    // かつては「期限が近い順に20枚」を出していたが、上限・新規ゲートを入口ごとに迂回し、
    // 期限前の前倒し復習（安定度の伸びが期限どおりの約2割）まで混ぜてしまっていた。
    // 代わりに、なぜ空なのかを返して画面で伝える。
    if (settings.interleave) queue = Quiz.shuffle(queue);
    // プール（誤答生成用）は形式別に十分な数が要る
    // hiddenDue: 選択プールの期限カードのうち、今日の上限に入りきらなかった枚数
    return { queue, pool, settings, reviewOnly, dueTotal: due.length, hiddenDue: due.length - dueQueue.length };
  }

  // ====== 弱点集中モード（ブートキャンプ） ======
  // 対象: リーチ語だけ。リーチかどうかは FSRS.isLeech()（復習回数と安定度）で判定する。
  // 保存済みの is_leech フラグは読まない（旧判定=間違い回数の古い値が残っているため）。
  // 復習期限に関係なく、最も弱い順に最大 WEAK_SESSION_SIZE 枚をドリル出題する。
  // 並び: 安定度が低い順（記憶が最も持たないカードから）、同じなら難易度が高い順。
  // このモードの解答は FSRS の状態を変えない（session-answer.js 参照）ので、
  // リーチから外れるのは、通常の復習で安定度が伸びたときだけ。
  const WEAK_SESSION_SIZE = 15;
  function weakPool() {
    const states = Store.getAllCards();
    const all = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      const s = states[c.id];
      if (!FSRS.isLeech(s)) continue;
      out.push({ c, stab: s.stability || 0, diff: s.difficulty || 0 });
    }
    out.sort((a, b) => (a.stab - b.stab) || (b.diff - a.diff));
    return out.map(x => x.c);
  }
  window.__weakCount = function () { return weakPool().length; };

  // ====== 日次記録の「総数」確定（記録のみ・表示は変えない）======
  // 全デッキ横断の期限カード数。デッキ選択に左右されない値を使う
  // （buildQueue の dueTotal は選択プール内の数なので日次記録には使えない）。
  function globalDueTotal(now) {
    now = now || Date.now();
    const limit = Store.dueLimit(now);   // 期限は日単位（復習キュー・ホームの件数と同じ判定）
    const states = Store.getAllCards();
    const all = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    let n = 0;
    for (let i = 0; i < all.length; i++) {
      const s = states[all[i].id];
      if (s && s.state !== 'new' && s.due < limit) n++;
    }
    return n;
  }
  // dueTotal / weakTotal を「その日の最初に見た時点」で確定させる。
  // Store 側がその日の初回だけを通すので、2回目以降の呼び出しでは値は変わらない
  // （新規カードを開くほど全消化が遠のく、という逆転を防ぐ）。
  // 新規カードの分は dueTotal に足さず newFirstPassed だけで数える。
  function captureDailyTotals(now) {
    now = now || Date.now();
    try {
      Store.setDailyDueTotal(globalDueTotal(now), now);
      Store.setDailyWeakTotal(weakPool().length, now);
    } catch (e) {}
  }

  ns.hasGlobalDueReviews = hasGlobalDueReviews;
  ns.buildQueue = buildQueue;
  ns.weakPool = weakPool;
  ns.WEAK_SESSION_SIZE = WEAK_SESSION_SIZE;
  ns.globalDueTotal = globalDueTotal;
  ns.captureDailyTotals = captureDailyTotals;
})();
