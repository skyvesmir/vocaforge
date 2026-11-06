/* 出題生成・採点ロジック
 * 4形式:
 *   mc-ej : 多肢選択 英→日（英語を見て日本語訳を選ぶ）
 *   mc-je : 多肢選択 日→英（日本語を見て英語を選ぶ）
 *   type-je: 記入 日→英（日本語を見て英語をタイプ）
 *   cloze  : 記入 例文穴埋め（例文中の出題語を空欄化してタイプ）※復習カード用
 * カードの素材: {id, prompt(英), answer(英 or 表記), meaning(日)} に正規化済み
 */
(function (global) {
  'use strict';

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 日本語訳から代表的な短い意味を1つ抽出（選択肢の見やすさ用）
  function shortMeaning(m) {
    if (!m) return '';
    // 全部バージョンの複数品詞形式「【名】…<br>【動】…」は最初の品詞の意味を使う
    let s = m.split(/<br\s*\/?>/i)[0].replace(/【[^】]*】/g, '');
    // 区切り（；、，/）で分割し最初の塊
    s = s.split(/[；;]/)[0];
    s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
    s = s.split(/[、,]/)[0].trim();
    return s || m;
  }

  // 入力正規化（記入採点用）
  // 括弧は「中身を残して記号のみ除去」する（有無両形の生成は acceptableAnswers 側で行う）
  // ハイフン: 語の途中のもの（clean-cut, mother-in-law）は残す。ハイフンを打たない答え
  //   （clean cut, cleancut）は不正解にする。接頭辞・接尾辞の端のもの（spec-, -tion）は
  //   従来どおり無視する。種類の違うハイフン（‐ ‑ ‒ – − －）は ASCII の - にそろえる。
  function normalize(s) {
    return (s || '').toLowerCase()
      .replace(/[～~]/g, '')
      .replace(/[()（）]/g, '')
      .replace(/[‐‑‒–−－]/g, '-')
      .replace(/[.．,，!！?？:：;；'’"”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(^| )-+/g, '$1')
      .replace(/-+(?= |$)/g, '');
  }

  // 許容解答の組合せ爆発を防ぐ上限
  const MAX_VARIANTS = 64;

  // 括弧グループを「中身を残す」「丸ごと除去」の両形に展開
  // 例: "on occasion(s)" → ["on occasions", "on occasion"]
  //     "(every) once in a while" → ["every once in a while", "once in a while"]
  function expandParens(s) {
    const m = s.match(/[(（]([^()（）]*)[)）]/);
    if (!m) return [s];
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);
    const out = [];
    for (const rest of expandParens(after)) {
      out.push(before + m[1] + rest); // 中身を残す
      out.push(before + rest);        // グループごと除去
      if (out.length >= MAX_VARIANTS) break;
    }
    return out;
  }

  // スラッシュ区切りの選択肢をトークン単位で全展開（3択以上・複数箇所も対応）
  // 例: "look back on/upon/to" → ["look back on", "look back upon", "look back to"]
  function expandSlashes(s) {
    const tokens = s.split(/\s+/).filter(Boolean);
    let variants = [''];
    for (const tok of tokens) {
      const alts = tok.includes('/') ? tok.split('/').filter(Boolean) : [tok];
      const next = [];
      for (const v of variants) {
        for (const a of (alts.length ? alts : [tok])) {
          next.push(v ? v + ' ' + a : a);
          if (next.length >= MAX_VARIANTS) break;
        }
        if (next.length >= MAX_VARIANTS) break;
      }
      variants = next;
    }
    return variants;
  }

  // 英語の許容解答リストを作る（熟語の「(～)」「(s)」「A/B/C」等を考慮）
  function acceptableAnswers(term) {
    const base = (term || '').trim();
    const set = new Set([base]);
    for (const p of expandParens(base)) {
      for (const v of expandSlashes(p)) {
        set.add(v);
        if (set.size >= MAX_VARIANTS) break;
      }
      if (set.size >= MAX_VARIANTS) break;
    }
    return Array.from(set);
  }

  // ====== 例文クローズ（穴埋め） ======
  // 主要な不規則変化（動詞の過去形/過去分詞・名詞の不規則複数）。
  // 原形 → 追加で許容する形。規則変化は inflections() が生成する。
  const IRREGULAR = {
    be: ['am','is','are','was','were','been','being'],
    have: ['has','had','having'], do: ['does','did','done'],
    go: ['went','gone'], get: ['got','gotten'], take: ['took','taken'],
    make: ['made'], come: ['came'], see: ['saw','seen'], know: ['knew','known'],
    give: ['gave','given'], find: ['found'], think: ['thought'], say: ['said'],
    tell: ['told'], become: ['became'], show: ['showed','shown'], leave: ['left'],
    feel: ['felt'], put: ['put'], bring: ['brought'], begin: ['began','begun'],
    keep: ['kept'], hold: ['held'], write: ['wrote','written'], stand: ['stood'],
    hear: ['heard'], let: ['let'], mean: ['meant'], set: ['set'], meet: ['met'],
    run: ['ran'], pay: ['paid'], sit: ['sat'], speak: ['spoke','spoken'],
    lie: ['lay','lain'], lay: ['laid'], lead: ['led'], read: ['read'],
    grow: ['grew','grown'], lose: ['lost'], fall: ['fell','fallen'],
    send: ['sent'], build: ['built'], understand: ['understood'],
    draw: ['drew','drawn'], break: ['broke','broken'], spend: ['spent'],
    cut: ['cut'], rise: ['rose','risen'], drive: ['drove','driven'],
    buy: ['bought'], wear: ['wore','worn'], choose: ['chose','chosen'],
    mistake: ['mistook','mistaken'], seek: ['sought'], throw: ['threw','thrown'], catch: ['caught'],
    deal: ['dealt'], win: ['won'], forget: ['forgot','forgotten'],
    fight: ['fought'], teach: ['taught'], eat: ['ate','eaten'],
    sell: ['sold'], strike: ['struck'], fly: ['flew','flown'],
    hide: ['hid','hidden'], shake: ['shook','shaken'], bear: ['bore','borne','born'],
    hit: ['hit'], cost: ['cost'], hurt: ['hurt'], shut: ['shut'], quit: ['quit'],
    swear: ['swore','sworn'], tear: ['tore','torn'], steal: ['stole','stolen'],
    freeze: ['froze','frozen'], forbid: ['forbade','forbidden'],
    arise: ['arose','arisen'], undergo: ['underwent','undergone'],
    overcome: ['overcame'], withdraw: ['withdrew','withdrawn'],
    sing: ['sang','sung'], ring: ['rang','rung'], sink: ['sank','sunk'],
    swim: ['swam','swum'], blow: ['blew','blown'], bend: ['bent'],
    lend: ['lent'], shoot: ['shot'], feed: ['fed'], bind: ['bound'],
    hang: ['hung'], stick: ['stuck'], swing: ['swung'], spring: ['sprang','sprung'],
    burst: ['burst'], spread: ['spread'], cast: ['cast'], shed: ['shed'],
    drink: ['drank','drunk'], sleep: ['slept'], bite: ['bit','bitten'], tie: ['tying'], die: ['dying'],
        child: ['children'], man: ['men'], woman: ['women'], foot: ['feet'],
    tooth: ['teeth'], mouse: ['mice'], person: ['people'],
    criterion: ['criteria'], phenomenon: ['phenomena'], analysis: ['analyses'],
    crisis: ['crises'], hypothesis: ['hypotheses'], medium: ['media'],
    datum: ['data'], stimulus: ['stimuli'], fungus: ['fungi']
  };

  // 単語の活用形を列挙（完全一致ベースで誤ブランク化を防ぐ。creative≠create）
  function inflections(w) {
    w = w.toLowerCase();
    const out = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing']);
    if (IRREGULAR[w]) IRREGULAR[w].forEach(f => out.add(f));
    const last = w.slice(-1);
    if (last === 'e') out.add(w.slice(0, -1) + 'ing');            // make→making
    if (last === 'y') {
      out.add(w.slice(0, -1) + 'ies');                            // try→tries
      out.add(w.slice(0, -1) + 'ied');                            // try→tried
    }
    if (/[bcdfghjklmnpqrstvz]$/.test(w) && /[aeiou][bcdfghjklmnpqrstvz]$/.test(w)) {
      out.add(w + last + 'ed');                                   // stop→stopped
      out.add(w + last + 'ing');                                  // run→running
    }
    if (w.endsWith('f')) out.add(w.slice(0, -1) + 'ves');         // leaf→leaves
    if (w.endsWith('fe')) out.add(w.slice(0, -2) + 'ves');        // knife→knives
    return out;
  }

  /**
   * 例文から出題語をブランク化したクローズ問題素材を作る。
   * 語の活用形（-s/-ed/-ing 等）にも対応。多語熟語は各語の活用を許容して連続一致。
   * @returns {clozeText, surface} | null（例文中に語が見つからない場合）
   */
  const WILD_MAX = 5;                 // A/B が一致する最大語数
  const SENTENCE_BREAK = /[.!?;:]/;   // これをまたぐ語列は A/B とみなさない

  function makeCloze(term, example) {
    if (!term || !example) return null;
    // 例文中の英単語トークンと位置を列挙
    const tokens = [];
    const re = /[A-Za-z][A-Za-z']*/g;
    let m;
    while ((m = re.exec(example)) !== null) tokens.push({ t: m[0], i: m.index });
    if (!tokens.length) return null;

    // term の許容形（括弧・スラッシュ展開）それぞれで連続一致を探す
    // 1周目: 見出し語の語が例文で連続している形（従来どおり）。
    // 2周目: 1周目で見つからないときだけ、語と語の間に例文の語が最大2語入る形を許す
    // （"hear out" ↔ "Hear me out"、"make a difference" ↔ "make a real difference"）。
    // 入った語は、人や形容詞が変わっても正解にできるよう、A/B と同じワイルドカードとして採点する。
    for (const gapMax of [0, 2]) for (const variant of acceptableAnswers(term)) {
      // 熟語の目的語プレースホルダ「～」は先頭・末尾なら除去して照合
      // （例: "a piece of ～" → "a piece of"）。内部に残る場合は照合不可。
      // ハイフンでつながる語（clean-cut）は、例文側の単語分割に合わせて分けて照合する
      // 見出し語の「A」「B」「C」「D」（大文字1字。A's も同じ）は「何かの語句」を表すプレースホルダ。
      // 先頭・末尾にあるものは範囲が決まらないので「～」と同様に除去し、
      // 途中にあるものは例文中の1〜5語に一致するワイルドカードとして扱う。
      // （小文字の a は冠詞なので区別する。比較のため小文字化はここで行う）
      // one's / someone's / ～'s（所有格）も同じく「何かの語句」（my, his, her own など）。
      const isPh = w => /^([A-D](,|'s)?|one's|someone's|[～~]'s)$/.test(w);
      let raw = variant.replace(/[\u2019]/g, "'").split(/[\s-]+/).filter(Boolean);
      while (raw.length && (isPh(raw[0]) || /^[～~]+$/.test(raw[0]))) raw.shift();
      while (raw.length && (isPh(raw[raw.length - 1]) || /^[～~]+$/.test(raw[raw.length - 1]))) raw.pop();
      let words = raw.map(w => (isPh(w) ? w : w.toLowerCase()));
      // 末尾の動詞プレースホルダ「to do」「to doing」等は do/doing を除去して照合
      // （例: "be likely to do" → "be likely to"）。"make do" 等の実熟語を壊さないよう
      // 直前が to の場合のみ。oneself/others も同様のプレースホルダ扱い。
      if (words.length >= 3 && /^(do|doing)$/.test(words[words.length - 1]) && words[words.length - 2] === 'to')
        words.pop();
      while (words.length >= 2 && /^(oneself|others)$/.test(words[words.length - 1]))
        words.pop();
      if (!words.length || words.some(w => !isPh(w) && !/^[a-z][a-z']*$/.test(w))) continue;
      if (isPh(words[words.length - 1])) continue; // 末尾が to do の除去後にワイルドカードで終わる形は範囲が決まらない
      const els = words.map(w => (isPh(w) ? null : inflections(w))); // null = ワイルドカード
      // be動詞開始の熟語（be aware of 等）は、be の直後に副詞が挟まる形
      // （"is fully aware of"）を許容する（最大2語スキップ）。
      const allowSkipAfterBe = words[0] === 'be' && els.length >= 2 && els[1] !== null;
      // 例文の語列 tokens[ti..] に els[j..] を当てはめ、終了位置と採点用の型（pat）を返す。なければ null。
      // pat の null は「何かの語句（1〜5語）」。ワイルドカードと、2周目で入った語の分に付く
      const matchFrom = (j, ti) => {
        if (j === els.length) return { end: ti, pat: [] };
        if (els[j] === null) {
          for (let len = 1; len <= WILD_MAX && ti + len <= tokens.length; len++) {
            if (len > 1 && SENTENCE_BREAK.test(example.slice(tokens[ti + len - 2].i + tokens[ti + len - 2].t.length, tokens[ti + len - 1].i))) break;
            const r = matchFrom(j + 1, ti + len);
            if (r) return { end: r.end, pat: [null].concat(r.pat) };
          }
          return null;
        }
        const set = Array.from(els[j]).map(normalize);
        const beSkip = allowSkipAfterBe && j === 1;
        const maxSkip = beSkip ? 2 : ((gapMax && j >= 1 && els[j - 1] !== null) ? gapMax : 0);
        for (let skip = 0; skip <= maxSkip; skip++) {
          const k = ti + skip;
          if (k >= tokens.length) break;
          // 文の切れ目（. ! ? ; :）をまたぐ語は、間に入った語とみなさない
          if (skip > 0 && !beSkip && SENTENCE_BREAK.test(example.slice(tokens[ti - 1].i + tokens[ti - 1].t.length, tokens[k].i))) break;
          if (els[j].has(tokens[k].t.toLowerCase())) {
            const r = matchFrom(j + 1, k + 1);
            if (r) return { end: r.end, pat: (skip > 0 && !beSkip ? ['?'] : []).concat([set], r.pat) };
          }
        }
        return null;
      };
      for (let i = 0; i < tokens.length; i++) {
        const r = matchFrom(0, i);
        if (!r) continue;
        const start = tokens[i].i;
        const endTok = tokens[r.end - 1];
        const end = endTok.i + endTok.t.length;
        const surface = example.slice(start, end);
        const blank = '（　？　）';
        const res = { clozeText: example.slice(0, start) + blank + example.slice(end), surface };
        // ワイルドカード（や間に入った語）を含む場合は、その中身が違っても正解にできるよう採点用の型を添える
        if (r.pat.some(e => e === null || e === '?')) res.pattern = r.pat;
        return res;
      }
    }
    return null;
  }

  /**
   * 1枚のカードから問題を生成
   * @param card {id, term(英), meaning(日)}
   * @param format 'mc-ej'|'mc-je'|'type-je'|'cloze'
   * @param pool 同種カード配列（誤答生成元）
   */
  // 例文中の語が原形から変化しているときの注意（時制・形）。変化なし／判定不能なら ''
  function formNote(term, surface) {
    const base = (String(term).replace(/\(.*?\)/g, ' ').split(/[\s/]+/).filter(w => /^[a-z]+$/i.test(w))[0] || '').toLowerCase();
    const first = (String(surface).split(/[\s,]+/)[0] || '').toLowerCase().replace(/[^a-z']/g, '');
    if (!base || !first || first === base || base.length < 3) return '';
    if (!inflections(base).has(first)) return '';
    if (/ing$/.test(first)) return '-ing 形';
    if (first === base + 's' || first === base + 'es' || first === base.replace(/y$/, 'ies')) return '三単現（-s）';
    return '過去形・過去分詞';
  }

  function makeQuestion(card, format, pool) {
    // 語源カードはコア意味が他とかぶりやすい（例「場所」）ので、
    // 意味は短縮せずそのまま（派生併記）使い、識別性を保つ。
    const isEtym = card.deck === 'etym';
    const meaningLabel = m => (isEtym ? (m || '') : shortMeaning(m));

    if (format === 'type-je') {
      return {
        format,
        cardId: card.id,
        questionLabel: '日本語に合う英語を入力',
        prompt: card.meaning,
        // 語源カードのヒント(origin: 語源言語など)は答えが分かってしまうため表示しない
        sub: isEtym ? '' : (card.hint || ''),
        answer: card.term,
        acceptable: acceptableAnswers(card.term)
      };
    }

    if (format === 'cloze') {
      // 例文の穴埋め: 空欄に入る語（出題語の例文中の実際の形）をタイプさせる。
      // 採点は「例文中の表記そのまま」または「原形（term の許容形）」の両方を正解とする。
      const cz = makeCloze(card.term, card.example);
      if (!cz) return makeQuestion(card, 'type-je', pool); // フォールバック
      const acceptable = acceptableAnswers(card.term).concat([cz.surface]);
      return {
        format: 'cloze',
        cardId: card.id,
        questionLabel: '例文の空欄に入る英語を入力',
        prompt: cz.clozeText,
        promptJa: card.exampleJa || '',
        meaningHint: card.meaning,
        formNote: formNote(card.term, cz.surface),
        answer: cz.surface,
        term: card.term,
        acceptable,
        pattern: cz.pattern || null
      };
    }

    // 多肢選択: 誤答3つを同プールから抽出
    const distractors = shuffle(pool.filter(p => p.id !== card.id));
    const picked = [];
    const seen = new Set([card.term]);
    for (const d of distractors) {
      if (picked.length >= 3) break;
      const key = format === 'mc-ej' ? meaningLabel(d.meaning) : d.term;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(d);
    }

    if (format === 'mc-ej') {
      const correct = meaningLabel(card.meaning);
      const opts = shuffle([{ t: correct, correct: true, full: card.meaning }]
        .concat(picked.map(p => ({ t: meaningLabel(p.meaning), correct: false, full: p.meaning }))));
      return {
        format, cardId: card.id,
        questionLabel: '英語の意味を選択',
        prompt: card.term,
        options: opts,
        answer: correct,
        meaning: card.meaning
      };
    } else { // mc-je
      const opts = shuffle([{ t: card.term, correct: true }]
        .concat(picked.map(p => ({ t: p.term, correct: false }))));
      return {
        format, cardId: card.id,
        questionLabel: '日本語に合う英語を選択',
        prompt: meaningLabel(card.meaning),
        promptFull: card.meaning,
        options: opts,
        answer: card.term,
        meaning: card.meaning
      };
    }
  }

  // 記入採点
  function gradeTyped(input, q) {
    const ni = normalize(input);
    if (!ni) return false;
    if (q.acceptable.some(a => normalize(a) === ni)) return true;
    // A/B 入りの熟語の穴埋め: 固定部分が合っていれば、A/B の中身は何でもよい
    return !!(q.pattern && matchPattern(q.pattern, ni.split(/[\s-]+/).filter(Boolean)));
  }

  // pattern: [活用形の配列 | null(ワイルドカード), ...]。入力の語列 words 全体に一致するか
  function matchPattern(pattern, words) {
    const go = (j, ti) => {
      if (j === pattern.length) return ti === words.length;
      if (pattern[j] === null || pattern[j] === '?') {
        // '?' は2周目で見つけた「間に入る語」。無くても（0語でも）よい
        for (let len = pattern[j] === '?' ? 0 : 1; len <= WILD_MAX && ti + len <= words.length; len++)
          if (go(j + 1, ti + len)) return true;
        return false;
      }
      return ti < words.length && pattern[j].includes(words[ti]) && go(j + 1, ti + 1);
    };
    return go(0, 0);
  }

  // 編集距離（タイプミス許容ヒント用）
  function editDistance(a, b) {
    a = normalize(a); b = normalize(b);
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(new Array(b.length).fill(0)));
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  global.Quiz = { makeQuestion, gradeTyped, shortMeaning, normalize, shuffle, editDistance, acceptableAnswers, makeCloze };
})(window);
