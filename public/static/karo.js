/* カロ（相譜の精霊）— 案内役とお願い画面
 *
 * 案内役: 画面の隅に小さなアイコンを出し、タップすると吹き出しでその画面の使い方を伝える。
 *   ・各ヒントは、最初に見た1回だけ自動で開く。あとはアイコンをタップしたときだけ開く。
 *   ・設定の「カロのヒント」で表示そのものを切れる（既定は表示）。
 *   ・この2つ（表示ON/OFF・見たヒント）は端末ごとに localStorage へ保存する。
 *     学習データではないので、エクスポート・クラウド同期には入れない（魔女文字・画面キーボード設定と同じ扱い）。
 *   ・localStorage が使えない環境でも落ちない（その場合は毎回、初回扱いで表示する）。
 *
 * お願い画面（renderFeedback）: テスター版のホームのカードから開く。Google フォームへのボタンを出す。
 *
 * 画像: /static/karo/karo-icon.webp（案内役の顔）, karo-ask.webp（お願いのポーズ）
 */
(function () {
  'use strict';
  const KEY_ON = 'vf-karo';          // '0' のとき非表示。無い／'1' は表示
  const KEY_SEEN = 'vf-karo-seen';   // { ヒントID: 1 }
  const IMG_ICON = '/static/karo/karo-icon.webp';
  const IMG_ASK = '/static/karo/karo-ask.webp';

  // 画面ごとの一言。言葉づかいは、読相の見習いとしてのカロ（やさしく短く）。
  const HINTS = {
    home: 'きょうの入り口です。期限が来たカードの復習が先、そのあとで新しい語を覚えます。毎日少しずつが、いちばん効きますよ。',
    grading: '答えを見たら、手応えを選びます。すぐ分かったら「できた」、時間がかかったら「難しい」、思い出せなかったら「もう一度」。正直に選ぶほど、次に出す日がうまく決まります。',
    gradingDrill: 'いまは練習中です。ここでの正解は、復習の予定を変えません。あとで普通の復習のときに、時間を空けてもう一度確かめます。',
    stats: 'ここは記憶の記録です。「リーチ」は、何度も忘れてしまうカードのこと。くり返し練習すると、少しずつ定着します。「定着」は、記憶が長く持つようになったカードです。',
    settings: '1日の新規の数や、復習の上限、見た目を変えられます。迷ったら、そのままで大丈夫です。わたしの出番を減らしたいときは、「カロのヒント」をオフにしてください。'
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function enabled() { return lsGet(KEY_ON) !== '0'; }
  function setEnabled(on) { lsSet(KEY_ON, on ? '1' : '0'); }

  function seenMap() {
    try { const m = JSON.parse(lsGet(KEY_SEEN) || '{}'); return (m && typeof m === 'object') ? m : {}; }
    catch (e) { return {}; }
  }
  function markSeen(id) { const m = seenMap(); m[id] = 1; lsSet(KEY_SEEN, JSON.stringify(m)); }

  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 案内役のHTML。opts.inline=true のときは、画面の流れの中に1行で置く（採点画面用）。
  // 隅に固定する場合は、ナビの上・右下に置く。
  function html(id, opts) {
    if (!enabled() || !HINTS[id]) return '';
    const inline = !!(opts && opts.inline);
    return '<div class="vf-karo ' + (inline ? 'vf-karo-inline' : 'vf-karo-corner') + '" data-karo="' + id + '">' +
      '<div class="vf-karo-bubble" role="status" hidden>' +
        '<button type="button" class="vf-karo-close" aria-label="閉じる"><i class="fas fa-xmark"></i></button>' +
        '<div class="vf-karo-name">カロ</div>' +
        '<div class="vf-karo-text">' + esc(HINTS[id]) + '</div>' +
      '</div>' +
      '<button type="button" class="vf-karo-btn" aria-label="カロのヒント" aria-expanded="false">' +
        '<img src="' + IMG_ICON + '" alt="" width="52" height="52" draggable="false"></button>' +
    '</div>';
  }

  function setOpen(el, open) {
    const b = el.querySelector('.vf-karo-bubble');
    const btn = el.querySelector('.vf-karo-btn');
    if (!b || !btn) return;
    b.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // root 配下の案内役を動かす。描画のたびに呼ぶ（要素は毎回作り直されるので二重バインドにならない）。
  function bind(root) {
    (root || document).querySelectorAll('.vf-karo[data-karo]').forEach(el => {
      if (el._karoBound) return;
      el._karoBound = true;
      const id = el.getAttribute('data-karo');
      const btn = el.querySelector('.vf-karo-btn');
      const close = el.querySelector('.vf-karo-close');
      const bubble = el.querySelector('.vf-karo-bubble');
      if (btn) btn.onclick = () => setOpen(el, bubble.hidden);
      if (close) close.onclick = () => setOpen(el, false);
      // 最初の1回だけ自動で開く
      if (!seenMap()[id]) { markSeen(id); setOpen(el, true); }
    });
  }

  // 隅に出ている吹き出しは、ほかの場所をタップしたら閉じる（画面の内容を隠したままにしない）
  document.addEventListener('pointerdown', e => {
    document.querySelectorAll('.vf-karo-corner').forEach(el => {
      const b = el.querySelector('.vf-karo-bubble');
      if (b && !b.hidden && !el.contains(e.target)) setOpen(el, false);
    });
  });

  // ====== お願い画面（テスター版） ======
  function feedbackUrl() {
    const url = window.VF_CONFIG && window.VF_CONFIG.FEEDBACK_URL;
    return (typeof url === 'string' && /^https:\/\/docs\.google\.com\/forms\//.test(url)) ? url : '';
  }

  window.renderFeedback = function () {
    const url = feedbackUrl();
    if (!url) return window.renderHome();   // フォームが設定されていなければホームへ
    return '<div class="max-w-xl mx-auto px-5 pt-6 pb-28 min-h-screen flex flex-col items-center text-center">' +
      '<img src="' + IMG_ASK + '" alt="お願いするカロ" width="208" class="w-52 h-auto select-none" draggable="false" ' +
        // 画像は胸から上で切ってあるので、下の端をぼかして、切れ目が見えないようにする
        'style="-webkit-mask-image:linear-gradient(#000 78%,transparent);mask-image:linear-gradient(#000 78%,transparent)">' +
      '<div class="vf-karo-bubble vf-karo-bubble-static mt-1" role="status">' +
        '<div class="vf-karo-name">カロ</div>' +
        '<div class="text-lg font-extrabold">協力お願いします！</div>' +
      '</div>' +
      '<p class="text-sm text-slate-400 leading-relaxed mt-5">不便なところや、追加してほしい単語・熟語があれば、教えてください。いただいた意見は、今後の改良の参考にします。</p>' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" ' +
        'class="mt-6 w-full max-w-xs bg-brand hover:bg-brand-dark transition text-white font-bold rounded-2xl py-3.5 text-sm active:scale-[0.98]">' +
        '<i class="fas fa-envelope mr-2"></i>フォームを開く<i class="fas fa-arrow-up-right-from-square ml-2 text-xs opacity-80"></i></a>' +
      '<button data-go="home" class="mt-3 text-sm text-slate-400 py-2 px-4"><i class="fas fa-chevron-left mr-1 text-xs"></i>ホームへ戻る</button>' +
      VF.nav('home') + '</div>';
  };

  window.VFKaro = { html, bind, enabled, setEnabled, hints: HINTS };
})();
