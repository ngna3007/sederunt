import { SuiGrpcClient } from "@mysten/sui/grpc";
import { createNativeGrpcTransport, TATUM_GATEWAY } from "./transport.js";

const OBJECT_READ = ["object_id", "version", "digest", "object_type", "owner", "contents", "previous_transaction"];

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
      listOwnedObjects: missing,
      getTransaction: missing,
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
      return normalizeObject(finished.response?.object, client);
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
        readMask: { paths: ["digest", "checkpoint", "timestamp"] },
      });
      const tx = finished.response?.transaction;
      const checkpoint = tx?.checkpoint == null ? null : Number(tx.checkpoint);
      const at = timestampIso(tx?.timestamp);
      return {
        digest: typeof tx?.digest === "string" ? tx.digest : digest,
        checkpoint: Number.isSafeInteger(checkpoint) ? checkpoint : null,
        timestampMs: at ? Date.parse(at) : null,
      };
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

async function normalizeObject(object, client) {
  if (!object?.objectId) {
    const error = new Error("Tatum read failed");
    error.code = "not-found";
    throw error;
  }
  const versionNumber = object.version == null ? null : Number(object.version);
  const ownerKind = object.owner?.kind;
  const ownerAddress = ownerKind === 1 || ownerKind === "ADDRESS"
    ? (typeof object.owner?.address === "string" ? object.owner.address : null)
    : null;
  const content = object.contents?.value ? Buffer.from(object.contents.value) : null;
  let checkpoint = null;
  let checkpointTime = null;
  let certifyingDigest = null;
  if (object.previousTransaction) {
    certifyingDigest = object.previousTransaction;
    try {
      const tx = await client.getTransaction(object.previousTransaction);
      certifyingDigest = tx.digest || object.previousTransaction;
      checkpoint = tx.checkpoint;
      checkpointTime = tx.timestampMs == null ? null : new Date(tx.timestampMs).toISOString();
    } catch {
      checkpoint = null;
      checkpointTime = null;
    }
  }
  return {
    objectId: object.objectId,
    version: Number.isSafeInteger(versionNumber) ? versionNumber : null,
    digest: object.digest || null,
    objectType: object.objectType || null,
    ownerAddress,
    content,
    previousTransaction: object.previousTransaction || null,
    checkpoint,
    checkpointTime,
    certifyingDigest,
  };
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
