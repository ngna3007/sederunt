import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOM = "sederunt-demo";
const ATTENDEES = ["mina", "rowan", "sofia", "quang"];

/** Realistic demo memories. None of these are secrets. */
export const DEMO_MEMORIES = [
  decision("The offsite is in Da Lat for three nights.", "daniel"),
  decision("The booth opens at nine. Badge pickup stays at the north entrance.", "rowan"),
  decision("The launch moves to the 18th if billing is not green by the 12th.", "quang"),
  minutes("Standup notes. The booth plan is set and the offsite is Da Lat."),
  minutes("Launch review. Billing is the gate for the 18th."),
  minutes("Demo rehearsal. Rowan owns the banner."),
  actionItem("Order the banner by Friday.", "rowan", "Friday"),
  actionItem("Confirm the venue headcount in two weeks.", "sofia", "in two weeks"),
  actionItem("Finish the billing migration by the 12th.", "quang", "the 12th"),
  preference("Post minutes to #sederunt-demo."),
  preference("Assign the banner order to Rowan."),
  correction("The offsite is in Da Lat, not Da Nang."),
  preference("Standup stays async on Fridays."),
];

const args = process.argv.slice(2);
const live = args.includes("--live");
const reportFlag = args.indexOf("--report");
const reportPath = reportFlag >= 0 ? args[reportFlag + 1] : (process.env.HACKATHON_PROOF_REPORT || "");

if (isDirectRun()) {
  const code = await main();
  process.exit(code);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

async function main() {
  if (live) return liveRun();
  return dryRun();
}

function dryRun() {
  const calls = [];
  const memories = DEMO_MEMORIES.map((memory) => prove(memory, calls));
  const rps = 3;
  const report = {
    dryRun: true,
    written: false,
    count: memories.length,
    kinds: countKinds(memories),
    cost: costNote(),
    tatum: {
      calls: calls.length,
      rps,
      freePlan: true,
      estimatedSeconds: Math.ceil(calls.length / rps),
    },
    memories,
  };
  printReport(report);
  writeReport(report);
  return 0;
}

async function liveRun() {
  if (process.env.HACKATHON_CONFIRM_MAINNET !== "yes") {
    console.error("Refusing a mainnet write. Pass --live and set HACKATHON_CONFIRM_MAINNET=yes.");
    return 2;
  }
  loadCompanyEnv();
  if (!process.env.COMPANY_MEMWAL_KEY || !process.env.COMPANY_MEMWAL_ACCOUNT_ID || !process.env.TATUM_API_KEY) {
    console.error("Refusing a mainnet write. COMPANY_MEMWAL_KEY, COMPANY_MEMWAL_ACCOUNT_ID, and TATUM_API_KEY are required.");
    return 2;
  }
  const { rememberCompany } = await import("../src/memory/company.js");
  const { createTatumReader } = await import("../src/tatum/get-object.js");
  const tatum = createTatumReader(process.env);
  const memories = [];
  const existing = args.includes("--skip-existing") ? await keptBlobs() : new Map();
  for (const memory of DEMO_MEMORIES) {
    try {
      const already = existing.get(memory.text);
      const saved = already ? { blobId: already } : await rememberCompany({
        text: memory.text,
        kind: memory.kind,
        idempotencyKey: memory.idempotencyKey,
        env: process.env,
        tatum,
        decision: memory.decision,
        learned: memory.learned,
        minutes: memory.minutes,
        actionItem: memory.actionItem,
      });
      let proof = null;
      if (saved?.blobId && tatum?.getObject) {
        try {
          const object = await tatum.getObject(saved.objectId || saved.blobId, {
            blobId: saved.blobId,
            owner: saved.owner,
            objectId: saved.objectId,
          });
          proof = object?.proof || null;
        } catch (error) {
          proof = { status: "unknown", reason: safeMessage(error) };
        }
      }
      memories.push({ ...publicRow(memory, saved, proof), ...(already ? { keptEarlier: true } : {}) });
      // Written after every memory, so an interrupted run still shows what landed.
      writeReport({ dryRun: false, written: true, partial: memories.length < DEMO_MEMORIES.length, count: memories.length, kinds: countKinds(memories), memories });
      console.error(`kept ${memories.length}/${DEMO_MEMORIES.length} ${memory.kind} · ${proof?.status || "unknown"}`);
    } catch (error) {
      console.error(`Remember failed for ${memory.kind}: ${safeMessage(error)}`);
      // Keep what already landed, so a second run can skip it instead of
      // writing a duplicate.
      writeReport({ dryRun: false, written: memories.length > 0, partial: true, failedAt: memory.idempotencyKey, count: memories.length, kinds: countKinds(memories), memories });
      return 1;
    }
  }
  const calls = typeof tatum.wireCalls === "function" ? tatum.wireCalls() : (tatum.log || []).length;
  const report = {
    dryRun: false,
    written: true,
    count: memories.length,
    kinds: countKinds(memories),
    cost: costNote(),
    tatum: { calls, rps: Number(process.env.TATUM_RPS || 3) || 3, freePlan: true },
    memories,
  };
  printReport(report);
  writeReport(report);
  return 0;
}

/**
 * Seed sentences already in the namespace, by text, with their blob ids.
 * A rerun after an interruption verifies these instead of writing them again.
 */
async function keptBlobs() {
  const { MemWal } = await import("@mysten-incubation/memwal");
  const memwal = MemWal.create({
    key: process.env.COMPANY_MEMWAL_KEY,
    accountId: process.env.COMPANY_MEMWAL_ACCOUNT_ID,
    serverUrl: process.env.COMPANY_MEMWAL_SERVER || "https://relayer.memory.walrus.xyz",
    namespace: "sederunt",
  });
  const kept = new Map();
  for (const memory of DEMO_MEMORIES) {
    const result = await memwal.recall({ query: memory.text, topK: 5, namespace: "sederunt" });
    for (const hit of result?.results ?? []) {
      let text = "";
      try {
        text = JSON.parse(hit.text)?.text ?? "";
      } catch {
        text = "";
      }
      if (text === memory.text && typeof hit.blob_id === "string") kept.set(memory.text, hit.blob_id);
    }
  }
  console.error(`already kept: ${kept.size}/${DEMO_MEMORIES.length}`);
  return kept;
}

function prove(memory, calls) {
  const blobId = digest("blob:" + memory.idempotencyKey).toString("base64url");
  const objectId = "0x" + digest("object:" + memory.idempotencyKey).toString("hex");
  const tx = digest("tx:" + memory.idempotencyKey).toString("base64url");
  const checkpoint = 248110000 + calls.length;
  calls.push("ListOwnedObjects", "GetObject", "GetTransaction");
  return {
    kind: memory.kind,
    text: memory.text,
    idempotencyKey: memory.idempotencyKey,
    roomId: ROOM,
    blobId,
    objectId,
    digest: tx,
    checkpoint,
    checkpointTime: "2026-11-03T02:32:22.000Z",
    status: "verified",
    reason: "Dry run. Nothing was written. This proof is a placeholder.",
    links: {
      object: `https://suiscan.xyz/mainnet/object/${objectId}`,
      tx: `https://suiscan.xyz/mainnet/tx/${tx}`,
      checkpoint: `https://suiscan.xyz/mainnet/checkpoint/${checkpoint}`,
    },
  };
}

function publicRow(memory, saved, proof) {
  return {
    kind: memory.kind,
    text: memory.text,
    idempotencyKey: memory.idempotencyKey,
    roomId: ROOM,
    blobId: saved?.blobId || proof?.blobId || null,
    objectId: proof?.objectId || saved?.objectId || null,
    digest: proof?.digest || saved?.digest || null,
    checkpoint: Number.isInteger(proof?.checkpoint) ? proof.checkpoint : (Number.isInteger(saved?.checkpoint) ? saved.checkpoint : null),
    checkpointTime: proof?.checkpointTime || null,
    status: proof?.status || "unknown",
    reason: proof?.reason || "The chain proof is incomplete.",
    links: linksOf(proof?.objectId || saved?.objectId, proof?.digest || saved?.digest, proof?.checkpoint ?? saved?.checkpoint),
  };
}

function linksOf(objectId, tx, checkpoint) {
  const links = {};
  if (objectId) links.object = `https://suiscan.xyz/mainnet/object/${objectId}`;
  if (tx) links.tx = `https://suiscan.xyz/mainnet/tx/${tx}`;
  if (Number.isInteger(checkpoint)) links.checkpoint = `https://suiscan.xyz/mainnet/checkpoint/${checkpoint}`;
  return links;
}

function printReport(report) {
  const lines = [
    report.dryRun ? "Dry run. Nothing was written to mainnet." : "Live run. Memories were sent to the company MemWal account.",
    `Memories: ${report.count}`,
    `Kinds: ${Object.entries(report.kinds).map(([kind, count]) => `${kind} ${count}`).join(", ")}`,
    `Estimated cost: $${report.cost.rememberUsd} to this wallet for remember(). ${report.cost.note}`,
    `Tatum calls: ${report.tatum.calls} at ${report.tatum.rps} requests/s on the free plan. About ${report.tatum.estimatedSeconds ?? Math.ceil(report.tatum.calls / report.tatum.rps)} seconds.`,
    "Suiscan links below are mainnet paths. A dry run fills them with placeholder ids.",
  ];
  for (const memory of report.memories) {
    lines.push(`${memory.kind}: ${memory.text}`);
    lines.push(`  blob ${memory.blobId || "unknown"}`);
    lines.push(`  object ${memory.links.object || "unknown"}`);
    lines.push(`  tx ${memory.links.tx || "unknown"}`);
    lines.push(`  checkpoint ${memory.links.checkpoint || "unknown"} · ${memory.status}`);
  }
  console.log(lines.join("\n"));
}

function writeReport(report) {
  if (!reportPath) return;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

function costNote() {
  return {
    rememberUsd: 0,
    note: "The managed mainnet relayer at https://relayer.memory.walrus.xyz pays WAL and SUI for remember(). A MemWal account and a registered delegate key are created once at https://memory.walrus.xyz, and that one-time step spends a small owner-wallet gas fee. This script does not create the account.",
  };
}

function countKinds(memories) {
  const kinds = {};
  for (const memory of memories) kinds[memory.kind] = (kinds[memory.kind] || 0) + 1;
  return kinds;
}

function loadCompanyEnv() {
  const file = process.env.COMPANY_ENV_FILE;
  if (!file) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const name = line.slice(0, index);
    const value = line.slice(index + 1).trim();
    if (name === "MEMWAL_PRIVATE_KEY" && !process.env.COMPANY_MEMWAL_KEY) process.env.COMPANY_MEMWAL_KEY = value;
    if (name === "MEMWAL_ACCOUNT_ID" && !process.env.COMPANY_MEMWAL_ACCOUNT_ID) process.env.COMPANY_MEMWAL_ACCOUNT_ID = value;
    if (name === "MEMWAL_SERVER_URL" && !process.env.COMPANY_MEMWAL_SERVER) process.env.COMPANY_MEMWAL_SERVER = value;
    if (name === "TATUM_API_KEY" && !process.env.TATUM_API_KEY) process.env.TATUM_API_KEY = value;
  }
}

function safeMessage(error) {
  let message = error instanceof Error ? error.message : "remember failed";
  for (const name of ["TATUM_API_KEY", "COMPANY_MEMWAL_KEY", "COMPANY_MEMWAL_ACCOUNT_ID"]) {
    const secret = process.env[name];
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message;
}

function decision(text, speaker) {
  const idempotencyKey = `decision:${hash(text)}`;
  return {
    kind: "decision",
    text,
    idempotencyKey,
    decision: {
      id: idempotencyKey,
      roomId: ROOM,
      text,
      inviteMemberIds: ATTENDEES,
      account: "company",
      kind: "decision",
      speakerMemberId: speaker,
      spokenAt: "2026-11-03T02:32:22.000Z",
    },
  };
}

function minutes(text) {
  return {
    kind: "minutes",
    text,
    idempotencyKey: `minutes:${ROOM}:${hash(text)}`,
    minutes: { roomId: ROOM, text, attendees: ATTENDEES, delivery: "Post minutes to #sederunt-demo.", source: "meeting" },
  };
}

function actionItem(text, owner, due) {
  return {
    kind: "action-item",
    text,
    idempotencyKey: `action-item:${ROOM}:${owner}:${hash(text)}`,
    actionItem: { roomId: ROOM, text, owner, due, attendees: ATTENDEES, source: "meeting" },
  };
}

function preference(text) {
  return {
    kind: "team-preference",
    text,
    idempotencyKey: `learned:team-preference:${hash(text)}`,
    learned: { kind: "team-preference", text, roomId: ROOM, at: "2026-11-03T02:32:22.000Z" },
  };
}

function correction(text) {
  return {
    kind: "correction",
    text,
    idempotencyKey: `learned:correction:${hash(text)}`,
    learned: { kind: "correction", text, roomId: ROOM, at: "2026-11-03T02:32:22.000Z" },
  };
}

function hash(text) {
  return digest(text).toString("hex").slice(0, 16);
}

function digest(text) {
  return createHash("sha256").update(String(text)).digest();
}
