import { readFileSync } from "node:fs";

const FILES = ["recall.env", "calendar-oauth.env", "public.env", "console.env", "slack.env", "tatum.env", "openrouter.env", "admin.env"];

/**
 * Fills missing process env names from the gitignored local files.
 * An existing value wins. Company and personal memory keys are not read.
 * Console and Slack files are read. A missing file is skipped.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(name: string) => string} [read]
 */
export function loadLocalEnv(env = process.env, read = readLocalFile) {
  fillEnv(env, read, FILES);
}

/** Company Memory keys, loaded only when the real server starts. */
export function loadCompanyEnv(env = process.env, read = readLocalFile) {
  fillEnv(env, read, ["company.env"]);
}

function fillEnv(env, read, files) {
  for (const name of files) {
    let text = "";
    try {
      text = read(name);
    } catch {
      continue;
    }
    for (const line of String(text).split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!key || env[key]) continue;
      env[key] = value;
    }
  }
}

function readLocalFile(name) {
  try {
    return readFileSync(`.local/${name}`, "utf8");
  } catch {
    return readFileSync(`/workspace/sederunt-secrets/${name}`, "utf8");
  }
}
