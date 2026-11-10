import assert from "node:assert/strict";
import test from "node:test";
import {
  indexCompany,
  normalizeTenantId,
  recallCompany,
  rememberCompany,
  tenantOwns,
} from "../src/memory/company.js";
import { bindMemoryTenant } from "../src/server.js";
import { rebuildCompanyIndex } from "../src/typed-path.js";
import { createSession } from "../src/session.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fakeMemwal() {
  const stored = [];
  return {
    stored,
    async rememberAndWait(text) {
      stored.push(String(text));
      return { blob_id: `blob-${stored.length}`, namespace: "sederunt", id: `id-${stored.length}`, owner: "0x" + "ab".repeat(32) };
    },
    async recall() {
      return {
        results: stored.map((text, index) => ({ text, blob_id: `blob-${index + 1}`, distance: 0.1 })),
      };
    },
  };
}

function decisionDoc(id, text, roomId = "room-1") {
  return {
    id,
    roomId,
    text,
    speakerMemberId: "mina",
    inviteMemberIds: ["mina"],
    area: "desk",
    kind: "decision",
    contradicts: [],
    predecessorId: null,
    replaces: null,
    replacedBy: null,
    checkpoint: null,
    spokenAt: "2026-11-06T12:00:00.000Z",
  };
}

const env = {
  COMPANY_MEMWAL_KEY: "test-company-key",
  COMPANY_MEMWAL_ACCOUNT_ID: "test-company-account",
};

test("tenantOwns keeps legacy unscoped records invisible to a real workspace", () => {
  assert.equal(tenantOwns({ tenantId: TENANT_A }, TENANT_A), true);
  assert.equal(tenantOwns({ tenantId: TENANT_A }, TENANT_B), false);
  assert.equal(tenantOwns({ tenantId: "" }, TENANT_A), false);
  assert.equal(tenantOwns({}, TENANT_A), false);
  assert.equal(tenantOwns({ tenantId: "" }, ""), false);
  assert.equal(tenantOwns({ tenantId: "" }, "", { allowUnscoped: true }), true);
  assert.equal(tenantOwns({ tenantId: TENANT_A }, "", { allowUnscoped: true }), false);
  assert.equal(normalizeTenantId("  x  "), "x");
});

test("shared MemWal backing does not cross tenants on remember/index/recall", async () => {
  const client = fakeMemwal();
  await rememberCompany({
    account: "company",
    kind: "decision",
    text: "Alpha only secret",
    tenantId: TENANT_A,
    decision: decisionDoc("dec-a", "Alpha only secret"),
    client,
    env,
  });
  await rememberCompany({
    account: "company",
    kind: "decision",
    text: "Bravo only secret",
    tenantId: TENANT_B,
    decision: decisionDoc("dec-b", "Bravo only secret"),
    client,
    env,
  });
  // Legacy unscoped payload (pre-fix blob still in the store).
  await client.rememberAndWait(JSON.stringify({
    mark: "sederunt-decision",
    text: "Legacy unscoped cedar-92",
    kind: "decision",
    account: "company",
    decision: decisionDoc("dec-legacy", "Legacy unscoped cedar-92"),
  }));

  const indexA = await indexCompany({ client, env, tenantId: TENANT_A });
  const indexB = await indexCompany({ client, env, tenantId: TENANT_B });
  const indexEmptyClosed = await indexCompany({ client, env, tenantId: "" });
  const indexEmptyLocal = await indexCompany({ client, env, tenantId: "", allowUnscoped: true });

  assert.equal(indexA.length, 1);
  assert.match(indexA[0].decision.text, /Alpha only/);
  assert.equal(indexB.length, 1);
  assert.match(indexB[0].decision.text, /Bravo only/);
  assert.equal(indexEmptyClosed.length, 0);
  assert.equal(indexEmptyLocal.length, 1);
  assert.match(indexEmptyLocal[0].decision.text, /Legacy unscoped/);

  const recallA = await recallCompany({ query: "secret", tenantId: TENANT_A, client, env });
  const recallB = await recallCompany({ query: "secret", tenantId: TENANT_B, client, env });
  assert.equal(recallA.every((row) => /Alpha/.test(row.decision?.text || "")), true);
  assert.equal(recallB.every((row) => /Bravo/.test(row.decision?.text || "")), true);
  assert.equal(recallA.some((row) => /Bravo|Legacy|cedar-92/.test(row.decision?.text || "")), false);
  assert.equal(recallB.some((row) => /Alpha|Legacy|cedar-92/.test(row.decision?.text || "")), false);
});

test("rebuildCompanyIndex hydrates only the bound tenant", async () => {
  const client = fakeMemwal();
  await rememberCompany({
    account: "company",
    kind: "decision",
    text: "Northline office District 7",
    tenantId: TENANT_A,
    decision: decisionDoc("dec-n", "Northline office District 7"),
    client,
    env,
  });
  await rememberCompany({
    account: "company",
    kind: "decision",
    text: "Other workspace billing secret",
    tenantId: TENANT_B,
    decision: decisionDoc("dec-o", "Other workspace billing secret"),
    client,
    env,
  });

  const memoryA = bindMemoryTenant(null, TENANT_A, env, client, null);
  const memoryB = bindMemoryTenant(null, TENANT_B, env, client, null);
  const sessionA = createSession();
  const sessionB = createSession();
  const reportA = await rebuildCompanyIndex(sessionA, { memory: memoryA });
  const reportB = await rebuildCompanyIndex(sessionB, { memory: memoryB });
  assert.equal(reportA.ok, true);
  assert.equal(reportB.ok, true);
  const textsA = (sessionA.decisions || []).map((d) => d.text).join("\n");
  const textsB = (sessionB.decisions || []).map((d) => d.text).join("\n");
  assert.match(textsA, /Northline/);
  assert.equal(/billing secret/.test(textsA), false);
  assert.match(textsB, /billing secret/);
  assert.equal(/Northline/.test(textsB), false);
});

test("company index searches run together and a failed search stays out", async () => {
  let inflight = 0;
  let peak = 0;
  let release;
  const open = new Promise((resolve) => { release = resolve; });
  const queries = [];
  const client = {
    async recall({ query }) {
      queries.push(query);
      inflight += 1;
      peak = Math.max(peak, inflight);
      if (queries.length === 6) release();
      await open;
      inflight -= 1;
      if (query === "remember this") throw new Error("relayer down");
      const text = `kept from ${query}`;
      const results = [{
        text: JSON.stringify({
          mark: "sederunt-decision",
          text,
          kind: "decision",
          account: "company",
          tenantId: TENANT_A,
          decision: decisionDoc(`dec-${query}`, text),
        }),
        blob_id: `blob-${query}`,
        distance: 0.2,
      }];
      if (query === "sederunt-decision" || query === "meeting room hearing") {
        results.push({
          text: JSON.stringify({
            mark: "sederunt-decision",
            text: `shared from ${query}`,
            kind: "decision",
            account: "company",
            tenantId: TENANT_A,
            decision: decisionDoc("dec-shared", `shared from ${query}`),
          }),
          blob_id: "blob-shared",
          distance: 0.1,
        });
      }
      return { results };
    },
  };
  const rows = await Promise.race([
    indexCompany({ client, env, tenantId: TENANT_A }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("searches did not overlap")), 400)),
  ]);
  assert.equal(peak, 6);
  assert.equal(queries.length, 6);
  assert.equal(rows.some((row) => /remember this/.test(row.decision?.text || "")), false);
  assert.equal(rows.find((row) => row.blobId === "blob-shared").decision.text, "shared from sederunt-decision");
  assert.equal(rows.length, 6);
});

test("raw Slack channel ids are treated as non-display names", () => {
  function looksLikeRawRoomId(value) {
    const s = String(value || "").replace(/^#/, "").trim();
    if (!s) return true;
    if (/^[CGD][A-Z0-9]{8,}$/i.test(s)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
    return false;
  }
  assert.equal(looksLikeRawRoomId("C0123456789"), true);
  assert.equal(looksLikeRawRoomId("#new-channel"), false);
  assert.equal(looksLikeRawRoomId("Northline Ops"), false);
});
