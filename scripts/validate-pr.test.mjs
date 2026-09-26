import assert from "node:assert/strict";
import test from "node:test";

test("skip metadata contract requires a reason", () => {
  const valid = (body) =>
    /^Content-Update:\s*skip\s*$/im.test(body) &&
    /^Content-Update-Reason:\s*\S.+$/im.test(body);
  assert.equal(valid("Content-Update: skip"), false);
  assert.equal(
    valid("Content-Update: skip\nContent-Update-Reason: typo only"),
    true
  );
});

