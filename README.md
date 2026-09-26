# pokenae.Content

`pokenae.com` が公開する記事、ホーム画面設定、ツール情報、更新履歴の正本です。
公開サイトは既定ブランチ `main` のみを読み込み、作業ブランチは管理画面の
プレビュー用途に限定します。

## 構成

- `content/posts/<slug>/index.md`: 記事と同一ディレクトリの画像
- `content/tools/*.json`: ツール掲載情報
- `content/home/*.json`: バナー、告知、SNS
- `content/updates/*.json`: INFO に表示する公開変更履歴
- `schemas/*.schema.json`: 公開データ契約
- `fixtures/`: 最小の表示・CI fixture
- `scripts/`: 検証・移行スクリプト

## Docker で検証

```powershell
docker compose run --rm validate
```

ローカル Node.js を使う場合は `npm ci && npm run check` です。

## 更新フロー

1. `content/<slug>-<timestamp>` 形式のブランチを作る。
2. 記事・設定と、対応する `content/updates/<change-id>.json` を同じ PR に含める。
3. INFO に載せない軽微な変更は PR 本文へ `Content-Update: skip` と理由を記載する。
4. CI 成功後にレビューを受け、`main` へマージする。

管理画面は GitHub App installation token をサーバー側だけで発行し、branch と
PR を作成します。GitHub App の登録・秘密鍵発行・installation は GitHub 上での
手動操作が必要です。権限は **Contents: Read and write**、**Pull requests:
Read and write**、**Metadata: Read-only** のみにしてください。Webhook 権限は
不要です。App ID、Installation ID、秘密鍵をこのリポジトリへ保存しないでください。

## 保護設定

`main` は PR 必須、`validate` status check 必須、会話解決必須、force push と
削除禁止を推奨します。管理画面も直接 push せず PR を経由します。

## 画像移行

旧サイトから取得でき、移行元で利用されていた画像だけを格納しています。
取得不能または権利を確認できない素材は代替画像を作らず
`reports/image-migration.json` の生成結果で確認します。

記事の `legacyUrl` は移行元ページが存在する場合だけ指定する任意項目です。
記事画像は `content/posts/<slug>/images/` に配置し、frontmatter と Markdown
からは `./images/<file>` の相対パスで参照します。外部画像 URL は利用できません。
