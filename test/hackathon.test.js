import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { renderConsolePage } from "../src/console-page.js";
import { encodeBlobContent } from "../src/memory/blob.js";
import { shapeAnswer } from "../src/memory/learn.js";
import { rememberMeetingOutcome } from "../src/memory/outcome.js";
import { createSession } from "../src/session.js";
import { publicProof, verifyMemory } from "../src/tatum/proof.js";
import { endMeeting, handleUtterance } from "../src/typed-path.js";

const blobId = "FqC_szXusTD8s7ADsC1KpZIwpy8ffj_tK8LtMhy7WIo";
const objectId = "0x" + "ab".repeat(32);
const owner = "0x" + "cd".repeat(32);
const otherOwner = "0x" + "ef".repeat(32);

test("a certified blob with a matching id, owner, checkpoint, and time is verified", () => {
  const proof = verifyMemory({
    blobId,
    owner,
    object: {
      objectId,
      ownerAddress: owner,
      checkpoint: 248110104,
      checkpointTime: "2026-11-03T02:32:22.000Z",
      certifyingDigest: "C1J2cwJJQyaXZYBWqaDY5LRJHALA8JrtobJgD9BoWFjq",
      content: encodeBlobContent({ blobId, certified: true }),
    },
  });
  assert.equal(proof.status, "verified");
  assert.equal(proof.reason, "The blob is certified on Sui.");
  assert.equal(proof.certifiedEpoch, 1);
  const shown = publicProof(proof);
  assert.equal(shown.links.object, `https://suiscan.xyz/mainnet/object/${objectId}`);
  assert.equal(shown.links.tx, "https://suiscan.xyz/mainnet/tx/C1J2cwJJQyaXZYBWqaDY5LRJHALA8JrtobJgD9BoWFjq");
  assert.equal(shown.links.checkpoint, "https://suiscan.xyz/mainnet/checkpoint/248110104");
  assert.equal(JSON.stringify(shown).includes(owner), false);
});

test("a blob id mismatch or a missing certification is unverified", () => {
  const mismatch = verifyMemory({
    blobId,
    object: {
      objectId,
      checkpoint: 1,
      checkpointTime: "2026-11-03T02:32:22.000Z",
      content: encodeBlobContent({ blobId: Buffer.alloc(32, 3).toString("base64url"), certified: true }),
    },
  });
  assert.equal(mismatch.status, "unverified");
  assert.match(mismatch.reason, /blob id does not match/);
  const bare = verifyMemory({
    blobId,
    object: {
      objectId,
      ownerAddress: otherOwner,
      checkpoint: 1,
      checkpointTime: "2026-11-03T02:32:22.000Z",
      content: encodeBlobContent({ blobId, certified: false }),
    },
  });
  assert.equal(bare.status, "unverified");
  assert.match(bare.reason, /not certified/);
  const wrongOwner = verifyMemory({
    blobId,
    owner,
    object: {
      objectId,
      ownerAddress: otherOwner,
      checkpoint: 1,
      checkpointTime: "2026-11-03T02:32:22.000Z",
      content: encodeBlobContent({ blobId, certified: true }),
    },
  });
  assert.equal(wrongOwner.status, "unverified");
  assert.match(wrongOwner.reason, /owner does not match/);
});

test("a missing object or a missing checkpoint is unknown", () => {
  const missing = verifyMemory({ blobId });
  assert.equal(missing.status, "unknown");
  assert.match(missing.reason, /incomplete/);
  const soft = verifyMemory({
    blobId,
    object: {
      objectId,
      content: encodeBlobContent({ blobId, certified: true }),
    },
  });
  assert.equal(soft.status, "unknown");
  assert.match(soft.reason, /checkpoint/);
  assert.equal(soft.certifiedEpoch, 1);
});

test("the room and the decision show a proof panel, and an answer can show why", () => {
  const page = renderConsolePage({});
  assert.match(page, /id="proof-dialog"/);
  assert.match(page, /id="proof-panel"/);
  assert.match(page, /id="decision-proof-panel"/);
  assert.match(page, /id="proof-again"/);
  assert.match(page, /id="decision-proof-again"/);
  assert.match(page, /Read via Tatum gRPC/);
  assert.match(page, /Verify again/);
  assert.match(page, /Technical details/);
  assert.match(page, /Show source/);
  assert.match(page, /Nobody can change it/);
  assert.match(page, /why-panel/);
  assert.match(page, /result\.learned/);
  assert.match(page, /Verified on Walrus/);
  const overview = page.slice(page.indexOf('id="right-overview"'), page.indexOf('id="right-decisions"'));
  assert.equal(overview.includes('id="proof-panel"'), false);
  assert.equal(overview.includes(">Blob<"), false);
  assert.equal(page.includes("graphql.mainnet.sui.io"), false);
  assert.equal(page.includes("fullnode.mainnet.sui.io"), false);
});

test("the same question changes after a correction memory exists", () => {
  const question = "Where is the offsite?";
  const sentences = ["The offsite is in Da Nang."];
  const before = shapeAnswer({ question, sentences, memories: [] });
  assert.match(before.text, /Da Nang/);
  assert.equal(before.replaced, false);
  const after = shapeAnswer({
    question,
    sentences,
    memories: [{
      text: "The offsite is in Lisbon.",
      kind: "correction",
      verified: "verified",
      at: "2026-11-01T00:00:00.000Z",
    }],
  });
  assert.match(after.text, /Lisbon/);
  assert.equal(after.replaced, true);
  assert.equal(after.why[0].kind, "correction");
  assert.equal(after.why[0].verified, "verified");
  assert.match(after.why[0].text, /Lisbon/);
});

test("a spoken correction changes the next recall and is not written twice", async () => {
  const memory = countingMemory();
  const session = createSession();
  const room = meetingRoom();
  await handleUtterance(utterance(session, "The offsite is in Da Nang.", room), { memory });
  const before = await handleUtterance({
    ...utterance(session, "Where is the offsite?", room),
    intent: "recall",
    deliveryId: "hack-recall-before",
  }, { memory });
  assert.match(before.body, /Da Nang/);
  assert.equal(before.learned, undefined);
  await handleUtterance(utterance(session, "correction: The offsite is in Lisbon.", room), { memory });
  const after = await handleUtterance({
    ...utterance(session, "Where is the offsite?", room),
    intent: "recall",
    deliveryId: "hack-recall-after",
  }, { memory });
  assert.match(after.learned, /Lisbon/);
  assert.equal(after.why.some((row) => row.kind === "correction"), true);
  const learnedWrites = memory.calls.filter((call) => call.kind === "correction");
  assert.equal(learnedWrites.length, 1);
  const again = await handleUtterance({
    ...utterance(session, "correction: The offsite is in Lisbon.", room),
    deliveryId: "hack-correction-again",
  }, { memory });
  assert.equal(again.outcome, "duplicate");
  assert.equal(memory.calls.filter((call) => call.kind === "correction").length, 1);
});

test("a meeting outcome writes minutes, an action item, and a decision once per key", async () => {
  const stored = new Map();
  const remember = async (document) => {
    const key = document.idempotencyKey;
    if (!stored.has(key)) stored.set(key, { ...document, blobId: `blob-${stored.size + 1}` });
    return stored.get(key);
  };
  const input = {
    room: { id: "booth", attendees: ["mina", "rowan"] },
    minutes: { text: "The booth opens at nine.", delivery: "Post minutes to #sederunt-demo." },
    actionItems: [{ text: "Order the banner by Friday.", owner: "rowan", due: "Friday" }],
    decisions: [{ id: "decision-1", text: "The booth opens at nine.", speakerMemberId: "mina" }],
    remember,
  };
  await rememberMeetingOutcome(input);
  await rememberMeetingOutcome(input);
  assert.equal(stored.size, 3);
  const kinds = [...stored.values()].map((row) => row.kind).sort();
  assert.deepEqual(kinds, ["action-item", "decision", "minutes"]);
  const action = [...stored.values()].find((row) => row.kind === "action-item");
  assert.equal(action.actionItem.owner, "rowan");
  assert.equal(action.actionItem.due, "Friday");
  assert.equal(action.actionItem.roomId, "booth");
  assert.deepEqual(action.actionItem.attendees, ["mina", "rowan"]);
  const minutes = [...stored.values()].find((row) => row.kind === "minutes");
  assert.equal(minutes.idempotencyKey, "minutes:booth");
  const decision = [...stored.values()].find((row) => row.kind === "decision");
  assert.equal(decision.idempotencyKey, "decision-1");
});

test("ending a meeting writes the room outcome and skips a decision that already has a blob", async () => {
  const session = createSession();
  session.rooms.push({ id: "booth", memberIds: ["mina", "rowan"] });
  session.decisions.push({
    id: "decision-9",
    roomId: "booth",
    text: "The booth opens at nine.",
    blobId: "already-kept",
    account: "company",
    deleted: false,
  });
  session.actions.push({ id: "action-9", roomId: "booth", statement: "Order the banner.", memberId: "rowan" });
  session.learned = [{ kind: "team-preference", text: "Post minutes to #sederunt-demo." }];
  const memory = countingMemory();
  const written = await endMeeting(session, { memory }, "booth");
  assert.equal(written.some((row) => row.kind === "minutes"), true);
  assert.equal(written.some((row) => row.kind === "action-item"), true);
  assert.equal(written.some((row) => row.kind === "decision"), false);
  const minutes = memory.calls.find((call) => call.kind === "minutes");
  assert.match(minutes.minutes.delivery, /#sederunt-demo/);
  assert.equal(memory.calls.filter((call) => call.kind === "decision").length, 0);
});

test("src does not read the public GraphQL or fullnode endpoints", async () => {
  const files = await walk(new URL("../src/", import.meta.url));
  const banned = ["graphql.mainnet.sui.io", "fullnode.mainnet.sui.io"];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const host of banned) {
      assert.equal(text.includes(host), false, `${file} mentions ${host}`);
    }
  }
  const css = await readFile(new URL("../src/console.css", import.meta.url), "utf8");
  let depth = 0;
  for (const char of css) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    assert.equal(depth >= 0, true);
  }
  assert.equal(depth, 0);
});

test("the seed dry run prints the plan and never prints a key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sederunt-seed-"));
  const report = join(dir, "report.json");
  const tatumKey = "tatum-key-wiresecret";
  const memwalKey = "memwal-secret-value";
  const account = "acct-secret-value";
  const dry = await runNode(["scripts/hackathon-seed-memories.mjs", "--report", report], {
    TATUM_API_KEY: tatumKey,
    COMPANY_MEMWAL_KEY: memwalKey,
    COMPANY_MEMWAL_ACCOUNT_ID: account,
    HACKATHON_CONFIRM_MAINNET: "yes",
  });
  assert.equal(dry.code, 0, dry.err);
  const dumped = `${dry.out}\n${dry.err}`;
  assert.equal(dumped.includes(tatumKey), false);
  assert.equal(dumped.includes(memwalKey), false);
  assert.equal(dumped.includes(account), false);
  assert.match(dry.out, /\$0/);
  assert.match(dry.out, /dry run/i);
  const body = JSON.parse(await readFile(report, "utf8"));
  assert.equal(body.dryRun, true);
  assert.equal(body.memories.length >= 12, true);
  const kinds = new Set(body.memories.map((row) => row.kind));
  for (const kind of ["decision", "minutes", "action-item", "team-preference", "correction"]) {
    assert.equal(kinds.has(kind), true, kind);
  }
  assert.equal(body.cost.rememberUsd, 0);
  assert.equal(JSON.stringify(body).includes(tatumKey), false);
  const refused = await runNode(["scripts/hackathon-seed-memories.mjs", "--live"], {
    TATUM_API_KEY: tatumKey,
    COMPANY_MEMWAL_KEY: memwalKey,
    COMPANY_MEMWAL_ACCOUNT_ID: account,
  });
  assert.equal(refused.code, 2);
  assert.equal(`${refused.out}\n${refused.err}`.includes(tatumKey), false);
  assert.equal(`${refused.out}\n${refused.err}`.includes(memwalKey), false);
});

function meetingRoom() {
  return {
    id: "offsite",
    kind: "meeting",
    source: "meet",
    botPresent: true,
    memberIds: ["rowan", "mina"],
  };
}

function utterance(session, text, room) {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  return {
    text,
    session,
    memberId: "rowan",
    room,
    deliveryId: `hack-${hash}`,
  };
}

function countingMemory() {
  const calls = [];
  return {
    calls,
    async remember(input) {
      calls.push(input);
      return { blobId: `blob-${calls.length}` };
    },
    async index() {
      return [];
    },
  };
}

async function walk(root) {
  const dir = root.pathname ?? root;
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (/\.(js|mjs|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL("..", import.meta.url).pathname,
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", ...env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}
