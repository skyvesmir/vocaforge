# コントリビュートのしかた / Contributing

VocaForge に興味を持ってくれて、ありがとうございます。一人で、AIたちと、少しずつ作っているプロジェクトなので、気づいた点を教えてもらえるだけでも助かります。

参加する前に、[行動規範](CODE_OF_CONDUCT.md)を読んでください。

## 歓迎するもの

1. **語源データの誤りの指摘・修正・追記**（`public/static/data/etymology.json`）
   - 語源・原語の誤り、日本語訳・例単語の誤り
   - `confusion`（似た語根の区別）が空欄のカードへの追記
   - 語源欄が言語名だけのカードへの補足
2. **アプリのバグ報告と修正**
3. **ドキュメントの誤りの修正**

## 受け付けないもの

次のファイルを変更するプルリクエストは、受け付けていません。

- `public/static/data/` のうち、`etymology.json` 以外のファイル
- `vocab_work/` のファイル

これらの単語・熟語のデータは、作者の個人学習用に含めているもので、ライセンスの対象外です（詳しくは `README.md` の「データとライセンスについて」）。誤りに気づいたときは、Issue で知らせてください。

## まずは Issue から

- **語源データの修正案:** [Issue のテンプレート](https://github.com/skyvesmir/vocaforge/issues/new?template=etymology-fix.md)から送ってください。対象のカードID（例: `Root-007`）、現在の内容、提案する内容、根拠（任意）を書いてもらえると助かります。
- **バグ:** 再現手順、使っているブラウザと OS、画面の様子（できればスクリーンショット）を書いてください。
- **大きな変更（機能の追加など）:** 先に Issue で相談してください。方向が合わないと、せっかくの作業が無駄になってしまうためです。

## プルリクエストの出し方

1. リポジトリを fork して、作業用のブランチを作る。
2. 変更する。**1つのプルリクエストには、1つのテーマだけ**にしてください。
3. 手元で動作を確認する（下の「ローカルで動かす」）。
4. プルリクエストを作り、テンプレートの項目を書く。

### ローカルで動かす

Node.js 20.3 以上が必要です。

```bash
npm install
npm run dev      # 開発サーバー: http://localhost:5173
npm run build    # 本番ビルド（dist/ に出力）
```

このリポジトリには、自動テストは含まれていません。変更したら、画面を実際に動かして確認し、確認した内容をプルリクエストに書いてください。

## 語源データを直すときのルール

- **対象は `etymology.json` だけ**です。
- **カードのID（`Root-001` など）は変えないでください。** `etym_links.json` などが、IDで語源カードを参照しています。
- 既存のカードと**同じ項目・同じ書き方**に合わせてください。`origin` の中でバッククォートで囲んだ部分（`` `productive` `` など）は、内部用のメタ情報で、画面のヒントには出しません。むやみに足したり消したりしないでください。
- **文章は、自分の言葉で書いてください。** 辞書・参考書・Webサイトの文章を、そのまま写さないでください。根拠は、辞書名やURLで示してください。
- 修正したあとも、**正しい JSON** であることを確認してください。

  ```bash
  node -e "JSON.parse(require('node:fs').readFileSync('public/static/data/etymology.json','utf8')); console.log('ok')"
  ```

## 貢献した内容のライセンス

プルリクエストで提供された内容は、このリポジトリのライセンス（MIT。対象はソースコードと `etymology.json`）で提供されることに、同意したものとして扱います。

---

## English summary

Thanks for your interest! Contributions are welcome in three areas: (1) fixes and additions to the etymology data (`public/static/data/etymology.json`), (2) bug reports and fixes, and (3) documentation fixes.

- Please open an issue first (use the etymology-fix template for data corrections), and keep each pull request to a single topic.
- Pull requests that change the vocabulary or phrase datasets (other files under `public/static/data/`, and `vocab_work/`) are not accepted. They are included for the author's personal study and are not licensed for reuse.
- When editing etymology data: do not change card IDs, follow the existing format, write in your own words (do not copy text from dictionaries, textbooks, or websites), and make sure the JSON stays valid.
- Setup: Node.js 20.3+, `npm install`, `npm run dev` (http://localhost:5173), `npm run build`. There are no automated tests yet; please verify your change by hand and describe what you checked in the pull request.
- By contributing, you agree that your contribution is provided under the repository's MIT license (which covers the source code and `etymology.json`).
