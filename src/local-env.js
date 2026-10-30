import { readFileSync } from "node:fs";

const FILES = ["recall.env", "calendar-oauth.env", "public.env"];

/**
 * Fills missing process env names from the gitignored local files.
 * An existing value wins. Company and personal memory keys are not read.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(name: string) => string} [read]
 */
export function loadLocalEnv(env = process.env, read = readLocalFile) {
  for (const name of FILES) {
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
  return readFileSync(`.local/${name}`, "utf8");
}
