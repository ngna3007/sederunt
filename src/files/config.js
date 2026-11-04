/** Public file limits. Secrets stay in the server environment and are never written here. */

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const METADATA_MAX_BYTES = 8 * 1024;
export const TAG_MAX_CHARS = 30;
export const TAG_MAX_COUNT = 10;
export const DELETE_REQUEST_HOURS = 72;
export const DELETE_REQUEST_DAILY_CAP = 10;
export const JOB_MAX_ATTEMPTS = 12;
export const UPLOAD_STUCK_MS = 60 * 60 * 1000;
export const DEFAULT_FILES_FOLDER_NAME = "sederunt-files";
export const CONSOLE_API_BASE = "https://api.console.walrus.xyz/api/v1";

/**
 * Names only. `CONSOLE_SPACE_ID` defaults to the key's own space.
 * `CONSOLE_FOLDER_ID`, when set, is an existing folder and is never created.
 * `CONSOLE_FILES_FOLDER_NAME` is used only when `CONSOLE_FOLDER_ID` is unset.
 */
export const FILE_ENV_NAMES = [
  "CONSOLE_API_KEY",
  "CONSOLE_SERVICE_PRIVATE_KEY",
  "CONSOLE_SPACE_ID",
  "CONSOLE_FOLDER_ID",
  "CONSOLE_FILES_FOLDER_NAME",
  "SEDERUNT_MEMWAL_KEY",
  "SEDERUNT_MEMWAL_ACCOUNT_ID",
  "SEDERUNT_MEMWAL_OWNER_KEY",
  "SEDERUNT_MEMWAL_SERVER",
  "FILES_DEMO",
];

export function filesFolderName(env = {}) {
  const name = String(env.CONSOLE_FILES_FOLDER_NAME || DEFAULT_FILES_FOLDER_NAME).trim();
  return name || DEFAULT_FILES_FOLDER_NAME;
}

export function configuredSpaceId(env = {}) {
  return String(env.CONSOLE_SPACE_ID || "").trim();
}

export function configuredFolderId(env = {}) {
  return String(env.CONSOLE_FOLDER_ID || "").trim();
}

export function consoleReady(env = {}) {
  return Boolean(String(env.CONSOLE_API_KEY || "").trim() && String(env.CONSOLE_SERVICE_PRIVATE_KEY || "").trim());
}
