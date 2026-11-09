#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? "not available"}).`);
  return result;
};
const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error(`${command} is unavailable or returned an error.`);
  return result.stdout.trim();
};
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(command, args) {
  for (let i = 0; i < 120; i++) {
    const result = spawnSync(command, args, { stdio: "ignore" });
    if (!result.error && result.status === 0) return;
    await pause(250);
  }
  throw new Error("Disposable service did not become ready.");
}
function syntax() {
  const walk = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = `${path}/${entry.name}`;
    return entry.isDirectory() ? walk(name) : /\.(?:js|mjs)$/.test(entry.name) ? [name] : [];
  });
  for (const file of [...walk("src"), ...walk("scripts")]) run(process.execPath, ["--check", file], { stdio: "ignore" });
  console.log("Syntax checks passed.");
}
async function integration() {
  if (!process.argv.includes("--confirm")) throw new Error("Pass --confirm to create and remove dedicated disposable Docker services.");
  capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const suffix = randomBytes(6).toString("hex");
  const database = `sederunt-check-db-${suffix}`, redis = `sederunt-check-redis-${suffix}`;
  try {
    capture("docker", ["run", "-d", "--name", database, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
    capture("docker", ["run", "-d", "--name", redis, "-p", "127.0.0.1::6379", "redis:7-alpine"]);
    await waitFor("docker", ["exec", database, "pg_isready", "-U", "postgres"]);
    await waitFor("docker", ["exec", redis, "redis-cli", "ping"]);
    const port = capture("docker", ["port", redis, "6379/tcp"]).split(":").at(-1);
    if (!/^\d+$/.test(port)) throw new Error("Disposable Redis port is unavailable.");
    const redisUrl = `redis://127.0.0.1:${port}`;
    const env = { ...process.env, ADMIN_TEST_POSTGRES_CONTAINER: database, DELETION_TEST_POSTGRES_CONTAINER: database,
      FOLLOWUP_TEST_POSTGRES_CONTAINER: database, PARTICIPANT_TEST_POSTGRES_CONTAINER: database, ACTION_CLAIMS_TEST_POSTGRES_CONTAINER: database, ACTION_CLAIMS_TEST_POSTGRES_CONTAINER: database,
      ADMIN_TEST_REDIS_URL: redisUrl, ASK_TEST_REDIS_URL: redisUrl, FILES_TEST_INTEGRATION: "1" };
    run(process.execPath, ["--test", "--test-concurrency=1", "test/admin-database.test.js", "test/ask-scope.test.js",
      "test/files-database.test.js", "test/memory-deletion-database.test.js", "test/meeting-followups-database.test.js",
      "test/participant-binding-database.test.js", "test/action-claims-database.test.js"], { env });
  } finally {
    for (const name of [redis, database]) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  }
}
function secrets() {
  const rules = readFileSync(".gitleaksignore", "utf8");
  const expiry = /expires (\d{4}-\d{2}-\d{2})/.exec(rules)?.[1];
  if (!expiry || Date.now() >= Date.parse(`${expiry}T00:00:00Z`)) throw new Error("The reviewed scanner exception has expired or is missing an expiry.");
  if (capture("git", ["rev-parse", "--is-shallow-repository"]) !== "false") throw new Error("A full Git history is required for the secrets scan.");
  // Redact scanner output even if it finds a real credential; never print raw values.
  const common = capture("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  mkdirSync(".local/tmp", { recursive: true });
  const scratch = mkdtempSync(resolve(".local/tmp/gitleaks-"));
  try {
    const scan = spawnSync("docker", ["run", "--rm", "-e", "GIT_CONFIG_COUNT=1", "-e", "GIT_CONFIG_KEY_0=safe.directory", "-e", "GIT_CONFIG_VALUE_0=/repo",
      "-v", `${root}:/repo:ro`, "-v", `${common}:${common}:ro`, "-v", `${scratch}:/report`, "-w", "/repo", "zricethezav/gitleaks:v8.24.2",
      "git", "--redact", "--no-banner", "--no-color", "--log-level", "info", "--report-format", "json", "--report-path", "/report/findings.json", "."],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (scan.error) throw new Error("The Git history scanner could not run.");
    let findings;
    try { findings = JSON.parse(readFileSync(`${scratch}/findings.json`, "utf8")); } catch { findings = null; }
    const completed = /\d+ commits scanned/i.test(scan.stderr || "");
    if (!Array.isArray(findings) || !completed) throw new Error("The Git history scanner failed before completing its scan.");
    if (findings.length) {
      for (const finding of findings) {
        console.error(JSON.stringify({ rule: finding.RuleID, commit: finding.Commit, file: finding.File, line: finding.StartLine }));
      }
      throw new Error(`The Git history scanner found ${findings.length} possible credentials. Rotate confirmed credentials before history cleanup.`);
    }
    if (scan.status !== 0) throw new Error("The Git history scanner failed after completing its scan.");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log("Git history secret scan passed.");
}
try {
  switch (process.argv[2]) {
    case "syntax": syntax(); break;
    case "test": run("npm", ["test"]); break;
    case "integration": await integration(); break;
    case "secrets": secrets(); break;
    case "audit": run("npm", ["audit", "--audit-level=high"]); break;
    default: throw new Error("Choose syntax, test, integration, secrets or audit.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
