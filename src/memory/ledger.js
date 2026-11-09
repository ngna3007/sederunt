import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../.local/ledgers", import.meta.url)));

function fileFor(accountId) {
  const name = createHash("sha256").update(String(accountId)).digest("hex");
  return resolve(root, name, "record.json");
}

async function readRecord(accountId) {
  try {
    return JSON.parse(await readFile(fileFor(accountId), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeRecord(accountId, record) {
  const file = fileFor(accountId);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record), { mode: 0o600 });
}

function copyAccess(access) {
  if (!access || typeof access.id !== "string" || typeof access.roomId !== "string") return null;
  const speaker = typeof access.speaker === "string" ? access.speaker.trim() : "";
  if (!access.id || !access.roomId || !speaker) return null;
  return { id: access.id, roomId: access.roomId, speaker };
}

function delegatesOf(record, delegateKey) {
  if (Array.isArray(record.delegates) && record.delegates.length > 0) return record.delegates;
  return record.delegateKey ? [record.delegateKey] : [delegateKey];
}

function allowed(record, delegateKey) {
  return delegatesOf(record, delegateKey).includes(delegateKey);
}

/**
 * One company account on disk. index returns the invite set without the
 * sentence. recall returns the sentence only for a delegate that is still
 * on the account. The same idempotency key does not store a second copy.
 */
export function ledgerMemory({ accountId, delegateKey }) {
  async function load() {
    const record = await readRecord(accountId) ?? {
      delegateKey,
      delegates: [delegateKey],
      documents: [],
      calls: [],
    };
    if (!Array.isArray(record.delegates)) record.delegates = delegatesOf(record, delegateKey);
    return record;
  }

  return {
    async remember(input) {
      if (!accountId || !delegateKey) throw new Error("Company credentials are not set");
      const record = await load();
      if (!allowed(record, delegateKey)) throw new Error("Delegate does not match this account");
      const key = typeof input?.idempotencyKey === "string" ? input.idempotencyKey : "";
      const existing = key ? record.documents.find((doc) => doc.idempotencyKey === key) : null;
      if (existing) return { blobId: existing.blobId ?? null };
      record.documents.push({ ...input, blobId: null });
      await writeRecord(accountId, record);
      return { blobId: null };
    },
    async index() {
      const record = await readRecord(accountId);
      if (!record || !allowed(record, delegateKey)) return [];
      return record.documents.map((doc) => ({
        kind: doc.kind,
        blobId: doc.blobId ?? null,
        idempotencyKey: doc.idempotencyKey,
        decision: doc.decision ? { ...doc.decision, text: "" } : null,
        actionItem: doc.actionItem?.actionRecord ? structuredClone(doc.actionItem) : null,
        preference: doc.preference ? { ...doc.preference } : null,
        roomSetting: doc.roomSetting ? { ...doc.roomSetting } : null,
        expiry: doc.expiry ? { ...doc.expiry } : null,
        room: doc.room ? { ...doc.room } : null,
        access: copyAccess(doc.access),
      }));
    },
    async recall() {
      const record = await readRecord(accountId);
      if (!record || !allowed(record, delegateKey)) return [];
      return record.documents.map((doc) => ({ ...doc }));
    },
    async addDelegate(key) {
      if (!key) return;
      const record = await load();
      if (!record.delegates.includes(key)) record.delegates.push(key);
      await writeRecord(accountId, record);
    },
    async removeDelegate(key) {
      const record = await load();
      record.delegates = record.delegates.filter((item) => item !== key);
      await writeRecord(accountId, record);
    },
    async attachConnector(roomId, connectorId) {
      const record = await load();
      if (!allowed(record, delegateKey)) throw new Error("Delegate does not match this account");
      for (const doc of record.documents) {
        if (doc?.decision?.roomId === roomId) doc.decision.connectorId = connectorId;
      }
      await writeRecord(accountId, record);
    },
  };
}

export async function appendConnectorCall(accountId, name) {
  if (!accountId || !name) return;
  const record = await readRecord(accountId);
  if (!record) return;
  record.calls = Array.isArray(record.calls) ? record.calls : [];
  record.calls.push(name);
  await writeRecord(accountId, record);
}

export async function connectorCalls(accountId) {
  const record = await readRecord(accountId);
  return Array.isArray(record?.calls) ? [...record.calls] : [];
}

export function ledgerDirectory(accountId) {
  return dirname(fileFor(accountId));
}
