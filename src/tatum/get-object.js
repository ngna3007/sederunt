import { locateMemory } from "../memory/locate.js";
import { createTatumClient } from "./client.js";
import { verifyMemory } from "./proof.js";

const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;

/**
 * LedgerService/GetObject through the shared Tatum client. No key means no
 * call. A failed read throws, which the gate renders as unknown. There is no
 * public-fullnode fallback. A Walrus blob id is resolved to its Blob object
 * first. Blob objects do not carry the sentence, so text stays empty.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ exchange?: Function, locate?: Function, client?: object, retries?: number, sleep?: Function, now?: Function, random?: Function, rps?: number, timeoutMs?: number }} [options]
 */
export function createTatumReader(env = process.env, options = {}) {
  const calls = [];
  const key = typeof env?.TATUM_API_KEY === "string" ? env.TATUM_API_KEY : "";
  const client = key
    ? (options.client ?? createTatumClient({
      apiKey: key,
      env,
      exchange: options.exchange,
      retries: options.retries,
      sleep: options.sleep,
      now: options.now,
      random: options.random,
      rps: options.rps,
      timeoutMs: options.timeoutMs,
    }))
    : null;
  const locate = options.locate ?? null;
  // A Blob object id never changes for a blob id, so a found location is
  // kept for the life of the reader. A later read is one GetObject.
  const located = new Map();
  const accountId = typeof env?.COMPANY_MEMWAL_ACCOUNT_ID === "string" ? env.COMPANY_MEMWAL_ACCOUNT_ID : "";
  let accountOwner = null;
  const ownerFor = async (hints) => {
    if (typeof hints.owner === "string" && hints.owner) return hints.owner;
    if (!accountId || typeof client?.getAccountOwner !== "function") return null;
    if (!accountOwner) {
      accountOwner = client.getAccountOwner(accountId).catch(() => {
        accountOwner = null;
        return null;
      });
    }
    return accountOwner;
  };
  return {
    calls,
    client,
    get log() {
      return client?.log ?? [];
    },
    get latestCheckpoint() {
      return client?.latestCheckpoint ?? null;
    },
    async refreshChain() {
      if (!client) return null;
      return client.refreshChain();
    },
    async getObject(id, hints = {}) {
      calls.push(id);
      if (!client) throw new Error("Tatum key not set");
      let target = located.get(id) || null;
      if (!target) {
        try {
          const owner = await ownerFor(hints);
          target = { ...(await resolveTarget(id, locate, client, owner ? { ...hints, owner } : hints)), owner };
        } catch (error) {
          throw readerError(error);
        }
        if (target.objectId && target.blobId) located.set(id, target);
      }
      let object;
      try {
        object = await client.getObject(target.objectId);
      } catch (error) {
        throw readerError(error);
      }
      const checkpoint = Number.isInteger(object.checkpoint) ? object.checkpoint : target.checkpoint;
      const checkpointTime = object.checkpointTime || target.checkpointTime || null;
      const viewed = { ...object, checkpoint, checkpointTime };
      const proof = verifyMemory({
        object: viewed,
        blobId: target.blobId || hints.blobId || null,
        owner: hints.owner || target.owner || null,
      });
      return {
        text: "",
        checkpoint,
        objectId: object.objectId,
        objectType: object.objectType,
        version: object.version,
        digest: object.digest,
        proof,
      };
    },
  };
}

async function resolveTarget(id, locate, client, hints) {
  if (OBJECT_ID.test(id)) return { objectId: id, checkpoint: null, blobId: hints.blobId || null };
  if (typeof hints.objectId === "string" && OBJECT_ID.test(hints.objectId)) {
    return { objectId: hints.objectId, checkpoint: null, blobId: id };
  }
  let found;
  try {
    found = locate
      ? await locate(id, hints)
      : await locateMemory(id, { tatum: client, owner: hints.owner, objectId: hints.objectId });
  } catch (error) {
    const wrapped = new Error("Tatum read failed");
    wrapped.code = "grpc";
    throw wrapped;
  }
  if (!found?.objectId || !OBJECT_ID.test(found.objectId)) {
    const error = new Error("Tatum read failed");
    error.code = "not-certified";
    throw error;
  }
  return {
    objectId: found.objectId,
    checkpoint: Number.isInteger(found.checkpoint) ? found.checkpoint : null,
    checkpointTime: found.checkpointTime || null,
    blobId: id,
  };
}

function readerError(error) {
  if (error?.message === "Tatum key not set") return error;
  const code = error?.code;
  if (code === "not-certified") {
    const wrapped = new Error("Tatum read failed");
    wrapped.code = "not-certified";
    return wrapped;
  }
  if (code === "rate-limit" || code === "RESOURCE_EXHAUSTED") {
    const wrapped = new Error("Tatum read failed");
    wrapped.code = "rate-limit";
    return wrapped;
  }
  const wrapped = new Error("Tatum read failed");
  wrapped.code = code === "not-found" ? "not-found" : "grpc";
  return wrapped;
}
