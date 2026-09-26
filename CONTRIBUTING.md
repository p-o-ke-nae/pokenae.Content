# Contributing

## Pull request

- 公開データは feature branch で編集し、必ず PR を作成してください。
- `content/posts/<slug>/index.md` のディレクトリ名と frontmatter `slug` を一致させます。
- 公開内容の変更には `content/updates/*.json` を追加します。
- タグは `fixtures/tags.json` で定義された6桁ID（`000001`〜`999999`）だけを使用します。
- Webアプリ一覧は `content/apps/<slug>.json` と `schemas/app.schema.json` の契約に従います。
- INFO 掲載が不要な typo、整形、CI 修正だけの場合、PR 本文に
  `Content-Update: skip` と `Content-Update-Reason: <理由>` を記載します。
- `docker compose run --rm validate` を実行してから push します。

## GitHub App

管理画面用 App はこのリポジトリだけに install し、Repository permissions を
次に限定します。

| Permission | Access |
| --- | --- |
| Metadata | Read-only |
| Contents | Read and write |
| Pull requests | Read and write |

Issues、Actions、Administration、Secrets の権限は付与しません。秘密鍵と
installation token はブラウザへ返さず、pokenae.Web の server-only Route
Handler 内だけで扱います。
