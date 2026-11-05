import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, fromHex } from "@mysten/sui/utils";
import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";

const API = "https://api.console.walrus.xyz";
const FULLNODE_URL = "https://fullnode.mainnet.sui.io:443";
const ORIGINAL_PACKAGE_ID = "0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c";
const LATEST_PACKAGE_ID = ORIGINAL_PACKAGE_ID;
const BUCKET_REGISTRY_ID = "0x871f3d0341f36101ff0b30cd01dbe363f8d89d7f004df80e8084752d2f496958";
const SEAL_COMMITTEE_OBJECT_ID = "0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595";
// The committee object is one key server. Its internal threshold stays inside that object.
const SEAL_THRESHOLD = 1;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const METADATA_MAX_BYTES = 8 * 1024;
const RATE_RETRIES = 3;
const RATE_WAIT_CAP_MS = 60_000;

const SealIdentity = bcs.struct("SealIdentity", {
  policyObjectId: bcs.Address,
  nonce: bcs.fixedArray(32, bcs.u8()),
});

/**
 * The sentence lives in Walrus Memory. The Console tab is the metadata list.
 * A read-only key and a key-admin key cannot upload. Private folders store
 * Seal ciphertext, so upload encrypts and download decrypts on this machine.
 *
 * @param {{ scope?: string, apiKey?: string, serviceKey?: string, folderId?: string, fetch?: typeof fetch, encrypt?: Function, decrypt?: Function, wait?: (ms: number) => Promise<void> }} [options]
 */
export function createConsoleAdapter(options = {}) {
  const scope = options.scope || process.env.CONSOLE_KEY_SCOPE || "";
  const apiKey = options.apiKey ?? process.env.CONSOLE_API_KEY ?? "";
  const serviceKey = options.serviceKey ?? process.env.CONSOLE_SERVICE_PRIVATE_KEY ?? "";
  const folderId = options.folderId || process.env.CONSOLE_FOLDER_ID || "";
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  const fetchImpl = options.fetch || fetch;
  const calls = [];
  return {
    calls,
    async upload(input) {
      if (scope === "read_only" || scope === "key_admin") {
        throw new Error("A read-only key cannot upload");
      }
      calls.push(input?.name ?? "");
      if (!apiKey || !serviceKey || !folderId) throw new Error("Console upload is not configured");
      const name = String(input?.name || "note.txt");
      const plain = toBytes(input?.bytes ?? "");
      if (plain.byteLength > maxBytes) throw new Error("payload_too_large");
      const policyId = await folderPolicy(fetchImpl, apiKey, folderId, options.wait);
      const ciphertext = options.encrypt
        ? await options.encrypt(plain, { policyId, apiKey })
        : await encryptForFolder(plain, policyId, apiKey);
      const fileId = await postFile(fetchImpl, apiKey, folderId, name, plain.byteLength, ciphertext, options.wait);
      const state = await pollFile(fetchImpl, apiKey, folderId, fileId, options.wait);
      if (state !== "completed") throw new Error("Console upload did not complete");
      return { id: fileId, folderId, state };
    },
    async download(input) {
      if (!apiKey || !serviceKey || !folderId) return null;
      const fileId = input?.id;
      if (!fileId) return null;
      const policyId = await folderPolicy(fetchImpl, apiKey, folderId, options.wait);
      const ciphertext = await downloadCiphertext(fetchImpl, apiKey, folderId, fileId, options.wait);
      const plain = options.decrypt
        ? await options.decrypt(ciphertext, { policyId, apiKey, serviceKey })
        : await decryptForFolder(ciphertext, policyId, apiKey, serviceKey);
      return new TextDecoder().decode(plain);
    },
  };
}

export const CONSOLE_TAB = "The sentence lives in Walrus Memory. The Console tab is the metadata list.";

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  return new TextEncoder().encode(String(value));
}

export function retryAfterMs(header, now = Date.now()) {
  if (header == null || String(header).trim() === "") return 1000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RATE_WAIT_CAP_MS);
  const date = Date.parse(String(header));
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - now), RATE_WAIT_CAP_MS);
  return 1000;
}

async function send(fetchImpl, url, init, wait) {
  let response;
  for (let attempt = 0; attempt <= RATE_RETRIES; attempt += 1) {
    response = await fetchImpl(url, init);
    if (response.status !== 429 || attempt === RATE_RETRIES) return response;
    const header = response.headers?.get?.("retry-after") ?? response.headers?.get?.("Retry-After");
    await pause(wait, retryAfterMs(header));
  }
  return response;
}

export async function folderPolicy(fetchImpl, apiKey, folderId, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}`, {
    headers: auth(apiKey),
  }, wait);
  if (!response.ok) throw new Error("Console folder is not readable");
  const body = await response.json();
  const policyId = body?.data?.seal_policy_id;
  if (typeof policyId !== "string" || !policyId) throw new Error("Console folder has no Seal policy");
  return policyId;
}

export async function listConsoleSpaces(fetchImpl, apiKey, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/spaces`, { headers: auth(apiKey) }, wait);
  if (!response.ok) throw new Error("Console space is not readable");
  const body = await response.json();
  return Array.isArray(body?.data) ? body.data : [];
}

export function pickConsoleSpace(spaces) {
  const list = Array.isArray(spaces) ? spaces : [];
  return list.find((space) => space?.type === "personal" && space.id) || list.find((space) => space?.id) || null;
}

export async function listConsoleFolders(fetchImpl, apiKey, spaceId, name, wait) {
  const query = new URLSearchParams({ limit: "100" });
  if (name) query.set("q", name);
  const response = await send(fetchImpl, `${API}/api/v1/spaces/${encodeURIComponent(spaceId)}/buckets?${query}`, {
    headers: auth(apiKey),
  }, wait);
  if (!response.ok) throw new Error("Console folders are not readable");
  const body = await response.json();
  return Array.isArray(body?.buckets) ? body.buckets : [];
}

export async function reserveConsoleFolder(fetchImpl, apiKey, spaceId, name, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/spaces/${encodeURIComponent(spaceId)}/buckets`, {
    method: "POST",
    headers: { ...auth(apiKey), "content-type": "application/json" },
    body: JSON.stringify({ name, scope: "private" }),
  }, wait);
  if (response.status === 409) return { conflict: true };
  if (response.status === 422) {
    const error = new Error("plan_limit_exceeded");
    error.code = "plan_limit_exceeded";
    throw error;
  }
  if (response.status !== 201) throw new Error("Console folder was not reserved");
  const body = await response.json();
  if (!body?.bucket_id || !body?.bytes) throw new Error("Console folder was not reserved");
  return {
    conflict: false,
    folderId: body.bucket_id,
    bytes: body.bytes,
    digest: body.digest || "",
    state: body.state || body.provisioning_state || "pending_policy",
  };
}

export async function signConsoleReserve(serviceKey, bytesB64) {
  const { secretKey } = decodeSuiPrivateKey(serviceKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const { signature } = await keypair.signTransaction(fromBase64(bytesB64));
  return signature;
}

export async function finalizeConsoleFolder(fetchImpl, apiKey, folderId, signature, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/finalize`, {
    method: "POST",
    headers: { ...auth(apiKey), "content-type": "application/json" },
    body: JSON.stringify({ signature }),
  }, wait);
  if (!response.ok) throw new Error("Console folder was not finalized");
  const body = await response.json();
  return {
    folderId: body?.bucket_id || folderId,
    sealPolicyId: body?.seal_policy_id || "",
    state: body?.state || "",
  };
}

async function postFile(fetchImpl, apiKey, folderId, name, contentSize, ciphertext, wait, extra = {}) {
  return postCiphertext(fetchImpl, apiKey, folderId, {
    name,
    ciphertext,
    contentSize,
    metadata: extra.metadata,
    includeContentSize: extra.includeContentSize !== false,
  }, wait);
}

export async function postCiphertext(fetchImpl, apiKey, folderId, input, wait) {
  const encodedMeta = input.metadata == null
    ? ""
    : (typeof input.metadata === "string" ? input.metadata : JSON.stringify(input.metadata));
  if (encodedMeta && Buffer.byteLength(encodedMeta) > METADATA_MAX_BYTES) {
    const error = new Error("metadata_too_large");
    error.code = "metadata_too_large";
    throw error;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const form = new FormData();
    form.append("file", new Blob([input.ciphertext]), input.name);
    form.append("name", input.name);
    if (input.includeContentSize !== false && input.contentSize != null) {
      form.append("contentSize", String(input.contentSize));
    }
    if (encodedMeta) form.append("metadata", encodedMeta);
    const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/files`, {
      method: "POST",
      headers: auth(apiKey),
      body: form,
    }, wait);
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (body?.code === "mirror_missing_grant" && attempt < 7) {
        await pause(wait, 2000);
        continue;
      }
    }
    if (response.status === 413) {
      const error = new Error("payload_too_large");
      error.code = "payload_too_large";
      throw error;
    }
    if (response.status === 422) {
      const error = new Error("plan_limit_exceeded");
      error.code = "plan_limit_exceeded";
      throw error;
    }
    if (response.status !== 202) throw new Error("Console upload was not accepted");
    const body = await response.json();
    const fileId = body?.data?.id;
    if (typeof fileId !== "string" || !fileId) throw new Error("Console upload was not accepted");
    return fileId;
  }
  throw new Error("Console upload was not accepted");
}

export async function patchConsoleFileTags(fetchImpl, apiKey, fileId, tags, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { ...auth(apiKey), "content-type": "application/json" },
    body: JSON.stringify({ tags }),
  }, wait);
  if (!response.ok) throw new Error("Console tags were not saved");
  return response.json().catch(() => ({}));
}

export async function pollFile(fetchImpl, apiKey, folderId, fileId, wait) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/files/${encodeURIComponent(fileId)}/status`, {
      headers: auth(apiKey),
    }, wait);
    if (response.status === 404) {
      const record = await readConsoleFile(fetchImpl, apiKey, folderId, fileId, wait);
      const ready = metadataReady(record);
      if (ready === "completed" || ready === "failed") return ready;
    } else if (!response.ok) {
      throw new Error("Console upload did not complete");
    } else {
      const body = await response.json();
      const state = body?.data?.state;
      if (state === "completed" || state === "failed") return state;
    }
    await pause(wait, 1000);
  }
  throw new Error("Console upload did not complete");
}

export async function readConsoleFile(fetchImpl, apiKey, folderId, fileId, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/files/${encodeURIComponent(fileId)}`, {
    headers: auth(apiKey),
  }, wait);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Console file is not readable");
  const body = await response.json();
  return body?.data || null;
}

export function metadataReady(record) {
  if (!record) return "";
  const values = [record.status, record.state].filter(Boolean).map((value) => String(value).toLowerCase());
  if (values.includes("failed")) return "failed";
  if (values.includes("deleted")) return "deleted";
  if (values.includes("active") || values.includes("completed")) return "completed";
  return "";
}

export async function deleteConsoleFile(fetchImpl, apiKey, folderId, fileId, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: auth(apiKey),
  }, wait);
  if (response.status === 204 || response.status === 404) return { accepted: true, missing: response.status === 404 };
  throw new Error("Console delete was not accepted");
}

export async function downloadCiphertext(fetchImpl, apiKey, folderId, fileId, wait) {
  const response = await send(fetchImpl, `${API}/api/v1/buckets/${encodeURIComponent(folderId)}/files/${encodeURIComponent(fileId)}/download`, {
    headers: auth(apiKey),
    redirect: "manual",
  }, wait);
  if (response.status !== 307 && response.status !== 302) throw new Error("Console download was not ready");
  const location = response.headers.get("location");
  if (!location) throw new Error("Console download was not ready");
  const target = location.startsWith("http://") || location.startsWith("https://")
    ? location
    : new URL(location, API).toString();
  // The signed URL is the ciphertext. The API key must not follow the redirect.
  const file = await fetchImpl(target);
  if (!file.ok) throw new Error("Console download was not ready");
  return new Uint8Array(await file.arrayBuffer());
}

function auth(apiKey) {
  return { authorization: `Bearer ${apiKey}` };
}

function pause(wait, ms) {
  if (wait) return wait(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sealClient(apiKey) {
  // TODO(tatum): route this Sui client through the Tatum gRPC gateway once feat/hackathon-tatum lands.
  const suiClient = new SuiGrpcClient({ network: "mainnet", baseUrl: FULLNODE_URL });
  const seal = new SealClient({
    suiClient,
    serverConfigs: [{
      objectId: SEAL_COMMITTEE_OBJECT_ID,
      weight: 1,
      aggregatorUrl: `${API}/api/v1/seal/aggregator`,
      apiKeyName: "Authorization",
      apiKey: `Bearer ${apiKey}`,
    }],
    verifyKeyServers: false,
  });
  return { suiClient, seal };
}

function identityFor(policyId) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)));
  const id = SealIdentity.serialize({ policyObjectId: policyId, nonce }).toHex();
  return id;
}

export async function encryptForFolder(plain, policyId, apiKey) {
  const { seal } = sealClient(apiKey);
  const { encryptedObject } = await seal.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: ORIGINAL_PACKAGE_ID,
    id: identityFor(policyId),
    data: plain,
  });
  return encryptedObject;
}

function serviceKeypair(serviceKey) {
  const { secretKey } = decodeSuiPrivateKey(serviceKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export async function decryptForFolder(ciphertext, policyId, apiKey, serviceKey) {
  const { suiClient, seal } = sealClient(apiKey);
  const keypair = serviceKeypair(serviceKey);
  const parsed = EncryptedObject.parse(ciphertext);
  const idHex = parsed.id.startsWith("0x") ? parsed.id : `0x${parsed.id}`;
  const tx = new Transaction();
  tx.moveCall({
    target: `${LATEST_PACKAGE_ID}::bucket_policy::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(idHex))),
      tx.object(BUCKET_REGISTRY_ID),
      tx.object(policyId),
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
  const sessionKey = await SessionKey.create({
    address: keypair.toSuiAddress(),
    packageId: ORIGINAL_PACKAGE_ID,
    ttlMin: 10,
    suiClient,
    signer: keypair,
  });
  const plain = await seal.decrypt({ data: ciphertext, sessionKey, txBytes });
  return new Uint8Array(plain);
}
