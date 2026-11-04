import { createHash, randomUUID } from "node:crypto";
import { MAX_FILE_BYTES } from "./config.js";
import { FileError } from "./errors.js";
import { fileNamespace } from "./memory.js";
import { assertFileMetadata, assertFileTags, consoleObjectName, fileMetadata, fileTags } from "./meta.js";

const NAME_LIMIT = 255;

/**
 * Upload, download, and delete. The store decides who can see a row.
 * Console is injected so tests never touch the network.
 */
export function createFileService({ store, storage, memory }) {
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
      const draft = {
        id: input.id || randomUUID(),
        tenantId: channel.tenantId,
        channelId: channel.id,
        ownerUserId: input.actorUserId || null,
        ownerGuestId: input.ownerGuestId || null,
        slackFileId: input.slackFileId || null,
        name,
      };
      assertFileMetadata(fileMetadata(draft));
      assertFileTags(fileTags(draft));
      const message = input.messageId
        ? { id: input.messageId }
        : store.insertMessage({
          tenantId: channel.tenantId,
          channelId: channel.id,
          externalMessageId: input.externalMessageId || null,
          authorUserId: input.actorUserId || null,
        });
      const row = store.insertUploading({
        ...draft,
        messageId: message.id,
        ownerName: input.ownerName || store.viewerName(input.actorUserId) || "",
        mimeType,
        sizeBytes: bytes.length,
        sha256: sha256Bytes(bytes),
      });
      store.stashUpload(row.id, bytes);
      try {
        return await placeStoredFile({ store, storage }, row, bytes);
      } catch (error) {
        if (error instanceof FileError) throw error;
        if (error?.code === "plan_limit_exceeded" || error?.code === "payload_too_large" || error?.code === "metadata_too_large") {
          throw new FileError(error.code === "payload_too_large" ? 413 : 422, error.code, "Storage is paused, try later");
        }
        throw new FileError(502, "storage", "Storage is paused, try later");
      }
    },

    async download(userId, fileId) {
      const file = store.getVisible(userId, fileId);
      if (!file || !file.consoleFileId) throw new FileError(404, "not_found", "Not found");
      if (!storage?.download) throw new FileError(503, "paused", "Storage is paused, try later");
      let plain;
      try {
        plain = await storage.download({
          spaceId: file.consoleSpaceId,
          folderId: file.consoleFolderId,
          fileId: file.consoleFileId,
        });
      } catch {
        throw new FileError(502, "storage", "The file could not be read");
      }
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

/**
 * Send plaintext to Console and mark the row active.
 * A file id saved by `onAccepted` lets a later pass finish the same upload.
 */
export async function placeStoredFile(runtime, file, plain) {
  const { store, storage } = runtime;
  if (!storage?.resolveFolder || !storage?.put) throw new Error("Storage is paused, try later");
  const tags = assertFileTags(fileTags(file));
  if (file.consoleFileId && storage.finish) {
    await storage.finish({
      folderId: file.consoleFolderId,
      fileId: file.consoleFileId,
      tags,
    });
    return commitStoredFile(store, file.id, {
      spaceId: file.consoleSpaceId,
      folderId: file.consoleFolderId,
      fileId: file.consoleFileId,
      state: "active",
    });
  }
  const metadata = assertFileMetadata(fileMetadata(file));
  const folder = await storage.resolveFolder({ tenantId: file.tenantId, channelId: file.channelId });
  const placed = await storage.put({
    name: consoleObjectName(file),
    plain,
    metadata,
    tags,
    folder,
    onAccepted: async (accepted) => {
      store.patchFile(file.id, {
        consoleSpaceId: accepted.spaceId || folder.spaceId,
        consoleFolderId: accepted.folderId || folder.folderId,
        consoleFileId: accepted.fileId,
        consoleState: "uploading",
      });
    },
  });
  return commitStoredFile(store, file.id, placed);
}

function commitStoredFile(store, fileId, placed) {
  const current = store.getFile(fileId);
  if (current && current.status !== "uploading" && current.status !== "active") return current;
  return store.markActive(fileId, placed);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
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
