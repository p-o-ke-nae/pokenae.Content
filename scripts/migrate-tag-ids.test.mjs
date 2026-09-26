import assert from "node:assert/strict";
import test from "node:test";
import { buildMigration, runMigration } from "./migrate-tag-ids.mjs";

test("four-digit IDs are mapped to six digits", () => {
  const result = buildMigration({
    tagIds: ["0001", "9999"],
    labelIds: ["0001", "9999"],
    references: ["0001", "9999", "0001"]
  });
  assert.deepEqual([...result.mapping], [["0001", "000001"], ["9999", "009999"]]);
  assert.equal(result.migratedDefinitions, 2);
  assert.equal(result.migratedReferences, 3);
});

test("already migrated IDs are idempotent", () => {
  const result = buildMigration({
    tagIds: ["000001", "999999"],
    labelIds: ["000001", "999999"],
    references: ["000001"]
  });
  assert.equal(result.migratedDefinitions, 0);
  assert.equal(result.migratedReferences, 0);
});

test("invalid, duplicate, mixed, and undefined IDs fail", () => {
  assert.throws(
    () => buildMigration({ tagIds: ["abc1"], labelIds: ["abc1"], references: [] }),
    /four-digit/
  );
  assert.throws(
    () => buildMigration({ tagIds: ["0001", "0001"], labelIds: ["0001"], references: [] }),
    /duplicate/
  );
  assert.throws(
    () => buildMigration({ tagIds: ["0001", "000002"], labelIds: ["0001", "000002"], references: [] }),
    /mixed/
  );
  assert.throws(
    () => buildMigration({ tagIds: ["0001"], labelIds: ["0001"], references: ["0002"] }),
    /undefined/
  );
  assert.throws(
    () => buildMigration({ tagIds: ["000000"], labelIds: ["000000"], references: [] }),
    /four-digit/
  );
});

test("repository data is an idempotent dry-run after migration", () => {
  assert.deepEqual(runMigration(), {
    mode: "dry-run",
    changedFiles: 0,
    migratedDefinitions: 0,
    migratedReferences: 0
  });
});
