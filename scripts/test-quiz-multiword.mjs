// 「/」が複数語の言い換えを表す熟語（quiz.js の MULTIWORD_ALTS）の記入採点テスト。
//   node scripts/test-quiz-multiword.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const win = {}; win.window = win; vm.createContext(win);
vm.runInContext(fs.readFileSync(new URL('../public/static/quiz.js', import.meta.url), 'utf8'), win);
const Q = win.Quiz;
const grade = (term, input) => Q.gradeTyped(input, Q.makeQuestion({ id: 'x', term, meaning: 'm' }, 'type-je', []));

let n = 0;
const ok = (term, input, want = true) => {
  assert.equal(grade(term, input), want, `${term} ← ${input}`);
  n++; console.log((want ? 'ok  ' : 'ng  ') + term + ' ← ' + input);
};

// 例: 「～」は採点で無視されるので、"as as possible" と打つ
ok('as ～ as possible/one can', 'as as possible');
ok('as ～ as possible/one can', 'as as one can');
ok('as ～ as possible/one can', 'as as possible can', false);   // 以前は誤って正解だった形
ok('at all cost(s)/any cost', 'at all cost');
ok('at all cost(s)/any cost', 'at all costs');
ok('at all cost(s)/any cost', 'at any cost');
ok('at all cost(s)/any cost', 'at all any cost', false);
ok("of one's own accord/free will", "of one's own accord");
ok("of one's own accord/free will", "of one's own free will");
ok("of one's own accord/free will", "of one's own accord will", false);
ok('in order/so as to do', 'in order to do');
ok('in order/so as to do', 'so as to do');
ok('in order/so as to do', 'in so as to do', false);

// 既存の語単位の言い換えは変わらない
ok('look back on/upon/to ～', 'look back upon');
ok('be based on/upon ～', 'be based on');
ok('as/so long as …', 'so long as');
ok('a piece of ～', 'a piece of');

console.log('\n' + n + ' 件すべて成功');
