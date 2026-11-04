/**
 * Testnet proof: Seal (or server-wrap fallback) a small text file, store a
 * deletable Walrus blob, read it back, delete it, and record public ids.
 *
 * Run with the service env loaded in the same shell. This script never prints
 * WALRUS_SERVICE_KEY. Output is written under the path in PROOF_OUT.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SUI_GRPC_URL } from "../src/files/config.js";
import { openEnvelope, sealEnvelope } from "../src/files/envelope.js";
import { createLiveSeal } from "../src/files/seal.js";
import { createLiveWalrus } from "../src/files/walrus.js";

const OUT = process.env.PROOF_OUT || "/workspace/sederunt-work/qa/walrus-live/proof.json";
const PLAIN = Buffer.from("Sederunt walrus files live proof\nA deletable testnet blob.\n");
const FILE_ID = "live-proof-2026-11-04";

function redact(value) {
  return String(value || "")
    .replace(/suiprivkey1[a-z0-9]+/gi, "[redacted]")
    .replace(/WALRUS_SERVICE_KEY=\S+/g, "WALRUS_SERVICE_KEY=[redacted]")
    .replace(/mnemonic:.*$/gim, "mnemonic: [redacted]");
}

function sha256(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function txLink(digest) {
  return digest ? `https://suiscan.xyz/testnet/tx/${digest}` : null;
}

function objectLink(id) {
  return id ? `https://suiscan.xyz/testnet/object/${id}` : null;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function readWhenReady(walrus, blobId) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await walrus.readBlob({ blobId });
    } catch (error) {
      last = error;
      log(`walrus: read not ready (${attempt})`);
      walrus.reset();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw last;
}

async function deleteOwnedBlobs(walrus) {
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  const { decodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
  const { secretKey } = decodeSuiPrivateKey(process.env.WALRUS_SERVICE_KEY);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const sui = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_GRPC_URL });
  const owner = keypair.toSuiAddress();
  let cursor = null;
  const ids = [];
  do {
    const page = await sui.listOwnedObjects({ owner, limit: 50, cursor });
    for (const object of page.objects || []) {
      if (String(object.type || "").endsWith("::blob::Blob")) ids.push(object.objectId);
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  if (!ids.length) return;
  log(`walrus: deleting ${ids.length} leftover blob object(s)`);
  for (const blobObjectId of ids) {
    const removed = await walrus.deleteBlob({ blobObjectId });
    log(`walrus: leftover ${blobObjectId} ${removed.alreadyGone ? "already-gone" : "deleted"}`);
  }
}

function runWalrus(args) {
  const bin = join(homedir(), "walrus-bin", "walrus");
  const command = [
    bin,
    "--config", "/workspace/sederunt-secrets/walrus-wallet/client_config.yaml",
    "--wallet", "/workspace/sederunt-secrets/walrus-wallet/client.yaml",
    ...args,
  ];
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 90_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: redact(Buffer.concat(out).toString("utf8")).slice(0, 20_000),
        stderr: redact(Buffer.concat(err).toString("utf8")).slice(0, 8_000),
      });
    });
  });
}

async function objectState(sui, objectId) {
  try {
    const looked = await sui.getObject({
      objectId,
      include: { previousTransaction: true },
    });
    const object = looked.object || {};
    return {
      found: true,
      objectId: object.objectId || objectId,
      version: object.version || null,
      type: object.type || null,
      previousTransaction: object.previousTransaction || null,
    };
  } catch (error) {
    return { found: false, error: redact(error?.message || error).slice(0, 400) };
  }
}

async function main() {
  const network = String(process.env.WALRUS_NETWORK || "testnet");
  if (network !== "testnet") {
    log("refusing: WALRUS_NETWORK is not testnet");
    process.exit(2);
  }
  if (!process.env.WALRUS_SERVICE_KEY) {
    log("refusing: WALRUS_SERVICE_KEY is not set");
    process.exit(2);
  }

  let seal = null;
  let sealError = null;
  log("seal: probing key servers");
  try {
    const live = createLiveSeal(process.env);
    const probe = Buffer.alloc(32, 7);
    const wrapped = await live.encryptKey(probe);
    const opened = Buffer.from(await live.decryptKey(wrapped));
    if (!probe.equals(opened)) throw new Error("Seal roundtrip did not match");
    probe.fill(0);
    opened.fill(0);
    seal = live;
    log("seal: roundtrip ok");
  } catch (error) {
    sealError = redact(error?.message || error).slice(0, 500);
    log(`seal: unavailable (${sealError})`);
  }

  const envelope = await sealEnvelope(PLAIN, {
    seal,
    serverSecret: process.env.FILES_WRAP_KEY || process.env.WALRUS_SERVICE_KEY,
  });
  const walrus = createLiveWalrus(process.env);
  const steps = [];
  await deleteOwnedBlobs(walrus);
  log("walrus: writing deletable blob");
  const written = await walrus.writeBlob({
    bytes: envelope.bytes,
    deletable: true,
    epochs: 1,
    attributes: {
      "sederunt:file_id": FILE_ID,
      "sederunt:tenant_id": "live-proof",
      "sederunt:channel_id": "live-proof",
    },
    onStep: (step) => {
      steps.push({
        step: step.step,
        blobId: step.blobId || null,
        blobObjectId: step.blobObjectId || null,
        txDigest: step.txDigest || null,
      });
      log(`walrus: ${step.step}`);
    },
  });
  log(`blob: ${written.blobId}`);
  log(`object: ${written.objectId}`);

  const sui = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_GRPC_URL });
  let plaintextSha256 = sha256(PLAIN);
  let decryptedSha256 = null;
  let beforeObject = null;
  let statusBefore = null;
  let deleted = { digest: null, alreadyGone: false };
  let statusAfter = null;
  let afterObject = null;
  let readError = null;
  try {
    log("walrus: reading blob");
    const ciphertext = await readWhenReady(walrus, written.blobId);
    const plain = await openEnvelope(ciphertext, {
      seal,
      serverSecret: process.env.FILES_WRAP_KEY || process.env.WALRUS_SERVICE_KEY,
    });
    decryptedSha256 = sha256(plain);
    if (plaintextSha256 !== decryptedSha256) throw new Error("decrypted sha256 did not match");
    log("walrus: sha256 matched");
    beforeObject = await objectState(sui, written.objectId);
    log("walrus: blob-status before delete");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      statusBefore = await runWalrus(["blob-status", "--json", "--timeout", "30s", "--blob-id", written.blobId]);
      if (statusBefore.code === 0) break;
      log(`walrus: blob-status not ready (${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  } catch (error) {
    readError = error;
    log(`walrus: read failed (${redact(error?.message || error).slice(0, 300)})`);
  }
  const registerDigest = written.registerDigest || steps.find((step) => step.step === "registered")?.txDigest || null;
  const certifyDigest = beforeObject?.previousTransaction && beforeObject.previousTransaction !== registerDigest
    ? beforeObject.previousTransaction
    : null;
  log("walrus: deleting");
  deleted = await walrus.deleteBlob({ blobObjectId: written.objectId });
  log("walrus: blob-status after delete");
  statusAfter = await runWalrus(["blob-status", "--json", "--timeout", "30s", "--blob-id", written.blobId]);
  afterObject = await objectState(sui, written.objectId);
  let aggregatorAfter = null;
  try {
    const again = await fetch(`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${encodeURIComponent(written.blobId)}`);
    aggregatorAfter = {
      status: again.status,
      note: "The public aggregator may still serve cached slivers after delete; Walrus delete does not purge caches. The bytes are Seal ciphertext.",
    };
  } catch (error) {
    aggregatorAfter = { error: redact(error?.message || error).slice(0, 200) };
  }

  const proof = {
    network: "testnet",
    at: new Date().toISOString(),
    encryption: envelope.mode,
    sealError,
    plaintextSha256,
    decryptedSha256,
    sha256Match: plaintextSha256 === decryptedSha256,
    readPath: walrus.lastReadPath,
    deletable: true,
    epochs: 1,
    blobId: written.blobId,
    objectId: written.objectId,
    endEpoch: written.endEpoch,
    registerDigest,
    certifyDigest,
    certifyNote: certifyDigest
      ? "Object previous transaction after certify, distinct from the register digest."
      : "Certify digest was not separate from the register digest on the object.",
    deleteDigest: deleted.digest || null,
    deleteAlreadyGone: deleted.alreadyGone === true,
    links: {
      object: objectLink(written.objectId),
      registerTx: txLink(registerDigest),
      certifyTx: txLink(certifyDigest),
      deleteTx: txLink(deleted.digest || null),
    },
    steps,
    objectBeforeDelete: beforeObject,
    objectAfterDelete: afterObject,
    blobStatusBefore: statusBefore,
    blobStatusAfter: statusAfter,
    aggregatorAfterDelete: aggregatorAfter,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o644 });
  log(`proof: ${OUT}`);
  log(`blob: ${written.blobId}`);
  log(`object: ${written.objectId}`);
  log(`register: ${registerDigest || ""}`);
  log(`certify: ${certifyDigest || ""}`);
  log(`delete: ${deleted.digest || ""}`);
  log(`encryption: ${envelope.mode}`);
  if (readError || plaintextSha256 !== decryptedSha256) {
    throw readError || new Error("decrypted sha256 did not match");
  }
}

main().catch((error) => {
  process.stderr.write(`${redact(error?.stack || error?.message || error).slice(0, 2000)}\n`);
  process.exit(1);
});
