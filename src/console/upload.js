import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
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
      const policyId = await folderPolicy(fetchImpl, apiKey, folderId);
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
      const policyId = await folderPolicy(fetchImpl, apiKey, folderId);
      const ciphertext = await downloadCiphertext(fetchImpl, apiKey, folderId, fileId);
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

async function folderPolicy(fetchImpl, apiKey, folderId) {
  const response = await fetchImpl(`${API}/api/v1/buckets/${folderId}`, {
    headers: auth(apiKey),
  });
  if (!response.ok) throw new Error("Console folder is not readable");
  const body = await response.json();
  const policyId = body?.data?.seal_policy_id;
  if (typeof policyId !== "string" || !policyId) throw new Error("Console folder has no Seal policy");
  return policyId;
}

async function postFile(fetchImpl, apiKey, folderId, name, contentSize, ciphertext, wait) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const form = new FormData();
    form.append("file", new Blob([ciphertext]), name);
    form.append("name", name);
    form.append("contentSize", String(contentSize));
    const response = await fetchImpl(`${API}/api/v1/buckets/${folderId}/files`, {
      method: "POST",
      headers: auth(apiKey),
      body: form,
    });
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (body?.code === "mirror_missing_grant" && attempt < 7) {
        await pause(wait, 2000);
        continue;
      }
    }
    if (response.status !== 202) throw new Error("Console upload was not accepted");
    const body = await response.json();
    const fileId = body?.data?.id;
    if (typeof fileId !== "string" || !fileId) throw new Error("Console upload was not accepted");
    return fileId;
  }
  throw new Error("Console upload was not accepted");
}

async function pollFile(fetchImpl, apiKey, folderId, fileId, wait) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetchImpl(`${API}/api/v1/buckets/${folderId}/files/${fileId}/status`, {
      headers: auth(apiKey),
    });
    if (response.status === 404) {
      const meta = await fetchImpl(`${API}/api/v1/buckets/${folderId}/files/${fileId}`, {
        headers: auth(apiKey),
      });
      if (meta.ok) {
        const body = await meta.json();
        if (body?.data?.status === "active") return "completed";
      }
      throw new Error("Console upload did not complete");
    }
    if (!response.ok) throw new Error("Console upload did not complete");
    const body = await response.json();
    const state = body?.data?.state;
    if (state === "completed" || state === "failed") return state;
    await pause(wait, 1000);
  }
  throw new Error("Console upload did not complete");
}

async function downloadCiphertext(fetchImpl, apiKey, folderId, fileId) {
  const response = await fetchImpl(`${API}/api/v1/buckets/${folderId}/files/${fileId}/download`, {
    headers: auth(apiKey),
    redirect: "manual",
  });
  if (response.status !== 307 && response.status !== 302) throw new Error("Console download was not ready");
  const location = response.headers.get("location");
  if (!location) throw new Error("Console download was not ready");
  const file = await fetchImpl(location);
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

async function encryptForFolder(plain, policyId, apiKey) {
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

async function decryptForFolder(ciphertext, policyId, apiKey, serviceKey) {
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
