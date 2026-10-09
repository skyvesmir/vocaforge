# セキュリティポリシー / Security Policy

## サポート対象

`main` ブランチの最新版（公開しているデモサイトを含む）だけを対象にしています。古い版への修正は行いません。

## 脆弱性の報告

脆弱性を見つけたら、**公開の Issue には書かないでください。** 次のどちらかで、非公開で知らせてください。

1. **GitHub の非公開報告を使う（推奨）。** このリポジトリの「Security」タブから、「Report a vulnerability」を選びます。
2. 上が使えないときは、Issue に「セキュリティについて連絡したい」とだけ書いてください。**脆弱性の内容は書かないでください。** メンテナーが連絡方法を返信します。

報告には、次のことを書いてもらえると助かります。

- どこで、何が起きるか（URL やファイル名）
- 再現の手順
- 起きうる影響

## 対応について

個人で開発しているため、返信や修正に時間がかかることがあります。確認できしだい返信し、修正を検討します。修正したあとで、必要に応じて内容を公開します。

## 対象範囲

- **対象:** このリポジトリのコード、設定、公開しているデモサイト
- **対象外:** Cloudflare、Supabase、Google など、利用している外部サービス自体の脆弱性（各サービスの窓口へ報告してください）

リポジトリに、公開してはいけない秘密情報（鍵やパスワードなど）が含まれているのを見つけたときも、同じ方法で知らせてください。

---

## English summary

Only the latest version on `main` (including the live demo) is supported.

Please do **not** report vulnerabilities in public issues. Use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability"). If that is unavailable, open an issue saying only that you want to contact the maintainer about a security matter (no details), and the maintainer will reply with a way to reach them.

This is a one-person project, so responses may take some time. Vulnerabilities in third-party services (Cloudflare, Supabase, Google) should be reported to those services.
