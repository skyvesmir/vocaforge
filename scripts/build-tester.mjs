// テスター版ビルド: 通常の vite build のあとに dist/static/config.js を
// 「クラウド接続なし」の設定へ差し替える。
//   npm run build:tester
// 本番ビルド（npm run build）には一切影響しない。ソースの config.js も触らない。
// supabase-auth.js は SUPABASE_URL/KEY が空だと client を作らず「ローカルのみ」で動く。
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

execSync('npx vite build', { stdio: 'inherit' });

const target = 'dist/static/config.js';
if (!existsSync('dist/static')) {
  console.error('dist/static が見つかりません。vite build が失敗した可能性があります。');
  process.exit(1);
}
writeFileSync(target,
`/* テスター版: scripts/build-tester.mjs が生成。クラウド同期・ログインなし（学習データはこの端末だけに保存）。 */
window.VF_CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', TESTER: true };
`);
console.log('テスター版: ' + target + ' をクラウド接続なしの設定に差し替えました');
