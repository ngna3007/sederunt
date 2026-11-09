import { SuiGrpcClient } from "@mysten/sui/grpc";
import { createNativeGrpcTransport, TATUM_GATEWAY } from "./transport.js";

const OBJECT_READ = ["object_id", "version", "digest", "object_type", "owner", "contents", "previous_transaction"];
const TX_READ = ["digest", "checkpoint", "timestamp"];
const OBJECT_BATCH = 50;
const TX_BATCH = 50;

/**
 * Every Sui mainnet read goes through one governed native-gRPC client.
 * No key means no gateway call. The log records method, milliseconds, and
 * outcome. It never records the key. Cached checkpoint and transaction reads
 * are not wire calls.
 *
 * @param {{ apiKey?: string, env?: NodeJS.ProcessEnv, baseUrl?: string, exchange?: Function, timeoutMs?: number, retries?: number, rps?: number, now?: () => number, sleep?: (ms: number) => Promise<void>, random?: () => number }} [options]
 */
export function createTatumClient(options = {}) {
  const env = options.env ?? process.env;
  const apiKey = stringOrEmpty(options.apiKey ?? env.TATUM_API_KEY);
  const log = [];
  const state = { latestCheckpoint: null, latestCheckpointTime: null };
  const missing = async () => {
    throw new Error("Tatum key not set");
  };
  if (!apiKey) {
    return {
      log,
      sui: null,
      get latestCheckpoint() {
        return state.latestCheckpoint;
      },
      get latestCheckpointTime() {
        return state.latestCheckpointTime;
      },
      wireCalls() {
        return wireCalls(log);
      },
      getObject: missing,
      getObjects: missing,
      listOwnedObjects: missing,
      getTransaction: missing,
      getTransactions: missing,
      getCheckpoint: missing,
      getServiceInfo: missing,
      getAccountOwner: missing,
      refreshChain: missing,
    };
  }
  const transport = createNativeGrpcTransport({
    baseUrl: options.baseUrl || env.TATUM_GATEWAY || TATUM_GATEWAY,
    apiKey,
    exchange: options.exchange,
    timeoutMs: numberOr(options.timeoutMs, env.TATUM_TIMEOUT_MS, 8000),
    retries: integerOr(options.retries, env.TATUM_RETRIES, 3),
    rps: numberOr(options.rps, env.TATUM_RPS, 3),
    now: options.now,
    sleep: options.sleep,
    random: options.random,
    log,
  });
  const sui = new SuiGrpcClient({ network: "mainnet", transport });
  const client = {
    log,
    sui,
    get latestCheckpoint() {
      return state.latestCheckpoint;
    },
    get latestCheckpointTime() {
      return state.latestCheckpointTime;
    },
    wireCalls() {
      return wireCalls(log);
    },
    async getObject(objectId) {
      const finished = await sui.ledgerService.getObject({
        objectId,
        readMask: { paths: OBJECT_READ },
      });
      return finishObject(finished.response?.object, client);
    },
    async getObjects(objectIds) {
      const list = (Array.isArray(objectIds) ? objectIds : []).filter((id) => typeof id === "string" && id);
      if (list.length === 0) return [];
      const unique = [...new Set(list)];
      const raw = new Map();
      for (const group of chunks(unique, OBJECT_BATCH)) {
        const finished = await sui.ledgerService.batchGetObjects({
          requests: group.map((objectId) => ({ objectId })),
          readMask: { paths: OBJECT_READ },
        });
        const rows = finished.response?.objects ?? [];
        group.forEach((id, index) => {
          const row = rows[index];
          const object = row?.result?.oneofKind === "object" ? row.result.object : null;
          raw.set(id, shapeObject(object));
        });
      }
      const digests = [...new Set([...raw.values()].flatMap((object) => object?.previousTransaction ? [object.previousTransaction] : []))];
      const certifying = new Map();
      if (digests.length > 0) {
        try {
          const loaded = await client.getTransactions(digests);
          digests.forEach((digest, index) => {
            if (loaded[index]) certifying.set(digest, loaded[index]);
          });
        } catch {
          // The object is still the proof. A missing checkpoint stays unknown.
        }
      }
      return list.map((id) => {
        const shaped = raw.get(id);
        if (!shaped) return null;
        return applyCertifying({ ...shaped }, certifying.get(shaped.previousTransaction));
      });
    },
    async listOwnedObjects({ owner, type, cursor, limit = 50 } = {}) {
      return sui.listOwnedObjects({
        owner,
        type,
        cursor: cursor || undefined,
        limit,
        include: { content: true, previousTransaction: true },
      });
    },
    async getTransaction(digest) {
      // The raw ledger call asks for three fields. The SDK's getTransaction
      // wraps the result as { Transaction } and reads more than the proof needs.
      const finished = await sui.ledgerService.getTransaction({
        digest,
        readMask: { paths: TX_READ },
      });
      return transactionView(finished.response?.transaction, digest);
    },
    async getTransactions(digests) {
      const list = (Array.isArray(digests) ? digests : []).filter((digest) => typeof digest === "string" && digest);
      if (list.length === 0) return [];
      const unique = [...new Set(list)];
      const found = new Map();
      for (const group of chunks(unique, TX_BATCH)) {
        const finished = await sui.ledgerService.batchGetTransactions({
          digests: group,
          readMask: { paths: TX_READ },
        });
        const rows = finished.response?.transactions ?? [];
        group.forEach((digest, index) => {
          const row = rows[index];
          const tx = row?.result?.oneofKind === "transaction" ? row.result.transaction : null;
          if (tx) found.set(digest, transactionView(tx, digest));
        });
      }
      return list.map((digest) => found.get(digest) ?? null);
    },
    async getCheckpoint(sequence) {
      const finished = await sui.ledgerService.getCheckpoint({
        checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: BigInt(sequence) },
        readMask: { paths: ["sequence_number", "summary"] },
      });
      const checkpoint = finished.response?.checkpoint;
      const height = checkpoint?.sequenceNumber == null ? null : Number(checkpoint.sequenceNumber);
      return {
        sequence: Number.isSafeInteger(height) ? height : null,
        timestamp: timestampIso(checkpoint?.summary?.timestamp),
      };
    },
    async getAccountOwner(accountId) {
      // The MemWalAccount object names the owner wallet. Blobs written through
      // the relayer for this account are owned by that wallet.
      const found = await sui.getObject({ objectId: accountId, include: { json: true } });
      const owner = found?.object?.json?.owner;
      return typeof owner === "string" && /^0x[0-9a-fA-F]{64}$/.test(owner) ? owner : null;
    },
    async getServiceInfo() {
      const finished = await sui.ledgerService.getServiceInfo({});
      const response = finished.response;
      const height = response?.checkpointHeight == null ? null : Number(response.checkpointHeight);
      return {
        checkpoint: Number.isSafeInteger(height) ? height : null,
        timestamp: timestampIso(response?.timestamp),
      };
    },
    async refreshChain() {
      const info = await client.getServiceInfo();
      state.latestCheckpoint = info.checkpoint;
      state.latestCheckpointTime = info.timestamp;
      if (info.checkpoint != null) {
        try {
          const checkpoint = await client.getCheckpoint(info.checkpoint);
          if (checkpoint.timestamp) state.latestCheckpointTime = checkpoint.timestamp;
        } catch {
          // The tip height is still known. The timestamp stays from the service info.
        }
      }
      return { checkpoint: state.latestCheckpoint, timestamp: state.latestCheckpointTime };
    },
  };
  return client;
}

export function wireCalls(log) {
  return (Array.isArray(log) ? log : []).filter((entry) => entry && entry.outcome !== "cached").length;
}

async function finishObject(object, client) {
  const shaped = shapeObject(object);
  if (!shaped) {
    const error = new Error("Tatum read failed");
    error.code = "not-found";
    throw error;
  }
  if (!shaped.previousTransaction) return shaped;
  try {
    return applyCertifying(shaped, await client.getTransaction(shaped.previousTransaction));
  } catch {
    return shaped;
  }
}

function shapeObject(object) {
  if (!object?.objectId) return null;
  const versionNumber = object.version == null ? null : Number(object.version);
  const ownerKind = object.owner?.kind;
  const ownerAddress = ownerKind === 1 || ownerKind === "ADDRESS"
    ? (typeof object.owner?.address === "string" ? object.owner.address : null)
    : null;
  return {
    objectId: object.objectId,
    version: Number.isSafeInteger(versionNumber) ? versionNumber : null,
    digest: object.digest || null,
    objectType: object.objectType || null,
    ownerAddress,
    content: object.contents?.value ? Buffer.from(object.contents.value) : null,
    previousTransaction: object.previousTransaction || null,
    checkpoint: null,
    checkpointTime: null,
    certifyingDigest: object.previousTransaction || null,
  };
}

function applyCertifying(object, tx) {
  if (!object || !tx) return object;
  object.certifyingDigest = tx.digest || object.previousTransaction;
  object.checkpoint = tx.checkpoint;
  object.checkpointTime = tx.timestampMs == null ? null : new Date(tx.timestampMs).toISOString();
  return object;
}

function transactionView(tx, digest) {
  const checkpoint = tx?.checkpoint == null ? null : Number(tx.checkpoint);
  const at = timestampIso(tx?.timestamp);
  return {
    digest: typeof tx?.digest === "string" ? tx.digest : digest,
    checkpoint: Number.isSafeInteger(checkpoint) ? checkpoint : null,
    timestampMs: at ? Date.parse(at) : null,
  };
}

function chunks(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

function timestampIso(timestamp) {
  if (!timestamp || timestamp.seconds == null) return null;
  const ms = Number(timestamp.seconds) * 1000 + Math.floor(Number(timestamp.nanos || 0) / 1e6);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function numberOr(override, envValue, fallback) {
  if (Number.isFinite(override) && override > 0) return override;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function integerOr(override, envValue, fallback) {
  if (Number.isInteger(override) && override >= 0) return override;
  const parsed = Number(envValue);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  return fallback;
}
