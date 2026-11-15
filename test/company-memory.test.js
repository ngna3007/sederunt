import assert from "node:assert/strict";
import test from "node:test";
import {
  indexCompany,
  recallCompany,
  recallHitCount,
  rememberCompany,
  rememberPersonal,
} from "../src/memory/company.js";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = {
  COMPANY_MEMWAL_KEY: "test-company-key",
  COMPANY_MEMWAL_ACCOUNT_ID: "test-company-account",
};

const BLOB = Buffer.alloc(32, 7).toString("base64url");
const OBJECT = `0x${"cd".repeat(32)}`;

function fakeMemwal(rows = []) {
  const stored = [...rows];
  return {
    stored,
    async rememberAndWait(text) {
      stored.push(String(text));
      return {
        blob_id: BLOB,
        namespace: "sederunt",
        owner: `0x${"ab".repeat(32)}`,
        object_id: OBJECT,
        expiryEpoch: 42,
      };
    },
    async recall({ query } = {}) {
      const hits = stored.map((text, index) => ({ text, blob_id: `blob-${index + 1}`, distance: 0.2 }));
      if (query === "broken") hits.push({ text: "{not-json sederunt-decision", blob_id: "blob-bad" });
      if (query === "empty-doc") {
        hits.push({
          text: JSON.stringify({ mark: "sederunt-decision", text: "no document fields" }),
          blob_id: "blob-empty",
        });
      }
      return { results: hits };
    },
  };
}

test("company memory without credentials fails closed", async () => {
  await assert.rejects(() => rememberCompany({ text: "x", kind: "note" }), /Company MemWal credentials are not set/);
  assert.equal(await recallHitCount({ env: {} }), 0);
  assert.deepEqual(await recallCompany({ query: "launch", env: {} }), []);
  assert.deepEqual(await indexCompany({ env: {} }), []);
  const previous = { PERSONAL_MEMWAL_KEY: process.env.PERSONAL_MEMWAL_KEY, PERSONAL_MEMWAL_ACCOUNT_ID: process.env.PERSONAL_MEMWAL_ACCOUNT_ID };
  delete process.env.PERSONAL_MEMWAL_KEY;
  delete process.env.PERSONAL_MEMWAL_ACCOUNT_ID;
  try {
    await assert.rejects(() => rememberPersonal({ text: "private", kind: "note" }), /Personal MemWal credentials are not set/);
  } finally {
    if (previous.PERSONAL_MEMWAL_KEY) process.env.PERSONAL_MEMWAL_KEY = previous.PERSONAL_MEMWAL_KEY;
    if (previous.PERSONAL_MEMWAL_ACCOUNT_ID) process.env.PERSONAL_MEMWAL_ACCOUNT_ID = previous.PERSONAL_MEMWAL_ACCOUNT_ID;
  }
});

test("recall skips malformed payloads and a Tatum miss still records the blob", async () => {
  const client = fakeMemwal([
    JSON.stringify({
      mark: "sederunt-decision",
      kind: "decision",
      tenantId: TENANT,
      decision: { id: "d1", text: "Keep Thursday", roomId: "room-1" },
    }),
  ]);
  const hits = await recallHitCount({ client, env });
  assert.equal(hits >= 1, true);
  const recalled = await recallCompany({ query: "broken", tenantId: TENANT, client, env });
  assert.equal(recalled.some((row) => row.decision?.id === "d1"), true);
  const empty = await recallCompany({ query: "empty-doc", tenantId: TENANT, client, env });
  assert.equal(empty.every((row) => row.blobId !== "blob-empty"), true);

  const tatum = {
    async getObject() { throw new Error("gateway down"); },
  };
  const saved = await rememberCompany({
    text: "Keep Thursday",
    kind: "decision",
    tenantId: TENANT,
    decision: { id: "d2", text: "Keep Thursday", roomId: "room-1" },
    client,
    env,
    tatum,
    knowableAtCheckpoint: 10,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.blobId, BLOB);
  assert.equal(saved.locateError, "gateway down");

  const gated = await rememberCompany({
    text: "Late checkpoint",
    kind: "decision",
    tenantId: TENANT,
    decision: { id: "d3", text: "Late checkpoint", roomId: "room-1" },
    client,
    env,
    tatum: {
      async getObject() {
        return { objectId: "0xobj", checkpoint: 120, digest: "dig" };
      },
    },
    knowableAtCheckpoint: 100,
  });
  assert.equal(gated.ok, false);
  assert.equal(gated.checkpoint, 120);
});

test("indexCompany keeps a failed seed search out of the board", async () => {
  const client = {
    async recall({ query }) {
      if (query === "remember this") throw new Error("timeout");
      return { results: [{
        text: JSON.stringify({
          mark: "sederunt-decision",
          kind: "decision",
          tenantId: TENANT,
          decision: { id: "kept", text: "Kept", roomId: "r" },
        }),
        blob_id: "blob-kept",
      }] };
    },
  };
  const rows = await indexCompany({ client, env, tenantId: TENANT });
  assert.equal(rows.some((row) => row.blobId === "blob-kept"), true);
});
