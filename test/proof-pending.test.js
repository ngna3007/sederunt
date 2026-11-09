import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";
import { createApp, proofWarmOn } from "../src/server.js";
import { createSession } from "../src/session.js";
import { companyBoard, PROOF_PENDING_REASON, readProofs, warmProofs } from "../src/typed-path.js";

const VERIFIED = (blobId) => ({
  text: "",
  checkpoint: 341620328,
  proof: { status: "verified", reason: "The blob is certified on Sui.", blobId, objectId: `0x${"a".repeat(64)}`, digest: "Dig1", checkpoint: 341620328, checkpointTime: "2026-11-04T16:43:54.797Z", certifiedEpoch: 43 },
});

function sessionWith(...blobIds) {
  const session = createSession();
  session.rooms.push({ id: "booth", name: "Booth planning", platform: "Google Meet" });
  blobIds.forEach((blobId, i) => session.decisions.push({
    id: `d${i + 1}`, account: "company", kind: "decision", text: `Decision ${i + 1}.`, speakerMemberId: "rowan",
    inviteMemberIds: ["mina", "rowan"], roomId: "booth", spokenAt: "2026-11-04T16:43:00.000Z", contradicts: [], fileNames: [], blobId,
  }));
  return session;
}

/** A reader whose answers wait until the test lets them go. */
function slowReader(answer = VERIFIED) {
  const calls = [];
  const gates = [];
  return {
    calls,
    release() { while (gates.length) gates.shift()(); },
    async getObject(target, hints) {
      calls.push(hints.blobId);
      await new Promise((resolve) => gates.push(resolve));
      return answer(hints.blobId);
    },
  };
}

test("a slow first read comes back pending, not unknown, and the second load is instant", async () => {
  const session = sessionWith("blob-1");
  const tatum = slowReader();
  const first = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 20 });
  assert.equal(first.decisions[0].proofStatus, "pending");
  assert.equal(first.decisions[0].proof.status, "pending");
  assert.equal(first.decisions[0].proofReason, PROOF_PENDING_REASON);
  assert.equal(first.decisions[0].proof.blobId, "blob-1");
  // A follow-up joins the read already running.
  const follow = readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 2000 });
  tatum.release();
  const settled = await follow;
  assert.equal(settled.decisions[0].proofStatus, "verified");
  assert.equal(settled.decisions[0].proof.certifiedEpoch, 43);
  assert.equal(tatum.calls.length, 1);
  // The next load reads from the cache without waiting or calling again.
  const started = Date.now();
  const again = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 20 });
  assert.equal(again.decisions[0].proofStatus, "verified");
  assert.equal(tatum.calls.length, 1);
  assert.ok(Date.now() - started < 200);
});

test("only a real failure shows unknown, and it is not cached", async () => {
  const session = sessionWith("blob-1");
  let fail = true;
  const calls = [];
  const tatum = {
    async getObject(target, hints) {
      calls.push(hints.blobId);
      if (fail) throw new Error("Tatum read failed");
      return VERIFIED(hints.blobId);
    },
  };
  const failed = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 500 });
  assert.equal(failed.decisions[0].proofStatus, "unknown");
  assert.notEqual(failed.decisions[0].proofReason, PROOF_PENDING_REASON);
  fail = false;
  const retried = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 500 });
  assert.equal(retried.decisions[0].proofStatus, "verified");
  assert.equal(calls.length, 2);
});

test("an unverified read is not kept, and fresh reads again after a verified one", async () => {
  const session = sessionWith("blob-1");
  let status = "unverified";
  let calls = 0;
  const tatum = {
    async getObject(target, hints) {
      calls += 1;
      const object = VERIFIED(hints.blobId);
      object.proof.status = status;
      return object;
    },
  };
  assert.equal((await readProofs(session, companyBoard(session, "mina"), tatum)).decisions[0].proofStatus, "unverified");
  status = "verified";
  assert.equal((await readProofs(session, companyBoard(session, "mina"), tatum)).decisions[0].proofStatus, "verified");
  assert.equal(calls, 2);
  await readProofs(session, companyBoard(session, "mina"), tatum);
  assert.equal(calls, 2);
  await readProofs(session, companyBoard(session, "mina"), tatum, { fresh: true });
  assert.equal(calls, 3);
});

test("several memories are verified in one batch and a missing one stays unknown", async () => {
  const session = sessionWith("blob-1", "blob-2", "blob-3");
  const batches = [];
  const tatum = {
    async getObject() {
      throw new Error("a single read was used");
    },
    async getObjects(requests) {
      batches.push(requests.map((request) => request.hints.blobId));
      return requests.map((request) => (
        request.hints.blobId === "blob-2"
          ? { ok: false, error: new Error("Tatum read failed") }
          : { ok: true, object: VERIFIED(request.hints.blobId) }
      ));
    },
  };
  const report = await warmProofs(session, tatum);
  assert.equal(report.verified, 2);
  assert.equal(report.failed, 1);
  assert.deepEqual(batches, [["blob-1", "blob-2", "blob-3"]]);
  const board = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 20 });
  assert.deepEqual(board.decisions.map((row) => row.proofStatus), ["verified", "unknown", "verified"]);
  assert.equal(batches.length, 1);
});

test("warmProofs reads company memories one at a time and fills the cache", async () => {
  const session = sessionWith("blob-1", "blob-2", "blob-3");
  session.decisions.push({ id: "p1", account: "personal", kind: "decision", text: "Private.", blobId: "blob-private", inviteMemberIds: [], contradicts: [], fileNames: [] });
  let running = 0;
  let peak = 0;
  const seen = [];
  const tatum = {
    async getObject(target, hints) {
      running += 1;
      peak = Math.max(peak, running);
      seen.push(hints.blobId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return VERIFIED(hints.blobId);
    },
  };
  const report = await warmProofs(session, tatum);
  assert.equal(report.verified, 3);
  assert.equal(report.failed, 0);
  assert.equal(peak, 1);
  assert.deepEqual(seen, ["blob-1", "blob-2", "blob-3"]);
  const board = await readProofs(session, companyBoard(session, "mina"), tatum, { timeoutMs: 20 });
  assert.deepEqual(board.decisions.map((row) => row.proofStatus), ["verified", "verified", "verified"]);
  assert.equal(seen.length, 3);
});

test("the start-up warm runs only with a real key or the flag", () => {
  assert.equal(proofWarmOn({}), false);
  assert.equal(proofWarmOn({ TATUM_API_KEY: "x" }), true);
  assert.equal(proofWarmOn({ TATUM_API_KEY: "x", SEDERUNT_WARM_PROOFS: "0" }), false);
  assert.equal(proofWarmOn({ SEDERUNT_WARM_PROOFS: "1" }), true);
});

async function listen(app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  return app.address().port;
}

test("the console board answers fast with a pending proof and /api/proof finishes it", async () => {
  const session = sessionWith("blob-1");
  const tatum = slowReader();
  const app = createApp({ session, companyLoaded: true, env: { SEDERUNT_MEMBER: "mina" }, deps: { tatum, memory: { async remember() { return { blobId: null }; } } } });
  assert.equal(app.proofWarm, null);
  const port = await listen(app);
  try {
    const started = Date.now();
    const board = await (await fetch(`http://127.0.0.1:${port}/api/console`)).json();
    assert.ok(Date.now() - started < 1500, "the board does not wait on a cold chain read");
    const row = board.decisions.find((item) => item.id === "d1");
    assert.equal(row.proofStatus, "pending");
    const follow = fetch(`http://127.0.0.1:${port}/api/proof`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "d1" }) });
    setTimeout(() => tatum.release(), 50);
    const result = await (await follow).json();
    assert.equal(result.status, "verified");
    assert.equal(result.proof.checkpointTime, "2026-11-04T16:43:54.797Z");
    assert.equal(tatum.calls.length, 1);
  } finally {
    app.close();
  }
});

test("with the flag, the server warms the proofs at start", async () => {
  const session = sessionWith("blob-1", "blob-2");
  let calls = 0;
  const tatum = { async getObject(target, hints) { calls += 1; return VERIFIED(hints.blobId); } };
  const app = createApp({ session, companyLoaded: true, env: { SEDERUNT_MEMBER: "mina", SEDERUNT_WARM_PROOFS: "1" }, deps: { tatum, memory: { async remember() { return { blobId: null }; } } } });
  const report = await app.proofWarm;
  assert.equal(report.verified, 2);
  const port = await listen(app);
  try {
    const board = await (await fetch(`http://127.0.0.1:${port}/api/console`)).json();
    assert.deepEqual(board.decisions.map((row) => row.proofStatus), ["verified", "verified"]);
    assert.equal(calls, 2);
  } finally {
    app.close();
  }
});

test("the page shows a pending proof and follows it up without a reload", () => {
  const page = renderConsolePage();
  assert.match(page, /if \(status === "pending"\) return "Verifying on Walrus…";/);
  assert.match(page, /function followProof\(decision, tries\)/);
  assert.match(page, /if \(decision && proofPending\(decision\)\) followProof\(decision\);/);
  assert.match(page, /fresh: fresh === true/);
  assert.match(page, /Tatum did not answer in time\. Try Verify again\./);
  assert.match(page, /id="proof-status" class="meta" aria-live="polite"/);
});
