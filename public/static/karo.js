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
 * 成長するカロ（growthHtml）: ホームのカード。学習済みの語数で姿が5段階に変わる。段階が上がったときは、
 *   ホームを開いたときに1回だけ祝いの画面を出し、最終段階では正体を明かす。
 *   進んだ段階は端末ごとの localStorage（vf-karo-stage）に覚える。学習データではないので同期しない。
 *
 * 画像: /static/karo/karo-icon.webp（案内役の顔）, karo-ask.webp（お願いのポーズ）, stage1〜5.webp（成長）
 *   成長の絵は白地のまま使い、紙色の面に mix-blend-mode: multiply で重ねて白を溶かす（透過の切り抜きをしない）。
 */
(function () {
  'use strict';
  const KEY_ON = 'vf-karo';          // '0' のとき非表示。無い／'1' は表示
  const KEY_SEEN = 'vf-karo-seen';   // { ヒントID: 1 }
  const IMG_ICON = '/static/karo/karo-icon.webp';
  const IMG_ASK = '/static/karo/karo-ask.webp';
  const KEY_STAGE = 'vf-karo-stage'; // 到達した成長段階（祝いを1回だけ出すため）

  // 成長の段階。at = その段階になる「学習済み語数」。
  const STAGES = [
    { n: 1, at: 0,    name: '眠る相譜',     line: 'まだ眠っています。語を覚えるたびに、輪郭へ熱が通っていきます。' },
    { n: 2, at: 150,  name: '目ざめの輪郭', line: '輪郭が目ざめました。もう少しで、色がつきます。' },
    { n: 3, at: 600,  name: '色づく子狐',   line: '色がつきました。あなたが覚えた語の分だけ、この子は温かくなります。' },
    { n: 4, at: 1500, name: '立ち上がる獣', line: '二本の足で立てるようになりました。もうすぐ、姿が定まります。' },
    { n: 5, at: 2800, name: 'カロ',         line: '……ずっと案内していたのは、わたしでした。あなたが覚えた分だけ、姿が定まったの。ここから先も、いっしょに。' }
  ];
  const stageImg = n => '/static/karo/stage' + n + '.webp';

  // 画面ごとの一言。言葉づかいは、読相の見習いとしてのカロ（やさしく短く）。
  const HINTS = {
    home: 'きょうの入り口です。期限が来たカードの復習が先、そのあとで新しい語を覚えます。毎日少しずつが、いちばん効きますよ。',
    grading: '答えを見たら、手応えを選びます。すぐ分かったら「できた」、時間がかかったら「難しい」、思い出せなかったら「もう一度」。正直に選ぶほど、次に出す日がうまく決まります。',
    gradingDrill: 'いまは練習中です。ここでの正解は、復習の予定を変えません。あとで普通の復習のときに、時間を空けてもう一度確かめます。',
    stats: 'ここは記憶の記録です。「リーチ」は、何度も忘れてしまうカードのこと。くり返し練習すると、少しずつ定着します。「定着」は、記憶が長く持つようになったカードです。',
    settings: '1日の新規の数や、復習の上限、見た目を変えられます。迷ったら、そのままで大丈夫です。この吹き出しを出したくないときは、「ヒント」をオフにしてください。'
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

  // 案内役の名前。成長カロが最終段階に届くまでは伏せる（案内役の絵が最終段階の姿なので、名前で正体が分からないように）
  function guideName() {
    return (parseInt(lsGet(KEY_STAGE) || '0', 10) || 0) >= STAGES.length ? 'カロ' : '？？？';
  }

  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 案内役のHTML。opts.inline=true のときは、画面の流れの中に1行で置く（採点画面用）。
  // 隅に固定する場合は、ナビの上・右下に置く。
  function html(id, opts) {
    if (!enabled() || !HINTS[id]) return '';
    const inline = !!(opts && opts.inline);
    return '<div class="vf-karo ' + (inline ? 'vf-karo-inline' : 'vf-karo-corner') + '" data-karo="' + id + '">' +
      '<div class="vf-karo-bubble" role="status" hidden>' +
        '<button type="button" class="vf-karo-close" aria-label="閉じる"><i class="fas fa-xmark"></i></button>' +
        '<div class="vf-karo-name">' + guideName() + '</div>' +
        '<div class="vf-karo-text">' + esc(HINTS[id]) + '</div>' +
      '</div>' +
      '<button type="button" class="vf-karo-btn" aria-label="ヒント" aria-expanded="false">' +
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
    bindGrowth(root);
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

  // ====== 成長するカロ ======
  function stageOf(learned) {
    let n = 1;
    for (const st of STAGES) if (learned >= st.at) n = st.n;
    return n;
  }
  // 現在の段階・次の段階までの進み具合
  function growthInfo(learned) {
    learned = Math.max(0, Math.floor(Number(learned) || 0));
    const n = stageOf(learned);
    const cur = STAGES[n - 1], next = STAGES[n] || null;
    return {
      learned, n, cur, next,
      remain: next ? next.at - learned : 0,
      ratio: next ? Math.min(1, (learned - cur.at) / (next.at - cur.at)) : 1
    };
  }

  // ホームのカード。タップで詳しい画面（モーダル）を開く
  function growthHtml(learned) {
    const g = growthInfo(learned);
    return '<button type="button" data-karo-grow data-learned="' + g.learned + '" ' +
      'class="w-full text-left bg-slate-900 rounded-2xl p-3 mb-5 border border-slate-800 flex items-center gap-3 active:scale-[0.99] transition">' +
        '<span class="vf-karo-paper w-16 h-16 shrink-0"><img src="' + stageImg(g.n) + '" alt="" loading="lazy" draggable="false"></span>' +
        '<span class="min-w-0 flex-1">' +
          '<span class="flex items-baseline gap-2"><span class="font-bold text-sm">カロ</span>' +
          '<span class="text-[11px] text-slate-400">段階 ' + g.n + '/5 ・ ' + esc(g.cur.name) + '</span></span>' +
          '<span class="block mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden"><span class="block h-full bg-brand" style="width:' + Math.round(g.ratio * 100) + '%"></span></span>' +
          '<span class="block text-[11px] text-slate-400 mt-1">' +
            (g.next ? '次の段階まで あと ' + g.remain + '語' : '最終段階です') + '</span>' +
        '</span>' +
        '<i class="fas fa-chevron-right text-slate-500 text-xs"></i></button>';
  }

  // 段階の一覧（到達した段階は絵、まだの段階は鍵と必要な語数。先の絵は見せない）
  function stepsHtml(g) {
    return '<div class="flex justify-between gap-1.5 mt-4">' + STAGES.map(st => {
      const reached = st.n <= g.n;
      return '<div class="flex-1 text-center">' +
        (reached
          ? '<span class="vf-karo-paper w-full h-12 ' + (st.n === g.n ? 'vf-karo-paper-now' : '') + '"><img src="' + stageImg(st.n) + '" alt="段階' + st.n + '" loading="lazy" draggable="false"></span>'
          : '<span class="vf-karo-paper vf-karo-paper-lock w-full h-12"><i class="fas fa-lock text-[11px]"></i></span>') +
        '<div class="text-[10px] mt-1 ' + (reached ? 'text-slate-300' : 'text-slate-500') + '">' + st.at + '語</div></div>';
    }).join('') + '</div>';
  }

  function closeGrowth() { const m = document.getElementById('vf-karo-modal'); if (m) m.remove(); }

  // up=true のときは「成長しました！」の見出しにする
  function openGrowth(learned, up) {
    closeGrowth();
    const g = growthInfo(learned);
    const title = up ? 'カロが成長しました！' : 'カロの成長';
    const html =
      '<div id="vf-karo-modal" class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">' +
        '<div class="bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 max-h-[92vh] overflow-y-auto">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<div class="text-lg font-extrabold">' + title + '</div>' +
            '<button type="button" data-karo-modal-close class="text-slate-400 p-1" aria-label="閉じる"><i class="fas fa-xmark text-xl"></i></button></div>' +
          '<div class="vf-karo-paper mx-auto" style="width:min(80%,300px);height:min(52vh,340px)"><img src="' + stageImg(g.n) + '" alt="' + esc(g.cur.name) + '" draggable="false"></div>' +
          '<div class="text-center mt-3"><span class="text-xs text-slate-400">段階 ' + g.n + '/5</span>' +
            '<div class="font-bold">' + esc(g.cur.name) + '</div></div>' +
          '<div class="vf-karo-bubble vf-karo-bubble-static mt-3" style="width:auto">' +
            '<div class="vf-karo-name">カロ</div><div class="vf-karo-text" style="text-align:left">' + esc(g.cur.line) + '</div></div>' +
          '<div class="mt-4 text-xs text-slate-400 text-center">学習済み ' + g.learned + '語' +
            (g.next ? ' ・ 次の段階まで あと ' + g.remain + '語' : ' ・ 最終段階') + '</div>' +
          '<div class="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-brand" style="width:' + Math.round(g.ratio * 100) + '%"></div></div>' +
          stepsHtml(g) +
        '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    const m = document.getElementById('vf-karo-modal');
    m.onclick = e => { if (e.target === m || e.target.closest('[data-karo-modal-close]')) closeGrowth(); };
  }

  // 段階が上がっていれば、その段階を返す（初めて見る端末では、記録するだけで祝わない）
  function checkStageUp(learned) {
    const cur = stageOf(learned);
    const prev = parseInt(lsGet(KEY_STAGE) || '0', 10) || 0;
    if (cur !== prev) lsSet(KEY_STAGE, String(cur));
    return (prev && cur > prev) ? cur : 0;
  }

  function bindGrowth(root) {
    const el = (root || document).querySelector('[data-karo-grow]');
    if (!el || el._karoBound) return;
    el._karoBound = true;
    const learned = parseInt(el.getAttribute('data-learned'), 10) || 0;
    el.onclick = () => openGrowth(learned, false);
    if (checkStageUp(learned)) openGrowth(learned, true);
  }

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
        '<div class="vf-karo-name">' + guideName() + '</div>' +
        '<div class="text-lg font-extrabold">協力お願いします！</div>' +
      '</div>' +
      '<p class="text-sm text-slate-400 leading-relaxed mt-5">不便なところや、追加してほしい単語・熟語があれば、教えてください。いただいた意見は、今後の改良の参考にします。</p>' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" ' +
        'class="mt-6 w-full max-w-xs bg-brand hover:bg-brand-dark transition text-white font-bold rounded-2xl py-3.5 text-sm active:scale-[0.98]">' +
        '<i class="fas fa-envelope mr-2"></i>フォームを開く<i class="fas fa-arrow-up-right-from-square ml-2 text-xs opacity-80"></i></a>' +
      '<button data-go="home" class="mt-3 text-sm text-slate-400 py-2 px-4"><i class="fas fa-chevron-left mr-1 text-xs"></i>ホームへ戻る</button>' +
      VF.nav('home') + '</div>';
  };

  window.VFKaro = { html, bind, enabled, setEnabled, hints: HINTS, growthHtml, growthInfo, stageOf, STAGES };
})();
