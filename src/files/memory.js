/**
 * Memory cleanup for one file.
 * Forget drops the namespace from recall. Security Delete removes the blobs
 * and needs the memory account owner's key. With no Sederunt memory account,
 * the step is skipped and is not reported as deleted.
 */

export function fileNamespace(fileId) {
  return `sederunt-file-${fileId}`;
}

export function memoryAccountFromEnv(env = {}) {
  const key = String(env.SEDERUNT_MEMWAL_KEY || "").trim();
  const accountId = String(env.SEDERUNT_MEMWAL_ACCOUNT_ID || "").trim();
  const ownerKey = String(env.SEDERUNT_MEMWAL_OWNER_KEY || "").trim();
  return {
    configured: Boolean(key && accountId && ownerKey),
    key,
    accountId,
    ownerKey,
    serverUrl: String(env.SEDERUNT_MEMWAL_SERVER || "https://relayer.memory.walrus.xyz").replace(/\/$/, ""),
  };
}

const SKIPPED_REASON = "No Sederunt Walrus Memory account is configured, so this namespace was not forgotten and Security Delete did not run";

export function createMemoryCleaner({ account, client } = {}) {
  const configured = Boolean(account?.configured && client);
  return {
    configured,
    skippedReason: SKIPPED_REASON,
    async forgetFile({ fileId, links = [] }) {
      const namespace = fileNamespace(fileId);
      if (!configured) {
        return { skipped: true, reason: SKIPPED_REASON, namespace };
      }
      const forgotten = await client.forgetNamespace({ namespace, account });
      const blobIds = links.map((link) => link.memoryBlobId).filter(Boolean);
      const objectIds = links.map((link) => link.memoryObjectId).filter(Boolean);
      const deleted = blobIds.length
        ? await client.securityDelete({ namespace, blobIds, objectIds, account })
        : { deleted: 0 };
      return { skipped: false, namespace, forgotten, deleted };
    },
  };
}

/**
 * Relayer-shaped client. Tests pass `fetchImpl`. A live call uses the
 * delegate signature for forget and the owner key for Security Delete.
 * Paths follow the Walrus Memory delete guide: forget, then challenge,
 * verify, security-deletions, submit, and poll.
 */
export function createRelayerMemoryClient({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async forgetNamespace({ namespace, account }) {
      const body = { namespace };
      const response = await signed(fetchImpl, account, "POST", "/api/forget", body);
      return response;
    },
    async securityDelete({ blobIds, account }) {
      const challenge = await ownerFetch(fetchImpl, account, "POST", "/api/security-delete/challenge", {
        address: account.address || undefined,
      });
      const signature = await signOwner(account, challenge?.message || challenge?.nonce || "");
      const verified = await ownerFetch(fetchImpl, account, "POST", "/api/security-delete/verify", {
        signature,
        nonce: challenge?.nonce || null,
      });
      const token = verified?.token;
      if (!token) throw new Error("Memory Security Delete did not return a token");
      const prepared = await bearer(fetchImpl, account, token, "POST", "/api/security-deletions", { blobIds });
      const batchId = prepared?.batchId || prepared?.batch_id;
      if (!batchId) throw new Error("Memory Security Delete did not return a batch");
      const submitSignature = await signOwner(account, prepared?.txBytes || prepared?.tx_bytes || batchId);
      await bearer(fetchImpl, account, token, "POST", `/api/security-deletions/${batchId}/submit`, {
        signature: submitSignature,
      });
      let state = null;
      for (let i = 0; i < 5; i += 1) {
        state = await bearer(fetchImpl, account, token, "GET", `/api/security-deletions/${batchId}`);
        const status = String(state?.status || "");
        if (status === "done" || status === "deleted" || status === "succeeded" || state?.terminal === true) break;
      }
      return { deleted: blobIds.length, batchId, state };
    },
  };
}

async function signed(fetchImpl, account, method, path, body) {
  const { createHash, randomUUID } = await import("node:crypto");
  const bodyStr = method === "GET" ? "" : JSON.stringify(body || {});
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const bodySha = createHash("sha256").update(bodyStr).digest("hex");
  const message = `${timestamp}.${method}.${path}.${bodySha}.${nonce}.${account.accountId}`;
  const signature = await signDelegate(account.key, message);
  const response = await fetchImpl(`${account.serverUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-public-key": signature.publicKey,
      "x-signature": signature.signature,
      "x-timestamp": timestamp,
      "x-nonce": nonce,
      "x-account-id": account.accountId,
    },
    body: method === "GET" ? undefined : bodyStr,
  });
  return readJson(response, "Memory forget failed");
}

async function ownerFetch(fetchImpl, account, method, path, body) {
  const response = await fetchImpl(`${account.serverUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return readJson(response, "Memory Security Delete failed");
}

async function bearer(fetchImpl, account, token, method, path, body) {
  const response = await fetchImpl(`${account.serverUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return readJson(response, "Memory Security Delete failed");
}

async function readJson(response, fallback) {
  if (!response?.ok && response?.status !== 202) {
    throw new Error(fallback);
  }
  if (typeof response.json === "function") return response.json();
  return {};
}

async function signDelegate(key, message) {
  const { createPrivateKey, createPublicKey, sign } = await import("node:crypto");
  const seed = delegateSeed(key);
  const privateKey = createPrivateKey({ key: ed25519Pkcs8(seed), format: "der", type: "pkcs8" });
  const signature = sign(null, Buffer.from(message), privateKey);
  const spki = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  return {
    signature: Buffer.from(signature).toString("hex"),
    publicKey: Buffer.from(spki.subarray(spki.length - 32)).toString("hex"),
  };
}

function ed25519Pkcs8(seed) {
  return Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
}

function delegateSeed(key) {
  const text = String(key || "").trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
  throw new Error("Memory delegate key is not configured");
}

async function signOwner(account, message) {
  if (!account.ownerKey) throw new Error("Memory owner key is not configured");
  if (typeof account.sign === "function") return account.sign(message);
  const { decodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  const { secretKey } = decodeSuiPrivateKey(account.ownerKey);
  const pair = Ed25519Keypair.fromSecretKey(secretKey);
  const { signature } = await pair.signPersonalMessage(new TextEncoder().encode(String(message)));
  return signature;
}
