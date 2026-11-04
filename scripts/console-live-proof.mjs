/**
 * Prove one small file against Walrus Console.
 * Reads the environment only. Never prints a key.
 *
 *   node scripts/console-live-proof.mjs <proof.json>
 *
 * CONSOLE_API_KEY and CONSOLE_SERVICE_PRIVATE_KEY are required.
 * CONSOLE_SPACE_ID and CONSOLE_FOLDER_ID are used when set.
 * A set CONSOLE_FOLDER_ID never creates a folder.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { metadataReady, readConsoleFile } from "../src/console/upload.js";
import { createConsoleFiles } from "../src/files/console-files.js";
import { consoleObjectName, fileMetadata, fileTags } from "../src/files/meta.js";

const TEXT = "sederunt console live proof\n";
const METADATA_FIELDS = ["sederunt_file_id", "tenant_id", "channel_id", "owner_person_id", "slack_file_id"];

function redact(value) {
  return String(value || "")
    .replace(/suiprivkey1[a-z0-9]+/gi, "[redacted]")
    .replace(/\bhbr_[A-Za-z0-9_-]+/g, "[redacted]");
}

export function proofMetadata(record) {
  let metadata = record?.metadata ?? null;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const picked = {};
  for (const key of METADATA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      picked[key] = typeof value === "string" ? redact(value) : value;
    }
  }
  const tags = Array.isArray(record?.tags) ? record.tags.map((tag) => redact(tag)) : [];
  return { metadataKeys: Object.keys(source), metadata: picked, tags };
}

export function proofStatus(record) {
  if (!record) return "404";
  return redact(record.status || record.state || "");
}

function fail(message) {
  process.stderr.write(`${redact(message)}\n`);
  process.exitCode = 1;
}

async function main() {
  const out = process.argv[2];
  if (!out) {
    fail("usage: node scripts/console-live-proof.mjs <proof.json>");
    return;
  }
  const env = process.env;
  if (!String(env.CONSOLE_API_KEY || "").trim() || !String(env.CONSOLE_SERVICE_PRIVATE_KEY || "").trim()) {
    fail("refusing: CONSOLE_API_KEY and CONSOLE_SERVICE_PRIVATE_KEY are required");
    return;
  }
  const pinned = Boolean(String(env.CONSOLE_FOLDER_ID || "").trim());
  let folderPosts = 0;
  const fetchImpl = async (url, init) => {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    let path = "";
    try {
      path = new URL(href).pathname;
    } catch {
      path = "";
    }
    if (method === "POST" && /\/api\/v1\/spaces\/[^/]+\/buckets$/.test(path)) {
      folderPosts += 1;
      if (pinned) throw new Error("refusing to create a folder because CONSOLE_FOLDER_ID is set");
    }
    return fetch(url, init);
  };

  const bytes = Buffer.from(TEXT);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = {
    id: `proof-${Date.now()}`,
    tenantId: "00000000-0000-4000-a000-00000000acme",
    channelId: "00000000-0000-4000-a000-00000000c001",
    ownerUserId: "00000000-0000-4000-a000-00000000a11c",
    slackFileId: null,
    name: "console-live-proof.txt",
  };
  const storage = createConsoleFiles({ env, fetch: fetchImpl });
  const timingsMs = {};
  const started = Date.now();
  let folder;
  let placed;
  let deleted = false;
  let deleteReads = 0;
  let metadataKeys = [];
  let metadata = {};
  let tags = [];
  let deleteStatus = null;
  try {
    const t0 = Date.now();
    folder = await storage.resolveFolder({ tenantId: file.tenantId, channelId: file.channelId });
    timingsMs.folder = Date.now() - t0;
    if (pinned && folder.created) throw new Error("pinned folder was reported as created");
    if (pinned && folderPosts > 0) throw new Error("pinned folder created a bucket");
    const t1 = Date.now();
    placed = await storage.put({
      name: consoleObjectName(file),
      plain: bytes,
      metadata: fileMetadata(file),
      tags: fileTags(file),
      folder,
    });
    timingsMs.upload = Date.now() - t1;
    const t2 = Date.now();
    const plain = await storage.download({
      folderId: placed.folderId,
      fileId: placed.fileId,
      policyId: folder.sealPolicyId,
    });
    timingsMs.download = Date.now() - t2;
    const got = createHash("sha256").update(Buffer.from(plain)).digest("hex");
    if (got !== sha256) throw new Error("sha256 mismatch");
    const before = await readConsoleFile(fetchImpl, env.CONSOLE_API_KEY, placed.folderId, placed.fileId);
    ({ metadataKeys, metadata, tags } = proofMetadata(before));
    const t3 = Date.now();
    let outcome = await storage.remove({ folderId: placed.folderId, fileId: placed.fileId });
    deleteReads = 1;
    while (!outcome.deleted && deleteReads < 40) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const record = await readConsoleFile(fetchImpl, env.CONSOLE_API_KEY, placed.folderId, placed.fileId);
      deleteReads += 1;
      outcome = !record || metadataReady(record) === "deleted"
        ? { deleted: true }
        : { deleted: false, status: record.status || record.state || "" };
    }
    timingsMs.delete = Date.now() - t3;
    deleted = outcome.deleted === true;
    const after = await readConsoleFile(fetchImpl, env.CONSOLE_API_KEY, placed.folderId, placed.fileId);
    deleteStatus = proofStatus(after);
    if (!deleted) throw new Error("Console file was not deleted");
    const proof = {
      ok: true,
      spaceId: placed.spaceId,
      folderId: placed.folderId,
      folderCreated: folder.created === true,
      pinnedFolder: pinned,
      fileId: placed.fileId,
      uploadState: placed.state,
      sha256,
      metadataKeys,
      metadata,
      tags,
      deleted: true,
      deleteStatus,
      deleteReads,
      timingsMs,
      elapsedMs: Date.now() - started,
    };
    writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`);
    process.stdout.write(`wrote ${out}\n`);
  } catch (error) {
    const proof = {
      ok: false,
      error: redact(error?.message || error),
      spaceId: placed?.spaceId || folder?.spaceId || null,
      folderId: placed?.folderId || folder?.folderId || null,
      folderCreated: folder?.created === true,
      pinnedFolder: pinned,
      fileId: placed?.fileId || null,
      uploadState: placed?.state || null,
      sha256,
      metadataKeys,
      metadata,
      tags,
      deleted,
      deleteStatus,
      deleteReads,
      timingsMs,
      elapsedMs: Date.now() - started,
    };
    try {
      writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`);
    } catch {
      // The proof path itself failed. The message below stays redacted.
    }
    fail(proof.error);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
