#!/usr/bin/env node
/**
 * Open Invite repo health check.
 * Usage: node scripts/doctor.mjs
 * Exit 0 = all required checks pass. Exit 1 = at least one required check failed.
 */

import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── helpers ────────────────────────────────────────────────────────────────

let anyFailure = false;

function pass(msg) { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); anyFailure = true; }

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function readFile(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

/** Extract a plist string value by key name. */
function plistValue(xml, key) {
  const re = new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]+)<\\/string>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Run a shell command, return { ok, stdout, stderr }. */
function run(cmd, opts = {}) {
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    }).toString();
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

// ─── A) Repo invariants ──────────────────────────────────────────────────────

section("A) Repo invariants");

// app.json must exist
if (!existsSync(resolve(ROOT, "app.json"))) {
  fail("app.json not found");
} else {
  pass("app.json found");
}

// warn if app.config.js / app.config.ts exist
for (const name of ["app.config.js", "app.config.ts"]) {
  if (existsSync(resolve(ROOT, name))) {
    warn(`${name} found — this shadows app.json and may cause build confusion`);
  }
}

// read version info
let appVersion = null;
let appBuildNumber = null;
try {
  const appJson = JSON.parse(readFile("app.json"));
  appVersion = appJson?.expo?.version ?? null;
  appBuildNumber = appJson?.expo?.ios?.buildNumber ?? null;
  pass(`app.json version = ${appVersion}  buildNumber = ${appBuildNumber}`);
} catch (e) {
  fail(`Failed to parse app.json: ${e.message}`);
}

// ─── B) iOS bundle version parity ───────────────────────────────────────────

section("B) iOS bundle version parity");

const plists = [
  "ios/OpenInvite/Info.plist",
  "ios/OpenInviteTodayWidget/Info.plist",
];

for (const rel of plists) {
  const xml = readFile(rel);
  if (!xml) {
    warn(`${rel} not found — skipping parity check for this file`);
    continue;
  }

  const shortVer = plistValue(xml, "CFBundleShortVersionString");
  const bundleVer = plistValue(xml, "CFBundleVersion");

  let plistOk = true;

  if (shortVer !== appVersion) {
    fail(
      `${rel}: CFBundleShortVersionString = "${shortVer}" ≠ app.json version "${appVersion}"` +
      `\n       Fix: update CFBundleShortVersionString in ${rel} to "${appVersion}"`
    );
    plistOk = false;
  }

  if (bundleVer !== appBuildNumber) {
    fail(
      `${rel}: CFBundleVersion = "${bundleVer}" ≠ app.json buildNumber "${appBuildNumber}"` +
      `\n       Fix: update CFBundleVersion in ${rel} to "${appBuildNumber}"`
    );
    plistOk = false;
  }

  if (plistOk) {
    pass(`${rel}: version=${shortVer} buildNumber=${bundleVer} ✓`);
  }
}

// ─── C) Expo + dependency sanity ────────────────────────────────────────────

section("C) Expo + dependency sanity (expo-doctor)");

console.log("  Running npx expo-doctor …");
const doctor = run("npx expo-doctor", { timeout: 60_000 });
if (!doctor.ok) {
  fail("expo-doctor reported issues:");
  const output = (doctor.stdout + doctor.stderr).trim();
  console.log(output.split("\n").map(l => `    ${l}`).join("\n"));
} else {
  const lines = doctor.stdout.trim().split("\n");
  lines.forEach(l => console.log(`    ${l}`));
  pass("expo-doctor passed");
}

// ─── D) Type safety ─────────────────────────────────────────────────────────

section("D) Type safety (typecheck)");

console.log("  Running npm run typecheck …");
const tc = run("npm run typecheck", { timeout: 120_000 });
if (!tc.ok) {
  fail("Type errors detected:");
  const output = (tc.stdout + tc.stderr).trim();
  console.log(output.split("\n").map(l => `    ${l}`).join("\n"));
} else {
  pass("No TypeScript errors");
}

// ─── E) Lint (optional) ─────────────────────────────────────────────────────

section("E) Lint (optional)");

let pkgJson = null;
try { pkgJson = JSON.parse(readFile("package.json")); } catch (_) {}

if (pkgJson?.scripts?.lint) {
  console.log("  Running npm run lint …");
  const lint = run("npm run lint", { timeout: 120_000 });
  if (!lint.ok) {
    fail("Lint errors detected:");
    const output = (lint.stdout + lint.stderr).trim();
    console.log(output.split("\n").map(l => `    ${l}`).join("\n"));
  } else {
    pass("Lint passed");
  }
} else {
  warn("lint script not found — skipping");
}

// ─── F) Env sanity (warnings only) ──────────────────────────────────────────

section("F) Env var presence (warnings only)");

// Parse .env file if present
const envFileVars = new Set();
const envRaw = readFile(".env");
if (envRaw) {
  for (const line of envRaw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) envFileVars.add(m[1]);
  }
  pass(`.env file found (${envFileVars.size} variables)`);
} else {
  console.log("  (no .env file found — checking process.env only)");
}

const requiredEnvVars = [
  "EXPO_PUBLIC_POSTHOG_KEY",
  "EXPO_PUBLIC_POSTHOG_HOST",
];

for (const key of requiredEnvVars) {
  const inProcess = !!process.env[key];
  const inDotenv = envFileVars.has(key);
  if (inProcess || inDotenv) {
    pass(`${key} is set`);
  } else {
    warn(`${key} is NOT set (add to EAS env or .env for local dev)`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
if (anyFailure) {
  console.log("  ❌  Doctor found issues — see above. Exit 1.");
  console.log("═".repeat(60));
  process.exit(1);
} else {
  console.log("  ✅  All required checks passed. Exit 0.");
  console.log("═".repeat(60));
  process.exit(0);
}
