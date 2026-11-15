import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Markup plus the in-page client script, so source checks still see both. */
export function consolePageSource() {
  return `${readFileSync(join(root, "src/console-page.js"), "utf8")}\n${readFileSync(join(root, "src/console/page-client.js"), "utf8")}`;
}
