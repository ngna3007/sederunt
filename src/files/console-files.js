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
import { credentialUnreadable, openConsoleCredential } from "./credentials.js";

/**
 * Live Walrus Console storage for channel files.
 * `resolveFolder({ tenantId, channelId })` reads a per-workspace mapping when
 * one exists and otherwise returns the shared private folder. An isolated
 * mapping whose credential cannot be opened fails closed.
 *
 * @param {{ fetch?: typeof fetch, env?: NodeJS.ProcessEnv, store?: { findConsoleFolder?: Function, saveConsoleFolder?: Function, findConsoleTenant?: Function, findConsoleCredential?: Function, findConsoleCredentialByFolder?: Function, findConsoleTenantByFolder?: Function }, encrypt?: Function, decrypt?: Function, sign?: Function, wait?: (ms: number) => Promise<void>, resolveFolder?: Function }} options
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

  async function loadPolicy(folderId, key) {
    return folderPolicy(fetchImpl, key, folderId, wait);
  }

  function openCredential(record) {
    try {
      return openConsoleCredential(record, env);
    } catch (error) {
      if (error?.code === "credential_unreadable") throw error;
      throw credentialUnreadable();
    }
  }

  /**
   * A file keeps the folder id stored on its row. That folder's credential
   * is the key for download, finish, and delete. A mapping with no readable
   * credential does not fall back to the shared account.
   */
  function keysForFolder(folderId) {
    const mapping = store?.findConsoleTenantByFolder?.(folderId) || null;
    const credential = store?.findConsoleCredentialByFolder?.(folderId)
      || (mapping?.credentialId ? store?.findConsoleCredential?.(mapping.credentialId) : null)
      || null;
    if (mapping && !credential) throw credentialUnreadable();
    if (!credential) return { apiKey, serviceKey };
    return openCredential(credential);
  }

  function keysFrom(folder) {
    if (folder?.apiKey && folder?.serviceKey) {
      return { apiKey: folder.apiKey, serviceKey: folder.serviceKey };
    }
    return keysForFolder(folder?.folderId);
  }

  async function sharedFolder({ tenantId, channelId } = {}) {
    const pinned = configuredFolderId(env);
    const space = await spaceId();
    if (pinned) {
      const sealPolicyId = await loadPolicy(pinned, apiKey);
      return {
        spaceId: space,
        folderId: pinned,
        sealPolicyId,
        name: null,
        created: false,
        isolated: false,
        apiKey,
        serviceKey,
        tenantId,
        channelId,
      };
    }
    const name = filesFolderName(env);
    const saved = store?.findConsoleFolder?.(space, name);
    if (saved?.folderId) {
      return {
        spaceId: space,
        folderId: saved.folderId,
        sealPolicyId: saved.sealPolicyId || await loadPolicy(saved.folderId, apiKey),
        name,
        created: false,
        isolated: false,
        apiKey,
        serviceKey,
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
    return {
      spaceId: space,
      name,
      folderId: opened.folderId,
      sealPolicyId: opened.sealPolicyId,
      created: opened.created,
      isolated: false,
      apiKey,
      serviceKey,
      tenantId,
      channelId,
    };
  }

  async function isolatedFolder(mapping, { tenantId, channelId } = {}) {
    const credential = mapping.credentialId
      ? store?.findConsoleCredential?.(mapping.credentialId)
      : store?.findConsoleCredentialByFolder?.(mapping.folderId);
    if (!credential) throw credentialUnreadable();
    const opened = openCredential(credential);
    const sealPolicyId = mapping.sealPolicyId || await loadPolicy(mapping.folderId, opened.apiKey);
    return {
      spaceId: mapping.spaceId,
      folderId: mapping.folderId,
      sealPolicyId,
      name: null,
      created: false,
      isolated: true,
      apiKey: opened.apiKey,
      serviceKey: opened.serviceKey,
      tenantId,
      channelId,
    };
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
    const sealPolicyId = finalized.sealPolicyId || await loadPolicy(finalized.folderId, apiKey);
    return { folderId: finalized.folderId, sealPolicyId, created: true };
  }

  async function resolveFolderForTenant(input = {}) {
    const mapping = input.tenantId ? store?.findConsoleTenant?.(input.tenantId) : null;
    if (mapping) return isolatedFolder(mapping, input);
    return sharedFolder(input);
  }

  const resolveFolder = options.resolveFolder || resolveFolderForTenant;

  async function finishUpload({ folderId, fileId, tags, apiKey: key }) {
    if (Array.isArray(tags) && tags.length) {
      await patchConsoleFileTags(fetchImpl, key, fileId, tags, wait);
    }
    const state = await pollFile(fetchImpl, key, folderId, fileId, wait);
    if (state !== "completed") throw new Error("Console upload did not complete");
  }

  return {
    resolveFolder,
    async put({ name, plain, metadata, tags, folder, onAccepted }) {
      const keys = keysFrom(folder);
      const policyId = folder.sealPolicyId || await loadPolicy(folder.folderId, keys.apiKey);
      const bytes = plain instanceof Uint8Array ? plain : Buffer.from(plain);
      const ciphertext = options.encrypt
        ? await options.encrypt(bytes, { policyId, apiKey: keys.apiKey })
        : await encryptForFolder(bytes, policyId, keys.apiKey);
      const fileId = await postCiphertext(fetchImpl, keys.apiKey, folder.folderId, {
        name,
        ciphertext,
        metadata,
        includeContentSize: false,
      }, wait);
      if (onAccepted) {
        await onAccepted({ spaceId: folder.spaceId, folderId: folder.folderId, fileId });
      }
      await finishUpload({ folderId: folder.folderId, fileId, tags, apiKey: keys.apiKey });
      return { spaceId: folder.spaceId, folderId: folder.folderId, fileId, state: "active" };
    },
    async finish({ folderId, fileId, tags }) {
      const keys = keysForFolder(folderId);
      await finishUpload({ folderId, fileId, tags, apiKey: keys.apiKey });
      return { state: "active" };
    },
    async download({ folderId, fileId, policyId }) {
      const keys = keysForFolder(folderId);
      const policy = policyId || await loadPolicy(folderId, keys.apiKey);
      const ciphertext = await downloadCiphertext(fetchImpl, keys.apiKey, folderId, fileId, wait);
      const plain = options.decrypt
        ? await options.decrypt(ciphertext, { policyId: policy, apiKey: keys.apiKey, serviceKey: keys.serviceKey })
        : await decryptForFolder(ciphertext, policy, keys.apiKey, keys.serviceKey);
      return Buffer.from(plain);
    },
    async remove({ folderId, fileId }) {
      const keys = keysForFolder(folderId);
      await deleteConsoleFile(fetchImpl, keys.apiKey, folderId, fileId, wait);
      const record = await readConsoleFile(fetchImpl, keys.apiKey, folderId, fileId, wait);
      if (!record || metadataReady(record) === "deleted") return { deleted: true };
      return { deleted: false, status: record.status || record.state || "" };
    },
  };
}
