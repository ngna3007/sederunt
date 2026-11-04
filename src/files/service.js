import { randomUUID } from "node:crypto";
import { fileEpochs, MAX_FILE_BYTES } from "./config.js";
import { openEnvelope, sealEnvelope, sha256Bytes } from "./envelope.js";
import { FileError } from "./errors.js";
import { fileNamespace } from "./memory.js";

const NAME_LIMIT = 255;

/**
 * Upload, download, and delete. The store decides who can see a row.
 * Walrus and Seal are injected so tests never touch the network.
 */
export function createFileService({ store, storage, seal, memory, env = {}, serverSecret = "" }) {
  async function encrypt(plain) {
    return sealEnvelope(plain, { seal: seal || null, serverSecret });
  }

  async function putBlob(file, envelopeBytes) {
    if (!storage) throw new FileError(503, "paused", "Storage is paused, try later");
    store.stashCiphertext(file.id, envelopeBytes);
    const resume = store.loadUploadStep(file.id);
    const written = await storage.writeBlob({
      bytes: envelopeBytes,
      deletable: true,
      epochs: fileEpochs(env),
      attributes: {
        "sederunt:file_id": file.id,
        "sederunt:tenant_id": file.tenantId,
        "sederunt:channel_id": file.channelId,
      },
      resume: resume?.step ? resume : undefined,
      onStep: (step) => store.saveUploadStep(file.id, step),
    });
    return store.markActive(file.id, {
      blobId: written.blobId,
      objectId: written.objectId,
      endEpoch: written.endEpoch ?? null,
      envelopeMode: file.envelopeMode,
    });
  }

  return {
    async upload(input) {
      const channel = store.channel(input.channelId);
      const trustedGuest = Boolean(input.trusted && input.ownerGuestId && !input.actorUserId);
      if (!channel) throw new FileError(404, "not_found", "Not found");
      if (!trustedGuest && !store.canSeeChannel(input.actorUserId, channel.id)) {
        throw new FileError(404, "not_found", "Not found");
      }
      const name = cleanName(input.name);
      const mimeType = cleanMime(input.mimeType);
      const bytes = Buffer.from(input.bytes);
      if (bytes.length < 1) throw new FileError(400, "empty", "The file is empty");
      if (bytes.length > MAX_FILE_BYTES) throw new FileError(413, "too_large", "payload_too_large");
      const message = input.messageId
        ? { id: input.messageId }
        : store.insertMessage({
          tenantId: channel.tenantId,
          channelId: channel.id,
          externalMessageId: input.externalMessageId || null,
          authorUserId: input.actorUserId || null,
        });
      const envelope = await encrypt(bytes);
      const row = store.insertUploading({
        tenantId: channel.tenantId,
        channelId: channel.id,
        messageId: message.id,
        ownerUserId: input.actorUserId || null,
        ownerGuestId: input.ownerGuestId || null,
        ownerName: input.ownerName || store.viewerName(input.actorUserId) || "",
        name,
        mimeType,
        sizeBytes: bytes.length,
        sha256: sha256Bytes(bytes),
        id: input.id || randomUUID(),
      });
      row.envelopeMode = envelope.mode;
      try {
        return await putBlob(row, envelope.bytes);
      } catch (error) {
        if (error instanceof FileError) throw error;
        throw new FileError(502, "storage", "Storage is paused, try later");
      }
    },

    async download(userId, fileId) {
      const file = store.getVisible(userId, fileId);
      if (!file || !file.walrusBlobId) throw new FileError(404, "not_found", "Not found");
      if (!storage) throw new FileError(503, "paused", "Storage is paused, try later");
      let ciphertext;
      try {
        ciphertext = await storage.readBlob({ blobId: file.walrusBlobId });
      } catch (error) {
        throw new FileError(502, "storage", "The file could not be read");
      }
      const plain = await openEnvelope(ciphertext, { seal: seal || null, serverSecret });
      return { file, bytes: plain };
    },

    deleteFile(userId, fileId) {
      return store.deleteFile(userId, fileId);
    },

    requestDelete(userId, fileId, reason) {
      return store.requestDelete(userId, fileId, reason);
    },

    answerDelete(userId, requestId, approve) {
      return store.answerDelete(userId, requestId, approve);
    },

    dismissDelete(userId, requestId) {
      return store.dismissDelete(userId, requestId);
    },

    async rememberAboutFile({ fileId, text, writer }) {
      const file = store.getFile(fileId);
      if (!file) throw new FileError(404, "not_found", "Not found");
      const namespace = fileNamespace(fileId);
      if (!writer) {
        throw new FileError(503, "memory", "No Sederunt Walrus Memory account is configured");
      }
      const saved = await writer.remember({ text, namespace });
      const link = store.addLink({
        fileId,
        memoryBlobId: saved.blobId,
        memoryObjectId: saved.objectId || null,
        namespace,
      });
      return link;
    },

    list(userId) {
      const files = store.listVisible(userId).map((file) => presentFile(store, userId, file));
      const requests = store.listRequests(userId).map((request) => presentRequest(store, userId, request));
      const unanswered = store.listUnanswered(userId).map((request) => presentRequest(store, userId, request));
      return {
        viewer: {
          userId,
          name: store.viewerName(userId),
          admin: store.isWorkspaceAdmin(userId),
        },
        files,
        requests,
        unanswered,
      };
    },
  };
}

function presentFile(store, userId, file) {
  const channel = store.channel(file.channelId);
  const owner = file.ownerUserId === userId;
  const admin = store.isAdmin(userId, file.tenantId);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    channelId: file.channelId,
    channelName: channel?.name || "Channel",
    ownerUserId: file.ownerUserId,
    ownerName: file.ownerName || "Someone",
    createdAt: file.createdAt.toISOString(),
    status: file.status,
    deleting: file.status === "pending_delete",
    canDelete: file.status === "active" && (owner || admin),
    canRequest: file.status === "active" && !owner && !admin && store.canSeeChannel(userId, file.channelId),
  };
}

function presentRequest(store, userId, request) {
  const file = store.getFile(request.fileId);
  const owner = file?.ownerUserId === userId;
  const admin = store.isAdmin(userId, request.tenantId);
  const ageMs = store.now().getTime() - new Date(request.createdAt).getTime();
  return {
    id: request.id,
    fileId: request.fileId,
    fileName: file?.name || "File",
    channelName: file ? (store.channel(file.channelId)?.name || "") : "",
    requestedBy: request.requestedBy,
    requestedByName: request.requestedByName || "Someone",
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    canAnswer: owner && request.status === "open",
    canDismiss: admin && request.status === "open" && ageMs >= 72 * 60 * 60 * 1000,
  };
}

function cleanName(name) {
  const text = String(name || "").replace(/[/\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > NAME_LIMIT) throw new FileError(400, "name", "The file needs a name");
  return text;
}

function cleanMime(mime) {
  const text = String(mime || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!text || text.length > NAME_LIMIT) return "application/octet-stream";
  return text;
}
