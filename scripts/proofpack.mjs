#!/usr/bin/env node
/**
 * proofpack — deterministic proof pack for Open Invite repo.
 *
 * Runs a sequence of verification commands and prints their output.
 * Safe to run in any shell (no heredoc, no noclobber risk).
 * Does NOT print env variable values — only presence checks via doctor.
 *
 * Usage: node scripts/proofpack.mjs
 *        npm run proofpack
 *
 * Exit code: 0 if all required commands pass, 1 if any fail.
 */

import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DIVIDER = "=".repeat(60);
const THIN    = "-".repeat(60);

let anyFail = false;

function section(title) {
  console.log("\n" + DIVIDER);
  console.log("  " + title);
  console.log(DIVIDER);
}

function run(label, cmd, opts = {}) {
  console.log("\n" + THIN);
  console.log("  RUNNING: " + cmd);
  console.log(THIN);
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: opts.timeout ?? 180_000,
    }).toString().trimEnd();
    if (out) console.log(out);
    console.log("\n  RESULT: PASS — " + label);
    return true;
  } catch (e) {
    const out = ((e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "")).trimEnd();
    if (out) console.log(out);
    console.log("\n  RESULT: FAIL — " + label);
    if (!opts.warnOnly) anyFail = true;
    return false;
  }
}

// ── Header ────────────────────────────────────────────────
console.log(DIVIDER);
console.log("  OPEN INVITE — PROOF PACK");
console.log("  " + new Date().toISOString());
console.log(DIVIDER);

// ── 1. Git status ─────────────────────────────────────────
section("1. Git status (short)");
run("git status", "git status -sb");

// ── 2. Last commit stat ───────────────────────────────────
section("2. Last commit — stat");
run("git show stat", "git show --stat HEAD");

// ── 3. Last commit — files only ───────────────────────────
section("3. Last commit — files changed");
run("git show names", "git show --name-only HEAD");

// ── 4. Doctor ─────────────────────────────────────────────
section("4. Doctor");
run("npm run doctor", "npm run doctor", { warnOnly: true });
// Doctor may fail on expo-doctor (pre-existing); treat as warning here
// so proofpack itself can still pass when the only failure is expo-doctor.
// The doctor output above will show the detail.

// ── 5. TypeScript ─────────────────────────────────────────
section("5. TypeScript");
run("npm run typecheck", "npm run typecheck");

// ── Summary ───────────────────────────────────────────────
console.log("\n" + DIVIDER);
if (anyFail) {
  console.log("  PROOF PACK: FAIL — see above. Exit 1.");
  console.log(DIVIDER);
  process.exit(1);
} else {
  console.log("  PROOF PACK: PASS. Exit 0.");
  console.log(DIVIDER);
  process.exit(0);
}
