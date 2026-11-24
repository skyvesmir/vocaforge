// 勉強時間（public/static/study-timer.js と store.js の studyMs）の単体テスト。
//   node scripts/test-study-timer.mjs
// ブラウザ無しで動く。計算の本体 createCounter と、Store の保存・合体・集計を確かめる。
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../public/static/' + p, import.meta.url), 'utf8');

function makeWindow() {
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  };
  const win = { localStorage, console };
  win.window = win;
  const ctx = vm.createContext(Object.assign(win, { localStorage, console, Date, Math, JSON, Object }));
  return { win, ctx };
}

const { win, ctx } = makeWindow();
// store.js は localStorage をグローバルとして使う
vm.runInContext(read('fsrs.js'), ctx);
vm.runInContext(read('store.js'), ctx);
vm.runInContext(read('study-timer.js'), ctx);   // document が無いので計算部分だけ登録される
const { Store, VFStudyTime } = win;
assert.ok(Store && VFStudyTime, '読み込めた');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const S = 1000;

// ---------- 計算の本体 ----------
test('解いている間は、操作が続けば全部数える', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0);
  for (let t = 10 * S; t <= 60 * S; t += 10 * S) { c.activity(t); c.tick(t); }
  assert.equal(c.take(), 60 * S);
});

test('操作が止まったら、最後の操作から30秒まで数えて、あとは数えない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0);
  c.tick(300 * S);                       // 5分ずっと放置
  assert.equal(c.take(), 30 * S);
  c.tick(600 * S);
  assert.equal(c.take(), 0);             // まだ操作が無いので増えない
});

test('放置のあとの操作で、空いた分を数えず再開する', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0);
  c.activity(100 * S);                   // 100秒空けて操作 → 30秒だけ数える
  assert.equal(c.take(), 30 * S);
  c.tick(110 * S);
  assert.equal(c.take(), 10 * S);        // ここからまた数える
});

test('解く画面でない間（ホームなど）は数えない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, false); c.activity(0);
  c.tick(20 * S);
  assert.equal(c.take(), 0);
  c.setStudying(20 * S, true);           // 入った時点から数え始める（さかのぼらない）
  c.tick(25 * S);
  assert.equal(c.take(), 5 * S);
});

test('解く画面を出た瞬間までを数える', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0); c.activity(10 * S);
  c.setStudying(15 * S, false);
  assert.equal(c.take(), 15 * S);
  c.tick(60 * S);
  assert.equal(c.take(), 0);
});

test('画面を離れたら止まり、戻っても離れていた間は数えない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0); c.activity(10 * S);
  c.pause(12 * S);                       // 離れた
  assert.equal(c.take(), 12 * S);
  c.tick(500 * S);
  assert.equal(c.take(), 0);
  assert.equal(c.awayMs(500 * S), 488 * S);
  c.resume(500 * S);
  c.tick(505 * S);
  assert.equal(c.take(), 5 * S);
});

test('離れている間の操作（ウィンドウ上のタップ）は数えない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0);
  c.pause(5 * S); c.take();
  c.activity(20 * S); c.tick(25 * S);
  assert.equal(c.take(), 0);
});

test('「離れている間も勉強していた」は上限30分で足す', () => {
  const c = VFStudyTime.createCounter();
  assert.equal(c.addAway(10 * 60 * S), 10 * 60 * S);
  assert.equal(c.addAway(45 * 60 * S), 30 * 60 * S);
  assert.equal(c.addAway(-5), 0);
  assert.equal(c.take(), 40 * 60 * S);
});

test('すでに離れているときの pause は離れた時刻を動かさない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(0, true); c.activity(0);
  c.pause(5 * S); c.pause(50 * S);
  assert.equal(c.awayMs(65 * S), 60 * S);
});

test('時計が戻っても、数えが減ったり壊れたりしない', () => {
  const c = VFStudyTime.createCounter();
  c.setStudying(100 * S, true); c.activity(100 * S);
  c.tick(110 * S);
  c.tick(50 * S);                        // 時計が戻った
  c.tick(120 * S);
  assert.equal(c.take(), 20 * S);
});

test('表示の長さ', () => {
  const f = VFStudyTime.fmtDur;
  assert.equal(f(0), '0秒');
  assert.equal(f(45 * S), '45秒');
  assert.equal(f(90 * S), '1分');        // 1分未満の端数は切り捨て
  assert.equal(f(59 * 60 * S), '59分');
  assert.equal(f(60 * 60 * S), '1時間');
  assert.equal(f(65 * 60 * S), '1時間5分');
  assert.equal(VFStudyTime.fmtAway(185 * S), '3分5秒');
});

// ---------- Store（日次記録の studyMs）----------
const T0 = new Date('2026-11-24T10:00:00+09:00').getTime();

test('addStudyMs は同じ日に足し込まれ、getStudyMs で読める', () => {
  Store.addStudyMs(60 * S, T0);
  Store.addStudyMs(30 * S, T0 + 5 * 60 * S);
  assert.equal(Store.getStudyMs(T0), 90 * S);
  assert.equal(Store.getDaily(T0).studyMs, 90 * S);
});

test('0以下・数値でない値は無視する', () => {
  Store.addStudyMs(0, T0); Store.addStudyMs(-5, T0); Store.addStudyMs(NaN, T0); Store.addStudyMs('x', T0);
  assert.equal(Store.getStudyMs(T0), 90 * S);
});

test('日付が変われば別の日に付く（日付の区切りは0時）', () => {
  const late = new Date('2026-11-24T23:59:30+09:00').getTime();
  const next = new Date('2026-11-25T00:00:30+09:00').getTime();
  Store.addStudyMs(20 * S, late);
  Store.addStudyMs(40 * S, next);
  assert.equal(Store.getStudyMs(late), 110 * S);
  assert.equal(Store.getStudyMs(next), 40 * S);
});

test('直近7日の合計は、今日を含む7日分', () => {
  const d = (n) => T0 - n * 86400000;
  Store.addStudyMs(1000, d(6));    // 7日目（含む）
  Store.addStudyMs(2000, d(7));    // 8日目（含まない）
  const week = Store.getStudyMsRecent(7, new Date('2026-11-25T12:00:00+09:00').getTime());
  // 基準日 11/25 から7日 = 11/19〜11/25。11/25(40s) + 11/24(110s) が入り、11/18 の分は入らない
  assert.equal(week, 150 * S);
  // 基準日 11/24 から7日 = 11/18〜11/24。6日前(11/18)の 1000ms は入り、7日前(11/17)の 2000ms は入らない
  assert.equal(Store.getStudyMsRecent(7, T0), 110 * S + 1000);
});

test('旧レコード（studyMs が無い）は 0 として読める', () => {
  const raw = Store.getDailyRaw();
  raw['2026-01-01'] = { new: 3, review: 4 };
  win.localStorage.setItem('vocaforge:daily', JSON.stringify(raw));
  assert.equal(Store.getDailyHistory()['2026-01-01'].studyMs, 0);
});

test('端末間の合体は「大きい方」（足し算しない）', () => {
  const m = Store.mergeDailyRecord({ studyMs: 100 * S, new: 1 }, { studyMs: 70 * S, new: 2 });
  assert.equal(m.studyMs, 100 * S);
  assert.equal(m.new, 2);
  assert.equal(Store.mergeDailyRecord({ new: 1 }, { studyMs: 5 * S }).studyMs, 5 * S);
});

test('クラウドの日次行との合体でも studyMs が残る', () => {
  const r = Store.mergeDailyStatsRows({ '2026-11-24': { studyMs: 999 * S, new: 0, review: 0 } });
  assert.ok(r.days >= 1);
  assert.equal(Store.getStudyMs(T0), 999 * S);
});

test('既定の設定: 戻ったときに聞かない', () => {
  assert.equal(Store.getSettings().studyTimeAskOnReturn, false);
  Store.setSettings({ studyTimeAskOnReturn: true });
  assert.equal(Store.getSettings().studyTimeAskOnReturn, true);
});

console.log('\n' + n + ' 件すべて成功');
