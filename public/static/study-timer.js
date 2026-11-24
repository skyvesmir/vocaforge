/* 勉強時間の自動計測
 *
 * 数えるのは「カードを解いている・めくっている画面」（route が session / flash）にいる間だけ。
 *  - 最後の操作から 30 秒までは数える。それ以降は、次の操作があるまで数えない（放置で伸びない）。
 *  - 画面を離れた（タブ切替・別アプリ・画面ロック）瞬間に止める。戻っても、離れていた間は数えない。
 *  - 設定 studyTimeAskOnReturn が ON のときだけ、20 秒以上離れて戻ったら「再開」ウィンドウを出す。
 *      再開する / 離れている間も勉強していた（上限30分を足す）/ 今日はここまで
 *    既定は OFF（何も聞かず、離れた時間は数えずに再開）。
 *  - 記録先は日次記録の studyMs（Store.addStudyMs）。同期は既存の日次同期に乗る。
 *
 * 計算の本体（createCounter）は画面にも時計にも触らない純粋な部分で、
 * scripts/test-study-timer.mjs で単体テストしている。
 */
(function (global) {
  'use strict';

  const IDLE_MS = 30 * 1000;           // 最後の操作から数える上限
  const ASK_MIN_AWAY_MS = 20 * 1000;   // 「再開」ウィンドウを出す境目
  const AWAY_CAP_MS = 30 * 60 * 1000;  // 「離れている間も勉強していた」で足せる上限
  const TICK_MS = 1000;                // 内部の確認間隔
  const SAVE_EVERY_MS = 30 * 1000;     // 端末への保存間隔
  const SYNC_EVERY_MS = 120 * 1000;    // クラウド送信待ちへ入れる間隔

  // ---- 計算の本体（純粋）----
  // 時刻 t はすべて ms。呼び出しは時刻順に行う（戻った時刻は直前の時刻に丸める）。
  function createCounter(o) {
    o = o || {};
    const idleMs = o.idleMs || IDLE_MS;
    const awayCapMs = o.awayCapMs || AWAY_CAP_MS;
    let lastT = 0;          // 最後に見た時刻（時計が戻っても進めるだけ）
    let lastActive = 0;     // 最後の操作の時刻
    let creditedUntil = 0;  // ここまでは数え済み
    let pending = 0;        // 数えたが、まだ保存していない分
    let studying = false;   // 解いている画面にいるか
    let paused = false;     // 画面を離れている／ウィンドウの選択待ち
    let leftAt = 0;

    function mono(t) { if (t < lastT) t = lastT; lastT = t; return t; }

    function advance(t) {
      if (paused || !studying) { creditedUntil = t; return; }
      const end = Math.min(t, lastActive + idleMs);
      if (end > creditedUntil) { pending += end - creditedUntil; creditedUntil = end; }
    }

    return {
      // 解いている画面にいるかを知らせる
      setStudying(t, flag) {
        t = mono(t);
        advance(t);                      // これまでの状態で数える
        flag = !!flag;
        if (flag && !studying) creditedUntil = t;   // 入った時点から数え始める（さかのぼらない）
        studying = flag;
      },
      // 操作（タップ・キー・スクロールなど）があった
      activity(t) {
        t = mono(t);
        if (paused) return;
        advance(t);
        lastActive = t;
        creditedUntil = t;               // 30秒を超えて空いた分は数えない
      },
      tick(t) { advance(mono(t)); },
      // 画面を離れた。すでに離れているときは何もしない
      pause(t) {
        t = mono(t);
        if (paused) return;
        advance(t);
        paused = true;
        leftAt = t;
      },
      // 再開する。離れていた間は数えない
      resume(t) {
        t = mono(t);
        paused = false;
        lastActive = t;
        creditedUntil = t;
      },
      isPaused() { return paused; },
      awayMs(t) { return paused ? Math.max(0, mono(t) - leftAt) : 0; },
      // 「離れている間も勉強していた」: 上限つきで足す。足した ms を返す
      addAway(ms) {
        const add = Math.max(0, Math.min(awayCapMs, ms || 0));
        pending += add;
        return add;
      },
      // 保存していない分を取り出す（取り出すと 0 に戻る）
      take() { const v = Math.round(pending); pending = 0; return v; },
      peek() { return pending; }
    };
  }

  // ---- 表示用 ----
  // 長さの表し方: 1時間未満は分、それ以上は「X時間Y分」。1分未満は「N秒」
  function fmtDur(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    if (s < 60) return s + '秒';
    const m = Math.floor(s / 60);
    if (m < 60) return m + '分';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? h + '時間' + r + '分' : h + '時間';
  }
  // 「離れていた時間」は分と秒まで出す
  function fmtAway(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    if (s < 60) return s + '秒';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? m + '分' + r + '秒' : m + '分';
    const h = Math.floor(m / 60);
    return (m % 60) ? h + '時間' + (m % 60) + '分' : h + '時間';
  }

  global.VFStudyTime = {
    createCounter, fmtDur, fmtAway,
    IDLE_MS, ASK_MIN_AWAY_MS, AWAY_CAP_MS
  };

  // ここから先はブラウザの画面でだけ動く（Node のテストでは読み込むだけ）
  if (!global.document || !global.Store) return;

  const Store = global.Store;
  const counter = createCounter();
  let lastSaveAt = Date.now();
  let lastSyncAt = Date.now();
  let lastDay = Store.todayStr(Date.now());
  let lastTickT = Date.now();
  let dialogOpen = false;

  function route() {
    return (global.VF && global.VF.STATE && global.VF.STATE.route) || '';
  }
  function isStudyRoute() {
    const r = route();
    return r === 'session' || r === 'flash';
  }

  // 数えた分を端末に保存する（t の日に付ける）
  function commit(t) {
    const ms = counter.take();
    if (ms > 0) {
      try { Store.addStudyMs(ms, t); } catch (e) {}
    }
    lastSaveAt = t;
    return ms;
  }
  // 今日の分を、クラウド送信待ちの箱へ入れる（ログイン時だけ実際に送られる）
  function enqueueToday(t) {
    lastSyncAt = t;
    try {
      if (global.VFOutbox && global.VFOutbox.enqueueDaily) {
        global.VFOutbox.enqueueDaily([{ day: Store.todayStr(t), stats: Store.getDaily(t) }]);
      }
    } catch (e) {}
  }

  let wasStudying = false;
  function observeRoute(t) {
    const now = isStudyRoute();
    counter.setStudying(t, now);
    if (wasStudying && !now) { commit(t); enqueueToday(t); }   // 解く画面を出た: すぐ保存
    wasStudying = now;
  }

  function tick() {
    if (dialogOpen) return;
    const t = Date.now();
    // 日付をまたいだら、まず前日の分を前日に付ける
    const day = Store.todayStr(t);
    if (day !== lastDay) {
      counter.tick(lastTickT);
      commit(lastTickT);
      lastDay = day;
    }
    lastTickT = t;
    observeRoute(t);
    counter.tick(t);
    if (t - lastSaveAt >= SAVE_EVERY_MS) commit(t);
    if (t - lastSyncAt >= SYNC_EVERY_MS && wasStudying) enqueueToday(t);
  }
  setInterval(tick, TICK_MS);

  // ---- 操作 ----
  function onActivity() {
    if (dialogOpen) return;
    const t = Date.now();
    observeRoute(t);
    counter.activity(t);
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'].forEach(function (ev) {
    global.addEventListener(ev, onActivity, { capture: true, passive: true });
  });

  // ---- 画面を離れる／戻る ----
  function onHidden() {
    if (dialogOpen) return;
    const t = Date.now();
    observeRoute(t);
    counter.pause(t);
    commit(t);
    enqueueToday(t);
  }
  function onVisible() {
    if (dialogOpen || !counter.isPaused()) return;
    const t = Date.now();
    const away = counter.awayMs(t);
    const ask = Store.getSettings().studyTimeAskOnReturn === true;
    if (ask && away >= ASK_MIN_AWAY_MS && isStudyRoute()) { showReturnDialog(away); return; }
    counter.resume(t);   // 既定: 何も聞かず、離れた間は数えずに再開
  }
  global.document.addEventListener('visibilitychange', function () {
    if (global.document.visibilityState === 'hidden') onHidden(); else onVisible();
  });
  global.addEventListener('pagehide', onHidden);
  global.addEventListener('pageshow', function (e) { if (e && e.persisted) onVisible(); });

  // ---- 「再開」ウィンドウ ----
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function showReturnDialog(awayMs) {
    dialogOpen = true;
    const addMs = Math.min(awayMs, AWAY_CAP_MS);
    const root = global.document.createElement('div');
    root.id = 'study-return-dialog';
    root.className = 'fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'srd-title');
    function body(html) {
      root.innerHTML = '<div class="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 text-center">' + html + '</div>';
    }
    body(
      '<div class="w-14 h-14 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-3"><i class="fas fa-hand text-brand text-xl"></i></div>' +
      '<h2 id="srd-title" class="text-lg font-extrabold mb-1">おかえりなさい</h2>' +
      '<p class="text-slate-400 text-sm mb-5">画面を離れていた時間: <b class="text-slate-200">' + esc(fmtAway(awayMs)) + '</b></p>' +
      '<button data-srd="resume" class="w-full bg-brand text-white font-bold rounded-xl py-3 mb-2">再開する' +
        '<span class="block text-[11px] font-normal opacity-80">離れていた間は数えません</span></button>' +
      '<button data-srd="add" class="w-full bg-slate-800 text-slate-100 font-bold rounded-xl py-3 mb-2">離れている間も勉強していた' +
        '<span class="block text-[11px] font-normal text-slate-400">' + esc(fmtAway(addMs)) + ' を勉強時間に足します' +
        (awayMs > AWAY_CAP_MS ? '（上限 ' + (AWAY_CAP_MS / 60000) + '分）' : '') + '</span></button>' +
      '<button data-srd="end" class="w-full text-slate-400 font-bold py-2.5">今日はここまで</button>'
    );
    global.document.body.appendChild(root);

    // 後ろのカード画面のキー操作（1〜4 など）を止める
    function trap(e) { e.stopPropagation(); if (e.key !== 'Tab') e.preventDefault(); }
    global.addEventListener('keydown', trap, true);

    function close() {
      global.removeEventListener('keydown', trap, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      dialogOpen = false;
    }
    function leaveStudy() {
      const r = route();
      if (r === 'session' && global.__VFSession && global.__VFSession.leave) { global.__VFSession.leave(); return; }
      if (r === 'flash' && global.__flashCleanup) global.__flashCleanup();
      if (global.VF && global.VF.go) global.VF.go('home');
    }
    root.addEventListener('click', function (e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-srd]') : null;
      if (!b) return;
      const act = b.getAttribute('data-srd');
      const t = Date.now();
      if (act === 'resume') {
        close(); counter.resume(t);
      } else if (act === 'add') {
        counter.addAway(awayMs);
        commit(t); enqueueToday(t);
        close(); counter.resume(t);
      } else if (act === 'end') {
        commit(t); enqueueToday(t);
        const today = Store.getStudyMs(t), week = Store.getStudyMsRecent(7, t);
        body(
          '<div class="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3"><i class="fas fa-check text-emerald-400 text-xl"></i></div>' +
          '<h2 id="srd-title" class="text-lg font-extrabold mb-4">おつかれさまでした</h2>' +
          '<div class="grid grid-cols-2 gap-2 mb-5">' +
            '<div class="bg-slate-800 rounded-xl py-3"><div class="text-xl font-extrabold">' + esc(fmtDur(today)) + '</div><div class="text-[10px] text-slate-400">今日の勉強時間</div></div>' +
            '<div class="bg-slate-800 rounded-xl py-3"><div class="text-xl font-extrabold">' + esc(fmtDur(week)) + '</div><div class="text-[10px] text-slate-400">直近7日</div></div>' +
          '</div>' +
          '<button data-srd="home" class="w-full bg-brand text-white font-bold rounded-xl py-3">ホームへ</button>'
        );
        const hb = root.querySelector('[data-srd="home"]');
        if (hb) hb.focus();
      } else if (act === 'home') {
        close(); counter.resume(t); leaveStudy();
      }
    });
    const first = root.querySelector('[data-srd="resume"]');
    if (first) first.focus();
  }

  // 画面側（ホーム・統計）が表示前に呼ぶ: いま数えている分を保存してから合計を読めるようにする
  global.VFStudyTime.flush = function () {
    const t = Date.now();
    if (!dialogOpen) { observeRoute(t); counter.tick(t); commit(t); }
  };
  global.VFStudyTime.today = function () { return Store.getStudyMs(Date.now()); };
  global.VFStudyTime.recent = function (days) { return Store.getStudyMsRecent(days || 7, Date.now()); };
})(window);
