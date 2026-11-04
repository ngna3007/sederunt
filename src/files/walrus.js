import { fileEpochs, SUI_GRPC_URL, WALRUS_AGGREGATOR, WALRUS_NETWORK, WALRUS_UPLOAD_RELAY } from "./config.js";

const RETRYABLE_NAMES = new Set([
  "RetryableWalrusClientError",
  "BehindCurrentEpochError",
  "NotEnoughSliversReceivedError",
  "NotEnoughBlobConfirmationsError",
  "NoBlobMetadataReceivedError",
  "BlobNotCertifiedError",
]);

/** True when the Walrus SDK asks the caller to reset and try the epoch again. */
export function isRetryableWalrusError(error) {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return false;
  if (error.retryable === true) return true;
  let proto = error;
  while (proto && proto !== Object.prototype) {
    const name = proto.constructor?.name;
    if (name && RETRYABLE_NAMES.has(name)) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/**
 * Already deleted or already expired is success: there is nothing left to remove.
 * Other failures stay failures so the job can retry.
 */
export function blobAlreadyGone(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  return /already[- ]deleted|not[- ]found|does not exist|no longer exists|expired|objectnotfound|deleted object|dynamic field not found/.test(text);
}

/**
 * Run one Walrus call. On a retryable epoch error, reset the client and try again.
 * @param {{ reset?: () => void, walrus?: { reset?: () => void } }} client
 */
export async function withWalrusRetry(client, fn, { attempts = 3, delayMs = 0 } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryableWalrusError(error) || attempt === attempts) throw error;
      resetClient(client);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw last;
}

function resetClient(client) {
  if (typeof client?.reset === "function") client.reset();
  else if (typeof client?.walrus?.reset === "function") client.walrus.reset();
}

/**
 * In-memory Walrus. Tests and the demo page use this. Nothing leaves the process.
 */
export function createMemoryWalrus() {
  const blobs = new Map();
  const objects = new Map();
  let seq = 0;
  const api = {
    calls: [],
    currentEpochValue: 10,
    async writeBlob({ bytes, deletable, epochs, attributes, onStep, resume }) {
      if (deletable !== true) throw new Error("blobs must be deletable");
      api.calls.push("write");
      const n = ++seq;
      const blobId = resume?.blobId || `blob-${n}`;
      const objectId = resume?.blobObjectId || `0x${n.toString(16).padStart(64, "0")}`;
      const endEpoch = api.currentEpochValue + Number(epochs || 1);
      if (onStep) {
        await onStep({ step: "encoded", blobId });
        await onStep({ step: "registered", blobId, blobObjectId: objectId, txDigest: `reg-${n}` });
        await onStep({ step: "uploaded", blobId, blobObjectId: objectId, certificate: "cert" });
        await onStep({ step: "certified", blobId, blobObjectId: objectId });
      }
      blobs.set(blobId, Buffer.from(bytes));
      objects.set(objectId, { blobId, attributes: { ...attributes }, epochs, endEpoch, deleted: false });
      return { blobId, objectId, endEpoch, deletable: true, attributes };
    },
    async readBlob({ blobId }) {
      api.calls.push("read");
      const found = blobs.get(blobId);
      if (!found) {
        const error = new Error("blob not found");
        error.code = "not_found";
        throw error;
      }
      return Buffer.from(found);
    },
    async deleteBlob({ blobObjectId }) {
      api.calls.push("delete");
      const obj = objects.get(blobObjectId);
      if (!obj || obj.deleted) return { deleted: true, alreadyGone: true };
      obj.deleted = true;
      blobs.delete(obj.blobId);
      return { deleted: true, digest: `del-${blobObjectId.slice(2, 10)}`, alreadyGone: false };
    },
    async extendBlob({ blobObjectId, epochs }) {
      api.calls.push("extend");
      const obj = objects.get(blobObjectId);
      if (!obj || obj.deleted) {
        const error = new Error("blob expired");
        throw error;
      }
      obj.endEpoch += Number(epochs || 1);
      return { endEpoch: obj.endEpoch };
    },
    async currentEpoch() {
      return api.currentEpochValue;
    },
    reset() {
      api.calls.push("reset");
    },
    object(id) {
      return objects.get(id) || null;
    },
  };
  return api;
}

/**
 * Testnet Walrus client. The service key pays gas and storage.
 * `deletable` is always true. Mainnet is refused.
 */
export function createLiveWalrus(env = {}) {
  if (String(env.WALRUS_NETWORK || WALRUS_NETWORK) !== "testnet") {
    throw new Error("Walrus files stay on testnet");
  }
  if (!env.WALRUS_SERVICE_KEY) throw new Error("Storage is paused, try later");
  let client = null;
  let signer = null;
  const epochsDefault = fileEpochs(env);

  async function ensure() {
    if (client) return;
    const [{ SuiGrpcClient }, { Ed25519Keypair }, { decodeSuiPrivateKey }, { walrus }] = await Promise.all([
      import("@mysten/sui/grpc"),
      import("@mysten/sui/keypairs/ed25519"),
      import("@mysten/sui/cryptography"),
      import("@mysten/walrus"),
    ]);
    const { secretKey } = decodeSuiPrivateKey(env.WALRUS_SERVICE_KEY);
    signer = Ed25519Keypair.fromSecretKey(secretKey);
    const sui = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_GRPC_URL });
    client = sui.$extend(walrus({
      uploadRelay: { host: WALRUS_UPLOAD_RELAY, sendTip: { max: 1_000 } },
    }));
  }

  return {
    async writeBlob({ bytes, deletable, epochs, attributes, onStep, resume }) {
      if (deletable !== true) throw new Error("blobs must be deletable");
      await ensure();
      const steps = [];
      const written = await withWalrusRetry(client, () => client.walrus.writeBlob({
        blob: bytes instanceof Uint8Array ? bytes : Buffer.from(bytes),
        deletable: true,
        epochs: epochs || epochsDefault,
        signer,
        attributes,
        resume,
        onStep: async (step) => {
          steps.push(step);
          if (onStep) await onStep(step);
        },
      }));
      const registered = steps.find((step) => step.step === "registered");
      return {
        blobId: written.blobId,
        objectId: written.blobObject?.id,
        endEpoch: written.blobObject?.storage?.end_epoch ?? null,
        deletable: true,
        registerDigest: registered?.txDigest || null,
        steps,
      };
    },
    lastReadPath: null,
    async readBlob({ blobId }) {
      await ensure();
      try {
        const bytes = await withWalrusRetry(
          client,
          () => client.walrus.readBlob({ blobId }),
          { attempts: 2, delayMs: 1000 },
        );
        this.lastReadPath = "storage-nodes";
        return Buffer.from(bytes);
      } catch (error) {
        // Some hosts cannot reach storage nodes. The testnet aggregator still serves a certified blob.
        if (!isRetryableWalrusError(error)) throw error;
        const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`);
        if (!response.ok) throw error;
        this.lastReadPath = "aggregator";
        return Buffer.from(await response.arrayBuffer());
      }
    },
    async deleteBlob({ blobObjectId }) {
      await ensure();
      try {
        const result = await client.walrus.executeDeleteBlobTransaction({ blobObjectId, signer });
        return { deleted: true, digest: result?.digest || null, alreadyGone: false };
      } catch (error) {
        if (blobAlreadyGone(error)) return { deleted: true, alreadyGone: true, digest: null };
        throw error;
      }
    },
    async extendBlob({ blobObjectId, epochs }) {
      await ensure();
      const result = await client.walrus.executeExtendBlobTransaction({
        blobObjectId,
        epochs,
        signer,
      });
      return { digest: result?.digest || null };
    },
    reset() {
      client?.walrus?.reset?.();
    },
    address() {
      return signer ? signer.toSuiAddress() : "";
    },
  };
}
