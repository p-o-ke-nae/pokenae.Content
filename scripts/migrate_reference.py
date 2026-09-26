from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import openpyxl
from bs4 import BeautifulSoup
from markdownify import markdownify


def scalar(value):
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def rows(sheet):
    values = list(sheet.values)
    return {
        "headers": [scalar(value) for value in values[0]],
        "rows": [[scalar(value) for value in row] for row in values[1:]],
    }


def copy_article_image(source: Path, destination: Path, name: str) -> str:
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / name
    shutil.copy2(source, target)
    return f"./images/{name}"


def migrate_blog(reference: Path, output: Path) -> None:
    source = reference / "blog" / "32.html"
    soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
    article = soup.select_one(".pokenae_explain")
    replacements = {}
    for image in article.select("img"):
        old = image.get("src", "")
        source_image = (source.parent / old).resolve()
        name = re.sub(r"[^a-z0-9.-]+", "-", source_image.name.lower()).strip("-")
        new = copy_article_image(source_image, output / "images", name)
        replacements[old] = new
        image["src"] = new
        image["alt"] = image.get("alt") or "操作画面"
    for link in article.select("a"):
        href = link.get("href", "")
        mapping = {
            "../tool/7.html": "/tools/blink-observer-tool",
            "../tool/30.html": "/tools/blink-observer-tool",
            "../tool/29.html": "/tools/blink-observer-tool",
            "../tool/31.html": "/tools/blink-observer-tool",
        }
        if href in mapping:
            link["href"] = mapping[href]
    body = markdownify(str(article), heading_style="ATX").strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    body = body.replace("p.o.ke.nae.tooldev@gmail.com", "<p.o.ke.nae.tooldev@gmail.com>")
    frontmatter = """---
slug: iv-identification-with-automatic-recognition
title: 自動認識対応個体値特定ツールでポケモンの個体値を判定する
summary: 野生ポケモンを倒して経験値を得ながら、自動認識対応ツールで個体値を特定する手順を紹介します。
publishedAt: "2024-03-24T11:04:43Z"
updatedAt: "2024-03-24T11:04:43Z"
status: published
category: blog
tags:
  - pokemon
  - individual-values
  - recognition
  - tool
relatedTags:
  - automation
  - rta
priority: 80
thumbnail: "./images/ivtool32-1.png"
legacyUrl: "https://ozaroom.com/tool/32.html"
changeNote: 旧サイトのブログ32をMarkdownへ移行
showInPickup: true
---

"""
    output.mkdir(parents=True, exist_ok=True)
    (output / "index.md").write_text(frontmatter + body + "\n", encoding="utf-8")


def download_image(item):
    url, target = item
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "pokenae-content-migration/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("response is not PNG")
        target.write_bytes(data)
        return {"url": url, "path": str(target), "status": "downloaded"}
    except (OSError, ValueError, urllib.error.URLError) as error:
        return {"url": url, "path": str(target), "status": "failed", "error": str(error)}


def migrate_showcase(reference: Path, output: Path, report: Path) -> None:
    workbook_path = reference / "参考" / "【CollectionAssistanceTool】第4世代全国図鑑.xlsx"
    workbook = openpyxl.load_workbook(workbook_path, data_only=True, read_only=True)
    column = rows(workbook["Column"])
    record = rows(workbook["Record"])
    statuses = rows(workbook["M_STATUS"])
    if len(record["rows"]) != 493:
        raise ValueError(f"Record count must be 493, got {len(record['rows'])}")

    output.mkdir(parents=True, exist_ok=True)
    image_dir = output / "images"
    image_dir.mkdir(exist_ok=True)
    image_index = record["headers"].index("画像リンク")
    downloads = []
    for row in record["rows"]:
        url = row[image_index]
        identifier = int(row[0])
        target = image_dir / f"pokemon-home-icon-{identifier}.png"
        downloads.append((url, target))
        row[image_index] = f"./images/{target.name}"
        row.append(url)
    record["headers"].append("sourceImageUrl")
    with ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(download_image, downloads))

    data = {
        "source": workbook_path.name,
        "recordCount": len(record["rows"]),
        "columns": [
            dict(zip(column["headers"], row, strict=False)) for row in column["rows"]
        ],
        "recordHeaders": record["headers"],
        "records": record["rows"],
        "statusHeaders": statuses["headers"],
        "statuses": statuses["rows"],
    }
    (output / "collection-dex.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    article = """---
slug: gen4-national-pokedex
title: 第四世代全国図鑑埋め
summary: 第四世代の全国図鑑493件を地方、収集状態、ボックス位置とともに確認できるショーケースです。
publishedAt: "2024-03-14T11:14:22Z"
updatedAt: "2024-03-14T11:14:22Z"
status: published
category: showcase
tags:
  - pokemon
  - generation-4
  - collection
relatedTags:
  - tool
priority: 90
thumbnail: "./images/pokemon-home-icon-1.png"
legacyUrl: "https://ozaroom.com/showcase/25.html"
changeNote: 旧ショーケース25と図鑑XLSXを記事・JSONへ移行
showInPickup: true
embed:
  component: CollectionDex
  data: "./collection-dex.json"
---

クリックまたはキーボード操作で各ポケモンの情報を確認できます。
地方フィルター、収集件数、状態色、ボックス位置は移行元データを保持しています。

図鑑は493件です。表示には許可済み埋め込みコンポーネント `CollectionDex` を使用し、
任意のスクリプトやコンポーネントは実行しません。
"""
    (output / "index.md").write_text(article, encoding="utf-8")
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        json.dumps(
            {
                "attempted": len(results),
                "downloaded": sum(item["status"] == "downloaded" for item in results),
                "failed": [item for item in results if item["status"] == "failed"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("content/posts"))
    parser.add_argument("--report", type=Path, default=Path("reports/image-migration.json"))
    args = parser.parse_args()
    migrate_blog(args.reference, args.output / "iv-identification-with-automatic-recognition")
    migrate_showcase(args.reference, args.output / "gen4-national-pokedex", args.report)


if __name__ == "__main__":
    main()
