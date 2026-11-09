import { UPLOAD_STUCK_MS } from "./config.js";
import { fileNamespace } from "./memory.js";
import { placeStoredFile } from "./service.js";
import { backoffDelayMs } from "./store.js";

/**
 * One pass over due file jobs. Claim is for-update-skip-locked in the SQL
 * migration and a single locked row here. Failures wait 1 minute, then double
 * up to 6 hours, and die after 12 attempts. Console renews its own storage.
 */
export async function runFileWorker(runtime, { limit = 8 } = {}) {
  const { store } = runtime;
  await store.failStuckUploads(UPLOAD_STUCK_MS);
  const ran = [];
  for (let i = 0; i < limit; i += 1) {
    const job = await store.claimJob();
    if (!job) break;
    let renewing = Promise.resolve();
    const heartbeat = store.renewJob ? setInterval(() => {
      renewing = renewing.then(() => store.renewJob(job)).catch(() => false);
    }, 60_000) : null;
    heartbeat?.unref?.();
    try {
      const outcome = await runJob(runtime, job);
      const finished = outcome?.skipped ? await store.skipJob(job.id, outcome.reason, job.claimToken) : await store.finishJob(job.id, job.claimToken);
      ran.push(finished);
    } catch (error) {
      const delay = backoffDelayMs(job.attempts);
      ran.push(await store.failJob(job.id, error, delay, job.claimToken));
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await renewing;
    }
  }
  return ran;
}

async function runJob(runtime, job) {
  const file = await runtime.store.getFile(job.fileId);
  if (!file) return null;
  runtime = { ...runtime, job };
  if (job.kind === "upload") return uploadJob(runtime, file);
  if (job.kind === "delete_blob") return deleteBlobJob(runtime, file);
  if (job.kind === "delete_memory") return deleteMemoryJob(runtime, file);
  if (job.kind === "renew") return { skipped: true, reason: "Console renews storage" };
  throw new Error(`Unknown file job ${job.kind}`);
}

async function uploadJob(runtime, file) {
  // A delete can land before this queued upload runs. Leave that row alone.
  if (file.status !== "uploading") return null;
  const bytes = file.consoleFileId ? null : await runtime.store.peekUpload(file.id);
  if (!file.consoleFileId && !bytes) throw new Error("Upload bytes are gone; the file will be marked failed once it is stuck");
  if (!runtime.storage) throw new Error("Storage is paused, try later");
  await placeStoredFile(runtime, file, bytes || Buffer.alloc(0));
  return null;
}

async function deleteBlobJob(runtime, file) {
  if (file.status === "deleted") return null;
  if (!file.consoleFileId) {
    await markDeleted(runtime, file.id);
    return null;
  }
  if (!runtime.storage?.remove) throw new Error("Storage is paused, try later");
  const outcome = await runtime.storage.remove({
    folderId: file.consoleFolderId,
    fileId: file.consoleFileId,
  });
  if (!outcome?.deleted) throw new Error("Console delete is still in progress");
  await markDeleted(runtime, file.id);
  return null;
}

async function deleteMemoryJob(runtime, file) {
  const links = await runtime.store.linksFor(file.id);
  const outcome = await runtime.memory.forgetFile({ fileId: file.id, links });
  if (outcome.skipped) {
    if (!links.length) {
      await runtime.store.addLink({
        fileId: file.id,
        memoryBlobId: "unconfigured",
        namespace: outcome.namespace || fileNamespace(file.id),
        status: "skipped",
      });
    }
    await setLinksStatus(runtime, file.id, "skipped", outcome.reason);
    return outcome;
  }
  await setLinksStatus(runtime, file.id, "deleted", null);
  return null;
}

async function markDeleted(runtime, id) {
  return runtime.store.durable ? runtime.store.workerMutation(runtime.job, "deleted") : runtime.store.markDeleted(id);
}
async function setLinksStatus(runtime, id, status, reason) {
  return runtime.store.durable ? runtime.store.workerMutation(runtime.job, "links", { status, reason }) : runtime.store.setLinksStatus(id, status, reason);
}
