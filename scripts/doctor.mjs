#!/usr/bin/env node
/**
 * Open Invite repo health check.
 * Usage: node scripts/doctor.mjs [--ci]
 * Exit 0 = all required checks pass. Exit 1 = at least one required check failed.
 *
 * --ci  Promotes all WARNings to FAILures (for CI pipeline use).
 *
 * Output format (machine-parseable):
 *   PASS  <description>
 *   WARN  <description>
 *   FAIL  <description>
 *          Fix: <actionable fix>
 */

import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── flags ───────────────────────────────────────────────────────────────────

const CI_MODE = process.argv.includes("--ci");

// ─── helpers ────────────────────────────────────────────────────────────────

let failCount = 0;
let warnCount = 0;
let skipCount = 0;

function pass(msg) { console.log(`  PASS  ${msg}`); }

function warn(msg, fix) {
  if (CI_MODE) {
    failCount++;
    console.log(`  FAIL  ${msg} [CI: warning promoted to failure]`);
    if (fix) console.log(`         Fix: ${fix}`);
  } else {
    warnCount++;
    console.log(`  WARN  ${msg}`);
    if (fix) console.log(`         Fix: ${fix}`);
  }
}

function fail(msg, fix) {
  failCount++;
  console.log(`  FAIL  ${msg}`);
  if (fix) console.log(`         Fix: ${fix}`);
}

function skip(msg) {
  skipCount++;
  console.log(`  SKIP  ${msg}`);
}

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

/**
 * Extract all string values from the first <array> following <key>KEY</key>.
 * Works for simple arrays of strings (e.g. CFBundleURLSchemes).
 */
function plistArrayValues(xml, key) {
  const blockRe = new RegExp(
    `<key>${key}<\\/key>\\s*<array>([\\s\\S]*?)<\\/array>`
  );
  const block = xml.match(blockRe);
  if (!block) return [];
  return [...block[1].matchAll(/<string>([^<]+)<\/string>/g)].map(
    (m) => m[1].trim()
  );
}

/**
 * Collect ALL CFBundleURLSchemes values from the plist.
 * Matches every <key>CFBundleURLSchemes</key> block globally — works even
 * when the outer CFBundleURLTypes array nests multiple scheme entries.
 */
function plistAllUrlSchemes(xml) {
  const schemes = [];
  const schemesRe =
    /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const m of xml.matchAll(schemesRe)) {
    for (const s of m[1].matchAll(/<string>([^<]+)<\/string>/g)) {
      schemes.push(s[1].trim());
    }
  }
  return schemes;
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

// ─── G) Expo config parity ───────────────────────────────────────────────────

section("G) Expo config parity (REQUIRED)");

(() => {
  // Parse app.json once for G checks
  let appJson = null;
  try {
    appJson = JSON.parse(readFile("app.json"));
  } catch (e) {
    fail("Could not parse app.json — skipping G checks", `fix app.json JSON syntax: ${e.message}`);
    return;
  }

  const mainPlist = "ios/OpenInvite/Info.plist";
  const plistXml = readFile(mainPlist);
  if (!plistXml) {
    fail(`${mainPlist} not found — skipping G checks`, `ensure Xcode project exists at ios/`);
    return;
  }

  // G1: expo.scheme vs CFBundleURLSchemes
  const appScheme = appJson?.expo?.scheme ?? null;
  const urlSchemes = plistAllUrlSchemes(plistXml);
  if (!appScheme) {
    fail(
      "G1: expo.scheme not found in app.json",
      "Add 'scheme' field to expo object in app.json"
    );
  } else if (urlSchemes.length === 0) {
    fail(
      `G1: CFBundleURLSchemes not found in ${mainPlist}`,
      "Add CFBundleURLSchemes array inside CFBundleURLTypes in Info.plist"
    );
  } else if (!urlSchemes.includes(appScheme)) {
    fail(
      `G1: MISMATCH: app.json scheme=[${appScheme}] not found in Info.plist CFBundleURLSchemes=[${urlSchemes.join(", ")}]`,
      `Add '${appScheme}' to CFBundleURLSchemes in ${mainPlist}`
    );
  } else {
    pass(`G1: expo.scheme '${appScheme}' found in CFBundleURLSchemes`);
  }

  // G2: expo.ios.bundleIdentifier vs CFBundleIdentifier
  const appBundleId = appJson?.expo?.ios?.bundleIdentifier ?? null;
  const plistBundleId = plistValue(plistXml, "CFBundleIdentifier");
  if (!appBundleId) {
    fail(
      "G2: expo.ios.bundleIdentifier not set in app.json",
      "Add bundleIdentifier under expo.ios in app.json"
    );
  } else if (!plistBundleId) {
    fail(
      `G2: CFBundleIdentifier not found in ${mainPlist}`,
      `Add CFBundleIdentifier to ${mainPlist}`
    );
  } else if (plistBundleId.startsWith("$(")) {
    // Xcode variable — skip and warn per spec
    warn(
      `G2: CFBundleIdentifier uses Xcode variable '${plistBundleId}' — skipping literal comparison`,
      "Verify bundleIdentifier is set correctly in Xcode project settings"
    );
  } else if (plistBundleId !== appBundleId) {
    fail(
      `G2: MISMATCH: app.json bundleIdentifier=[${appBundleId}] vs plist literal=[${plistBundleId}]`,
      `Sync CFBundleIdentifier in ${mainPlist} with app.json expo.ios.bundleIdentifier`
    );
  } else {
    pass(`G2: bundleIdentifier '${appBundleId}' matches Info.plist`);
  }
})();

// ─── H) Env var completeness (warnings only) ─────────────────────────────────

section("H) Env var completeness (WARNING)");

(() => {
  // Parse .env if present (reuse envFileVars from section F above, but we need
  // to rebuild because F's const is block-scoped — just re-read here)
  const hEnvVars = new Set();
  const hEnvRaw = readFile(".env");
  if (hEnvRaw) {
    for (const line of hEnvRaw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (m) hEnvVars.add(m[1]);
    }
  }

  function envSet(key) {
    return !!process.env[key] || hEnvVars.has(key);
  }

  // H1: additional env vars needed for production features
  const h1Checks = [
    { key: "EXPO_PUBLIC_SENTRY_DSN",                   feature: "Sentry error reporting" },
    { key: "EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY", feature: "RevenueCat subscriptions" },
    { key: "EXPO_PUBLIC_API_URL",                      feature: "backend API calls" },
    { key: "EXPO_PUBLIC_BETTER_AUTH_URL",              feature: "Better Auth session" },
  ];

  for (const { key, feature } of h1Checks) {
    if (envSet(key)) {
      pass(`H1: ${key} is set`);
    } else {
      warn(
        `H1: ${key} is NOT set (needed for ${feature})`,
        `Add ${key} to .env or EAS environment variables`
      );
    }
  }

  // H2: EXPO_PUBLIC_API_URL must not end with trailing slash
  const apiUrl = process.env.EXPO_PUBLIC_API_URL
    ?? (hEnvRaw
        ? (hEnvRaw.split("\n").find(l => l.match(/^\s*EXPO_PUBLIC_API_URL\s*=/)
          )?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, ""))
        : undefined);

  if (!apiUrl) {
    skip("H2: EXPO_PUBLIC_API_URL not set — skipping trailing slash check");
  } else if (apiUrl.endsWith("/")) {
    warn(
      "H2: EXPO_PUBLIC_API_URL ends with '/' — this causes double-slash API bugs",
      "Remove the trailing slash from EXPO_PUBLIC_API_URL"
    );
  } else {
    pass("H2: EXPO_PUBLIC_API_URL has no trailing slash");
  }
})();

// ─── Summary ─────────────────────────────────────────────────────────────────

const MODE = CI_MODE ? "ci" : "normal";

console.log(`\n${"═".repeat(60)}`);
console.log(`  REQUIRED_FAILS=${failCount}  WARNS=${warnCount}  SKIPPED=${skipCount}  MODE=${MODE}`);
if (failCount > 0) {
  console.log("  RESULT: FAIL — required checks failed. See FAIL lines above.");
  console.log("═".repeat(60));
  process.exit(1);
} else {
  console.log("  RESULT: PASS — all required checks passed.");
  console.log("═".repeat(60));
  process.exit(0);
}
