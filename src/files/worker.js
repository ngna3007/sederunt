import { RENEW_MARGIN_EPOCHS, UPLOAD_STUCK_MS, fileEpochs } from "./config.js";
import { fileNamespace } from "./memory.js";
import { backoffDelayMs } from "./store.js";

/**
 * One pass over due file jobs. Claim is for-update-skip-locked in the SQL
 * migration and a single locked row here. Failures wait 1 minute, then double
 * up to 6 hours, and die after 12 attempts.
 */
export async function runFileWorker(runtime, { limit = 8, renew = true } = {}) {
  const { store, storage, memory, env } = runtime;
  store.failStuckUploads(UPLOAD_STUCK_MS);
  if (renew && storage?.currentEpoch) {
    const epoch = await storage.currentEpoch();
    for (const file of store.filesDueForRenew(epoch, RENEW_MARGIN_EPOCHS)) {
      const existing = store.jobsFor(file.id).some((job) => job.kind === "renew" && (job.status === "queued" || job.status === "failed" || job.status === "running"));
      if (!existing) store.enqueue(file.id, "renew");
    }
  }
  const ran = [];
  for (let i = 0; i < limit; i += 1) {
    const job = store.claimJob();
    if (!job) break;
    try {
      const outcome = await runJob(runtime, job, env);
      const finished = outcome?.skipped ? store.skipJob(job.id, outcome.reason) : store.finishJob(job.id);
      ran.push(finished);
    } catch (error) {
      const delay = backoffDelayMs(job.attempts);
      ran.push(store.failJob(job.id, error, delay));
    }
  }
  return ran;
}

async function runJob(runtime, job, env) {
  const file = runtime.store.getFile(job.fileId);
  if (!file) return null;
  if (job.kind === "upload") return uploadJob(runtime, file, env);
  if (job.kind === "delete_blob") return deleteBlobJob(runtime, file);
  if (job.kind === "delete_memory") return deleteMemoryJob(runtime, file);
  if (job.kind === "renew") return renewJob(runtime, file, env);
  throw new Error(`Unknown file job ${job.kind}`);
}

async function uploadJob(runtime, file) {
  if (file.status === "active" || file.status === "deleted") return null;
  if (file.status === "failed") return null;
  const bytes = runtime.store.peekCiphertext(file.id);
  if (!bytes) throw new Error("Upload bytes are gone; the file will be marked failed once it is stuck");
  if (!runtime.storage) throw new Error("Storage is paused, try later");
  const resume = runtime.store.loadUploadStep(file.id);
  const written = await runtime.storage.writeBlob({
    bytes,
    deletable: true,
    epochs: fileEpochs(runtime.env || {}),
    attributes: attributesFor(file),
    resume: resume && resume.step ? resume : undefined,
    onStep: (step) => runtime.store.saveUploadStep(file.id, step),
  });
  runtime.store.markActive(file.id, {
    blobId: written.blobId,
    objectId: written.objectId,
    endEpoch: written.endEpoch,
    sealId: file.sealId,
    envelopeMode: file.envelopeMode,
  });
  return null;
}

async function deleteBlobJob(runtime, file) {
  if (file.status === "deleted") return null;
  if (!file.suiObjectId) {
    runtime.store.markDeleted(file.id);
    return null;
  }
  if (!runtime.storage) throw new Error("Storage is paused, try later");
  await runtime.storage.deleteBlob({ blobObjectId: file.suiObjectId });
  runtime.store.markDeleted(file.id);
  return null;
}

async function deleteMemoryJob(runtime, file) {
  const links = runtime.store.linksFor(file.id);
  const outcome = await runtime.memory.forgetFile({ fileId: file.id, links });
  if (outcome.skipped) {
    if (!links.length) {
      runtime.store.addLink({
        fileId: file.id,
        memoryBlobId: "unconfigured",
        namespace: outcome.namespace || fileNamespace(file.id),
        status: "skipped",
      });
    }
    runtime.store.setLinksStatus(file.id, "skipped", outcome.reason);
    return outcome;
  }
  runtime.store.setLinksStatus(file.id, "deleted", null);
  return null;
}

async function renewJob(runtime, file) {
  if (file.status !== "active" || !file.suiObjectId) return null;
  if (!runtime.storage?.extendBlob) throw new Error("Storage is paused, try later");
  const extended = await runtime.storage.extendBlob({
    blobObjectId: file.suiObjectId,
    epochs: fileEpochs(runtime.env || {}),
  });
  if (extended?.endEpoch != null) runtime.store.setEndEpoch(file.id, extended.endEpoch);
  return null;
}

function attributesFor(file) {
  return {
    "sederunt:file_id": file.id,
    "sederunt:tenant_id": file.tenantId,
    "sederunt:channel_id": file.channelId,
  };
}
