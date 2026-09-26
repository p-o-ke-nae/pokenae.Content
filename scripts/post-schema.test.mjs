import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/post.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const post = {
  slug: "new-post",
  title: "New post",
  summary: "Summary",
  publishedAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
  status: "draft",
  category: "blog",
  tags: [],
  relatedTags: [],
  priority: 0,
  thumbnail: null,
  changeNote: "Create post",
  showInPickup: false
};

test("legacyUrl is optional but validated when present", () => {
  assert.equal(validate(post), true);
  assert.equal(validate({ ...post, legacyUrl: null }), true);
  assert.equal(validate({ ...post, legacyUrl: "https://example.com/old-post" }), true);
  assert.equal(validate({ ...post, legacyUrl: "not a URL" }), false);
});
