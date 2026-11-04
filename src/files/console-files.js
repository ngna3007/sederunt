import {
  deleteConsoleFile,
  downloadCiphertext,
  decryptForFolder,
  encryptForFolder,
  finalizeConsoleFolder,
  folderPolicy,
  listConsoleFolders,
  listConsoleSpaces,
  metadataReady,
  patchConsoleFileTags,
  pickConsoleSpace,
  pollFile,
  postCiphertext,
  readConsoleFile,
  reserveConsoleFolder,
  signConsoleReserve,
} from "../console/upload.js";
import { configuredFolderId, configuredSpaceId, filesFolderName } from "./config.js";

/**
 * Live Walrus Console storage for channel files.
 * `resolveFolder({ tenantId, channelId })` is the seam a later workspace uses
 * to point at its own space. The default is one private folder for the environment.
 *
 * @param {{ fetch?: typeof fetch, env?: NodeJS.ProcessEnv, store?: { findConsoleFolder?: Function, saveConsoleFolder?: Function }, encrypt?: Function, decrypt?: Function, sign?: Function, wait?: (ms: number) => Promise<void>, resolveFolder?: Function }} options
 */
export function createConsoleFiles(options = {}) {
  const fetchImpl = options.fetch || fetch;
  const env = options.env || {};
  const store = options.store;
  const wait = options.wait;
  const apiKey = String(env.CONSOLE_API_KEY || "").trim();
  const serviceKey = String(env.CONSOLE_SERVICE_PRIVATE_KEY || "").trim();
  let spacePromise = null;

  async function spaceId() {
    const configured = configuredSpaceId(env);
    if (configured) return configured;
    if (!spacePromise) {
      spacePromise = listConsoleSpaces(fetchImpl, apiKey, wait).then((spaces) => {
        const space = pickConsoleSpace(spaces);
        if (!space?.id) throw new Error("Console space is not readable");
        return space.id;
      });
    }
    return spacePromise;
  }

  async function loadPolicy(folderId) {
    return folderPolicy(fetchImpl, apiKey, folderId, wait);
  }

  async function sharedFolder({ tenantId, channelId }) {
    const pinned = configuredFolderId(env);
    const space = await spaceId();
    if (pinned) {
      const sealPolicyId = await loadPolicy(pinned);
      return { spaceId: space, folderId: pinned, sealPolicyId, name: null, created: false, tenantId, channelId };
    }
    const name = filesFolderName(env);
    const saved = store?.findConsoleFolder?.(space, name);
    if (saved?.folderId) {
      return {
        spaceId: space,
        folderId: saved.folderId,
        sealPolicyId: saved.sealPolicyId || await loadPolicy(saved.folderId),
        name,
        created: false,
        tenantId,
        channelId,
      };
    }
    const opened = await ensureFolder(space, name);
    store?.saveConsoleFolder?.({
      spaceId: space,
      name,
      folderId: opened.folderId,
      sealPolicyId: opened.sealPolicyId,
    });
    return { spaceId: space, name, ...opened, tenantId, channelId };
  }

  async function ensureFolder(space, name) {
    const reserved = await reserveConsoleFolder(fetchImpl, apiKey, space, name, wait);
    if (reserved.conflict) {
      const buckets = await listConsoleFolders(fetchImpl, apiKey, space, name, wait);
      const found = buckets.find((bucket) => bucket?.name === name && bucket.seal_policy_id);
      if (!found) throw new Error("Console folder name is taken and not readable");
      return { folderId: found.id, sealPolicyId: found.seal_policy_id, created: false };
    }
    const signature = options.sign
      ? await options.sign(reserved.bytes)
      : await signConsoleReserve(serviceKey, reserved.bytes);
    const finalized = await finalizeConsoleFolder(fetchImpl, apiKey, reserved.folderId, signature, wait);
    const sealPolicyId = finalized.sealPolicyId || await loadPolicy(finalized.folderId);
    return { folderId: finalized.folderId, sealPolicyId, created: true };
  }

  const resolveFolder = options.resolveFolder || sharedFolder;

  async function finishUpload({ folderId, fileId, tags }) {
    if (Array.isArray(tags) && tags.length) {
      await patchConsoleFileTags(fetchImpl, apiKey, fileId, tags, wait);
    }
    const state = await pollFile(fetchImpl, apiKey, folderId, fileId, wait);
    if (state !== "completed") throw new Error("Console upload did not complete");
  }

  return {
    resolveFolder,
    async put({ name, plain, metadata, tags, folder, onAccepted }) {
      const policyId = folder.sealPolicyId || await loadPolicy(folder.folderId);
      const bytes = plain instanceof Uint8Array ? plain : Buffer.from(plain);
      const ciphertext = options.encrypt
        ? await options.encrypt(bytes, { policyId, apiKey })
        : await encryptForFolder(bytes, policyId, apiKey);
      const fileId = await postCiphertext(fetchImpl, apiKey, folder.folderId, {
        name,
        ciphertext,
        metadata,
        includeContentSize: false,
      }, wait);
      if (onAccepted) {
        await onAccepted({ spaceId: folder.spaceId, folderId: folder.folderId, fileId });
      }
      await finishUpload({ folderId: folder.folderId, fileId, tags });
      return { spaceId: folder.spaceId, folderId: folder.folderId, fileId, state: "active" };
    },
    async finish({ folderId, fileId, tags }) {
      await finishUpload({ folderId, fileId, tags });
      return { state: "active" };
    },
    async download({ folderId, fileId, policyId }) {
      const policy = policyId || await loadPolicy(folderId);
      const ciphertext = await downloadCiphertext(fetchImpl, apiKey, folderId, fileId, wait);
      const plain = options.decrypt
        ? await options.decrypt(ciphertext, { policyId: policy, apiKey, serviceKey })
        : await decryptForFolder(ciphertext, policy, apiKey, serviceKey);
      return Buffer.from(plain);
    },
    async remove({ folderId, fileId }) {
      await deleteConsoleFile(fetchImpl, apiKey, folderId, fileId, wait);
      const record = await readConsoleFile(fetchImpl, apiKey, folderId, fileId, wait);
      if (!record || metadataReady(record) === "deleted") return { deleted: true };
      return { deleted: false, status: record.status || record.state || "" };
    },
  };
}
