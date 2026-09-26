import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD_ID = /^[0-9]{4}$/;
const NEW_ID = /^(?!000000)[0-9]{6}$/;

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

const collectTagReferences = (value, references = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectTagReferences(item, references);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "tags" || key === "relatedTags") {
        if (!Array.isArray(child)) throw new Error(`${key} must be an array`);
        references.push(...child);
      } else {
        collectTagReferences(child, references);
      }
    }
  }
  return references;
};

const migrateTagReferences = (value, mapping) => {
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (migrateTagReferences(item, mapping)) changed = true;
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "tags" || key === "relatedTags") {
        value[key] = child.map((id) => mapping.get(id) ?? id);
        if (value[key].some((id, index) => id !== child[index])) changed = true;
      } else if (migrateTagReferences(child, mapping)) {
        changed = true;
      }
    }
  }
  return changed;
};

export const buildMigration = ({ tagIds, labelIds, references }) => {
  if (!Array.isArray(tagIds)) throw new Error("fixtures/tags.json must be an array");
  if (new Set(tagIds).size !== tagIds.length) throw new Error("duplicate tag ID");
  if (tagIds.some((id) => typeof id !== "string" || (!OLD_ID.test(id) && !NEW_ID.test(id)))) {
    throw new Error("tag IDs must be four-digit input or valid six-digit IDs");
  }
  const formats = new Set(tagIds.map((id) => id.length));
  if (formats.size > 1) throw new Error("mixed four-digit and six-digit tag IDs");
  if (labelIds.some((id) => !tagIds.includes(id)) || tagIds.some((id) => !labelIds.includes(id))) {
    throw new Error("tag labels must exactly match tag IDs");
  }
  if (references.some((id) => typeof id !== "string")) {
    throw new Error("tag references must be strings");
  }
  const undefinedIds = [...new Set(references.filter((id) => !tagIds.includes(id)))];
  if (undefinedIds.length) throw new Error(`undefined tag references: ${undefinedIds.join(", ")}`);

  const mapping = new Map(tagIds.map((id) => [id, id.padStart(6, "0")]));
  return {
    mapping,
    migratedDefinitions: [...mapping].filter(([oldId, newId]) => oldId !== newId).length,
    migratedReferences: references.filter((id) => mapping.get(id) !== id).length
  };
};

export const runMigration = ({ root = defaultRoot, write = false } = {}) => {
  const tagsFile = path.join(root, "fixtures", "tags.json");
  const labelsFile = path.join(root, "fixtures", "tag-labels.json");
  const tagIds = JSON.parse(fs.readFileSync(tagsFile, "utf8"));
  const labels = JSON.parse(fs.readFileSync(labelsFile, "utf8"));
  const dataFiles = [
    ...walk(path.join(root, "content", "posts"), (file) => file.endsWith(`${path.sep}index.md`)),
    ...walk(path.join(root, "content"), (file) =>
      file.endsWith(".json") && !file.includes(`${path.sep}posts${path.sep}`)
    )
  ];
  const documents = dataFiles.map((file) => {
    const source = fs.readFileSync(file, "utf8");
    const data = file.endsWith(".md") ? matter(source).data : JSON.parse(source);
    return { file, source, data, references: collectTagReferences(data) };
  });
  const references = documents.flatMap((document) => document.references);
  const migration = buildMigration({
    tagIds,
    labelIds: Object.keys(labels),
    references
  });
  const replaceId = (id) => migration.mapping.get(id) ?? id;
  const changes = [];

  const nextTags = tagIds.map(replaceId);
  if (JSON.stringify(nextTags) !== JSON.stringify(tagIds)) {
    changes.push([tagsFile, `${JSON.stringify(nextTags, null, 2)}\n`]);
  }
  const nextLabels = Object.fromEntries(
    Object.entries(labels).map(([id, label]) => [replaceId(id), label])
  );
  if (JSON.stringify(nextLabels) !== JSON.stringify(labels)) {
    changes.push([labelsFile, `${JSON.stringify(nextLabels, null, 2)}\n`]);
  }

  for (const document of documents) {
    let nextSource = document.source;
    if (document.file.endsWith(".md")) {
      const frontmatterEnd = nextSource.indexOf("\n---", 4);
      const frontmatter = nextSource.slice(0, frontmatterEnd);
      const migratedFrontmatter = frontmatter.replace(
        /^(tags|relatedTags):\s*(\[[\s\S]*?\])\s*$/gm,
        (line) => {
          let migratedLine = line;
          for (const [oldId, newId] of migration.mapping) {
            if (oldId === newId) continue;
            migratedLine = migratedLine.replace(
              new RegExp(`(?<![0-9])${oldId}(?![0-9])`, "g"),
              newId
            );
          }
          return migratedLine;
        }
      );
      nextSource = `${migratedFrontmatter}${nextSource.slice(frontmatterEnd)}`;
    } else if (migrateTagReferences(document.data, migration.mapping)) {
      nextSource = `${JSON.stringify(document.data, null, 2)}\n`;
    }
    if (nextSource !== document.source) changes.push([document.file, nextSource]);
  }

  const remainingOldIds = [
    ...nextTags,
    ...Object.keys(nextLabels),
    ...references.map(replaceId)
  ].filter((id) => OLD_ID.test(id));
  if (remainingOldIds.length) throw new Error(`legacy four-digit IDs remain: ${remainingOldIds.join(", ")}`);

  if (write) {
    for (const [file, source] of changes) fs.writeFileSync(file, source);
  }
  return {
    mode: write ? "write" : "dry-run",
    changedFiles: changes.length,
    migratedDefinitions: migration.migratedDefinitions,
    migratedReferences: migration.migratedReferences
  };
};

const isMain = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const unknown = process.argv.slice(2).filter((argument) => argument !== "--write");
    if (unknown.length) throw new Error(`unknown arguments: ${unknown.join(", ")}`);
    const result = runMigration({ write: process.argv.includes("--write") });
    console.log(
      `[${result.mode}] ${result.changedFiles} file(s), ` +
      `${result.migratedDefinitions} definition(s), ${result.migratedReferences} reference(s)`
    );
  } catch (error) {
    console.error(`Tag ID migration failed: ${error.message}`);
    process.exit(1);
  }
}
