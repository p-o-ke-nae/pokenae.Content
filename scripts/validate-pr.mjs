import { execFileSync } from "node:child_process";

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA ?? "HEAD";
const body = process.env.PR_BODY ?? "";
if (!base) throw new Error("BASE_SHA is required");

const changed = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
  encoding: "utf8"
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const publicChanges = changed.filter(
  (file) =>
    file.startsWith("content/") &&
    !file.startsWith("content/updates/")
);
const updateChanges = changed.filter((file) =>
  /^content\/updates\/[^/]+\.json$/.test(file)
);
const skip =
  /^Content-Update:\s*skip\s*$/im.test(body) &&
  /^Content-Update-Reason:\s*\S.+$/im.test(body);

if (publicChanges.length && !updateChanges.length && !skip) {
  console.error(
    "Public content changes require content/updates/<change-id>.json, or both Content-Update: skip and Content-Update-Reason metadata in the PR body."
  );
  process.exit(1);
}
console.log("PR update-entry policy passed.");

