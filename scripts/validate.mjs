import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import matter from "gray-matter";
import { lint as markdownlint } from "markdownlint/sync";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const walk = (directory, predicate) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(full, predicate)
      : predicate(full)
        ? [full]
        : [];
  });
};
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
});
addFormats(ajv);
const schemas = {
  post: readJson("schemas/post.schema.json"),
  tool: readJson("schemas/tool.schema.json"),
  home: readJson("schemas/home.schema.json"),
  update: readJson("schemas/update.schema.json")
};
const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)])
);
const validate = (kind, data, file) => {
  if (!validators[kind](data)) {
    errors.push(
      `${relative(file)}: ${ajv.errorsText(validators[kind].errors, {
        separator: "; "
      })}`
    );
  }
};

const tags = new Set(readJson("fixtures/tags.json"));
const postFiles = walk(path.join(root, "content", "posts"), (file) =>
  file.endsWith(`${path.sep}index.md`)
);
const slugs = new Set();
const publishedSlugs = new Set();
const markdownSources = {};

for (const file of postFiles) {
  const source = fs.readFileSync(file, "utf8");
  const parsed = matter(source);
  validate("post", parsed.data, file);
  const directorySlug = path.basename(path.dirname(file));
  if (parsed.data.slug !== directorySlug) {
    errors.push(`${relative(file)}: frontmatter slug must match directory`);
  }
  if (slugs.has(parsed.data.slug)) {
    errors.push(`${relative(file)}: duplicate slug ${parsed.data.slug}`);
  }
  slugs.add(parsed.data.slug);
  if (parsed.data.status === "published") publishedSlugs.add(parsed.data.slug);
  if (
    Date.parse(parsed.data.updatedAt) < Date.parse(parsed.data.publishedAt)
  ) {
    errors.push(`${relative(file)}: updatedAt precedes publishedAt`);
  }
  for (const tag of [...(parsed.data.tags ?? []), ...(parsed.data.relatedTags ?? [])]) {
    if (!tags.has(tag)) errors.push(`${relative(file)}: unknown tag ${tag}`);
  }
  if (parsed.data.thumbnail) {
    const image = path.resolve(path.dirname(file), parsed.data.thumbnail);
    if (!fs.existsSync(image)) {
      errors.push(`${relative(file)}: missing thumbnail ${parsed.data.thumbnail}`);
    }
  }
  if (parsed.data.embed?.data) {
    const data = path.resolve(path.dirname(file), parsed.data.embed.data);
    if (!fs.existsSync(data)) {
      errors.push(`${relative(file)}: missing embed data ${parsed.data.embed.data}`);
    }
  }
  for (const match of parsed.content.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^https?:/.test(match[1])) {
      errors.push(`${relative(file)}: external image reference ${match[1]}`);
    } else {
      const image = path.resolve(path.dirname(file), decodeURI(match[1]));
      if (!fs.existsSync(image)) {
        errors.push(`${relative(file)}: missing image ${match[1]}`);
      }
    }
  }
  markdownSources[relative(file)] = parsed.content;
}

for (const [file, source] of Object.entries(markdownSources)) {
  for (const match of source.matchAll(/\[[^\]]+]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    const blog = href.match(/^\/blog\/([a-z0-9-]+)(?:[#?].*)?$/);
    const tool = href.match(/^\/tools\/([a-z0-9-]+)(?:[#?].*)?$/);
    if (blog && !publishedSlugs.has(blog[1])) {
      errors.push(`${file}: missing published post link ${href}`);
    }
    if (tool && !fs.existsSync(path.join(root, "content", "tools", `${tool[1]}.json`))) {
      errors.push(`${file}: missing tool link ${href}`);
    }
  }
}

const lintResult = markdownlint({
  strings: markdownSources,
  config: {
    default: true,
    MD013: false,
    MD024: { siblings_only: true },
    MD033: false,
    MD041: false
  }
});
for (const issue of lintResult.toString().split("\n").filter(Boolean)) {
  errors.push(issue);
}

for (const file of walk(path.join(root, "content", "tools"), (f) => f.endsWith(".json"))) {
  validate("tool", JSON.parse(fs.readFileSync(file, "utf8")), file);
}
for (const file of ["content/home/banners.json", "content/home/announcements.json"]) {
  const data = readJson(file);
  const full = path.join(root, file);
  validate("home", data, full);
  for (const entry of data) {
    if (entry.image) {
      const image = path.resolve(path.dirname(full), entry.image);
      if (!fs.existsSync(image)) {
        errors.push(`${relative(full)}: missing image ${entry.image}`);
      }
    }
  }
}
for (const file of walk(path.join(root, "content", "updates"), (f) => f.endsWith(".json"))) {
  validate("update", JSON.parse(fs.readFileSync(file, "utf8")), file);
}

const navigationFile = path.join(root, "content", "navigation.json");
const navigation = readJson("content/navigation.json");
if (!Array.isArray(navigation.items) || !Array.isArray(navigation.social)) {
  errors.push(`${relative(navigationFile)}: items and social must be arrays`);
}
for (const entry of [...(navigation.items ?? []), ...(navigation.social ?? [])]) {
  if (!entry.label || !entry.href) {
    errors.push(`${relative(navigationFile)}: every entry needs label and href`);
  }
}

const dexFile = path.join(
  root,
  "content",
  "posts",
  "gen4-national-pokedex",
  "collection-dex.json"
);
if (fs.existsSync(dexFile)) {
  const dex = JSON.parse(fs.readFileSync(dexFile, "utf8"));
  if (dex.records?.length !== 493) {
    errors.push(`${relative(dexFile)}: expected 493 records`);
  }
  if (!Array.isArray(dex.columns) || !Array.isArray(dex.statuses)) {
    errors.push(`${relative(dexFile)}: columns and statuses are required`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Validated ${postFiles.length} posts, ${slugs.size} unique slugs, schemas, Markdown, links, images, dates, and tags.`
);
