import { randomUUID } from "node:crypto";
import { DELETE_REQUEST_DAILY_CAP, DELETE_REQUEST_HOURS, JOB_MAX_ATTEMPTS } from "./config.js";
import { FileError, publicError } from "./errors.js";
import { fileNamespace } from "./memory.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * In-memory stand-in for the files tables and their RPCs.
 * Visibility matches the RLS policies: current channel membership, plus the
 * owner's own pending deletes. Jobs are claimed one at a time (skip locked).
 */
export function createFileStore({ clock = () => new Date() } = {}) {
  const channels = new Map();
  const members = new Map();
  const files = new Map();
  const requests = new Map();
  const links = new Map();
  const messages = new Map();
  const bindings = new Map();
  const identities = new Map();
  const guests = new Map();
  const ciphertext = new Map();
  const consoleFolders = new Map();
  const jobs = [];
  let jobSeq = 1;

  function now() {
    const value = clock();
    return value instanceof Date ? value : new Date(value);
  }

  function member(userId) {
    return members.get(userId) || null;
  }

  function isAdmin(userId, tenantId) {
    const row = member(userId);
    if (!row) return false;
    return row.memberships.some((item) => item.tenantId === tenantId && (item.role === "owner" || item.role === "admin"));
  }

  function canSeeChannel(userId, channelId) {
    const channel = channels.get(channelId);
    const row = member(userId);
    if (!channel || !row) return false;
    const membership = row.memberships.find((item) => item.tenantId === channel.tenantId);
    if (!membership) return false;
    if (channel.visibility === "tenant") return true;
    return membership.channelIds.includes(channelId);
  }

  function visibleFile(userId, file) {
    if (!file) return false;
    if (file.status === "active" && canSeeChannel(userId, file.channelId)) return true;
    if (file.status === "pending_delete" && file.ownerUserId === userId) return true;
    return false;
  }

  function queue(fileId, kind) {
    const open = jobs.find((job) => job.fileId === fileId && job.kind === kind && (job.status === "queued" || job.status === "running" || job.status === "failed"));
    if (open) return open;
    const job = {
      id: jobSeq,
      fileId,
      kind,
      status: "queued",
      attempts: 0,
      runAfter: now(),
      lastError: null,
      locked: false,
      createdAt: now(),
    };
    jobSeq += 1;
    jobs.push(job);
    return job;
  }

  function hideFile(file, reason, deletedBy) {
    if (!file || file.status !== "active") return false;
    file.status = "pending_delete";
    file.pendingDeleteAt = now();
    file.deleteReason = reason;
    file.deletedBy = deletedBy || null;
    file.updatedAt = now();
    for (const request of requests.values()) {
      if (request.fileId === file.id && request.status === "open") {
        request.status = "moot";
        request.decidedAt = now();
      }
    }
    queue(file.id, "delete_memory");
    queue(file.id, "delete_blob");
    return true;
  }

  return {
    now,
    addChannel(input) {
      const row = {
        id: input.id || randomUUID(),
        tenantId: input.tenantId,
        name: input.name,
        visibility: input.visibility === "tenant" ? "tenant" : "invited",
      };
      channels.set(row.id, row);
      return row;
    },
    addMember(input) {
      const existing = members.get(input.userId) || { userId: input.userId, name: input.name || input.userId, memberships: [] };
      existing.name = input.name || existing.name;
      const membership = existing.memberships.find((item) => item.tenantId === input.tenantId);
      if (membership) {
        membership.role = input.role || membership.role;
        if (input.channelIds) membership.channelIds = [...input.channelIds];
      } else {
        existing.memberships.push({
          tenantId: input.tenantId,
          role: input.role || "member",
          channelIds: [...(input.channelIds || [])],
        });
      }
      members.set(input.userId, existing);
      return existing;
    },
    leaveChannel(userId, channelId) {
      const row = member(userId);
      if (!row) return;
      for (const membership of row.memberships) {
        membership.channelIds = membership.channelIds.filter((id) => id !== channelId);
      }
    },
    bindExternal({ provider, externalChannelId, channelId }) {
      bindings.set(`${provider}:${externalChannelId}`, channelId);
    },
    channelByExternal(provider, externalChannelId) {
      const id = bindings.get(`${provider}:${externalChannelId}`);
      return id ? channels.get(id) || null : null;
    },
    linkExternalUser({ provider, externalUserId, userId, guestId }) {
      identities.set(`${provider}:${externalUserId}`, { userId: userId || null, guestId: guestId || null });
    },
    userByExternal(provider, externalUserId) {
      return identities.get(`${provider}:${externalUserId}`) || null;
    },
    ensureGuest({ tenantId, externalUserId, name }) {
      const key = `${tenantId}:${externalUserId}`;
      const existing = [...guests.values()].find((guest) => guest.key === key && !guest.mergedInto);
      if (existing) return existing;
      const guest = { id: randomUUID(), tenantId, key, name: name || externalUserId, mergedInto: null };
      guests.set(guest.id, guest);
      return guest;
    },
    mergeGuest(guestId, userId) {
      const guest = guests.get(guestId);
      if (!guest || guest.mergedInto) return 0;
      guest.mergedInto = userId;
      for (const file of files.values()) {
        if (file.ownerGuestId === guestId && !file.ownerUserId) {
          file.ownerUserId = userId;
          file.ownerGuestId = null;
        }
      }
      return 1;
    },
    channel(id) {
      return channels.get(id) || null;
    },
    canSeeChannel,
    isAdmin,
    viewerName(userId) {
      return member(userId)?.name || "";
    },
    isWorkspaceAdmin(userId) {
      const row = member(userId);
      if (!row) return false;
      return row.memberships.some((item) => item.role === "owner" || item.role === "admin");
    },
    insertMessage(input) {
      const row = {
        id: input.id || randomUUID(),
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalMessageId: input.externalMessageId || null,
        authorUserId: input.authorUserId || null,
        deletedAt: input.deletedAt || null,
      };
      messages.set(row.id, row);
      return row;
    },
    insertUploading(input) {
      if (!input.ownerUserId && !input.ownerGuestId) {
        throw new FileError(400, "owner", "A file needs an owner");
      }
      const row = {
        id: input.id || randomUUID(),
        tenantId: input.tenantId,
        channelId: input.channelId,
        messageId: input.messageId || null,
        ownerUserId: input.ownerUserId || null,
        ownerGuestId: input.ownerGuestId || null,
        ownerName: input.ownerName || "",
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        slackFileId: input.slackFileId || null,
        consoleSpaceId: null,
        consoleFolderId: null,
        consoleFileId: null,
        consoleState: null,
        status: "uploading",
        deleteReason: null,
        deletedBy: null,
        createdAt: now(),
        updatedAt: now(),
        pendingDeleteAt: null,
        deletedAt: null,
        uploadStep: null,
      };
      files.set(row.id, row);
      queue(row.id, "upload");
      return copyFile(row);
    },
    stashUpload(fileId, bytes) {
      ciphertext.set(fileId, Buffer.from(bytes));
    },
    peekUpload(fileId) {
      const found = ciphertext.get(fileId);
      return found ? Buffer.from(found) : null;
    },
    dropUpload(fileId) {
      ciphertext.delete(fileId);
    },
    saveUploadStep(fileId, step) {
      const file = files.get(fileId);
      if (file) file.uploadStep = step;
      const job = jobs.find((item) => item.fileId === fileId && item.kind === "upload");
      if (job) job.payload = step;
    },
    loadUploadStep(fileId) {
      return files.get(fileId)?.uploadStep || null;
    },
    markActive(fileId, placed) {
      const file = files.get(fileId);
      if (!file) throw new FileError(404, "not_found", "Not found");
      file.consoleSpaceId = placed.spaceId || file.consoleSpaceId;
      file.consoleFolderId = placed.folderId || file.consoleFolderId;
      file.consoleFileId = placed.fileId || file.consoleFileId;
      file.consoleState = placed.state || "active";
      file.status = "active";
      file.updatedAt = now();
      ciphertext.delete(fileId);
      return copyFile(file);
    },
    markFailed(fileId, reason) {
      const file = files.get(fileId);
      if (!file || file.status === "deleted") return null;
      file.status = "failed";
      file.updatedAt = now();
      file.lastError = publicError(reason);
      return copyFile(file);
    },
    markDeleted(fileId) {
      const file = files.get(fileId);
      if (!file) return null;
      file.status = "deleted";
      file.deletedAt = now();
      file.updatedAt = now();
      return copyFile(file);
    },
    findConsoleFolder(spaceId, name) {
      const row = consoleFolders.get(`${spaceId}:${name}`);
      return row ? { ...row } : null;
    },
    saveConsoleFolder(input) {
      const row = {
        spaceId: input.spaceId,
        name: input.name,
        folderId: input.folderId,
        sealPolicyId: input.sealPolicyId || null,
      };
      consoleFolders.set(`${row.spaceId}:${row.name}`, { ...row });
      return { ...row };
    },
    getFile(id) {
      const file = files.get(id);
      return file ? copyFile(file) : null;
    },
    patchFile(id, fields) {
      const file = files.get(id);
      if (!file) return null;
      Object.assign(file, fields);
      return copyFile(file);
    },
    patchRequest(id, fields) {
      const request = requests.get(id);
      if (!request) return null;
      Object.assign(request, fields);
      return copyRequest(request);
    },
    listVisible(userId) {
      return [...files.values()].filter((file) => visibleFile(userId, file)).map(copyFile);
    },
    getVisible(userId, id) {
      const file = files.get(id);
      if (!visibleFile(userId, file)) return null;
      return copyFile(file);
    },
    deleteFile(userId, fileId, reason) {
      const file = files.get(fileId);
      if (!file) throw new FileError(404, "not_found", "Not found");
      const allowed = file.ownerUserId === userId || isAdmin(userId, file.tenantId);
      if (!allowed) {
        throw new FileError(visibleFile(userId, file) ? 403 : 404, "not_allowed", visibleFile(userId, file) ? "Not allowed" : "Not found");
      }
      if (file.status !== "active") return copyFile(file);
      const deleteReason = reason === "request_approved"
        ? "request_approved"
        : (file.ownerUserId === userId ? "owner" : "moderation");
      hideFile(file, deleteReason, userId);
      return copyFile(file);
    },
    requestDelete(userId, fileId, reason) {
      const file = files.get(fileId);
      if (!file || file.status !== "active" || !canSeeChannel(userId, file.channelId)) {
        throw new FileError(404, "not_found", "Not found");
      }
      if (file.ownerUserId === userId) {
        throw new FileError(403, "not_allowed", "The owner deletes the file directly");
      }
      const text = reason == null ? null : String(reason);
      if (text && text.length > 500) throw new FileError(400, "reason", "Reason is too long");
      const openSame = [...requests.values()].find((item) => item.fileId === fileId && item.requestedBy === userId && item.status === "open");
      if (openSame) throw new FileError(409, "open", "A request is already open");
      const since = now().getTime() - DAY;
      const recent = [...requests.values()].filter((item) => item.requestedBy === userId && item.status === "open" && item.createdAt.getTime() > since);
      if (recent.length >= DELETE_REQUEST_DAILY_CAP) {
        throw new FileError(429, "abuse", "Too many open delete requests");
      }
      const request = {
        id: randomUUID(),
        fileId,
        tenantId: file.tenantId,
        requestedBy: userId,
        requestedByName: member(userId)?.name || "",
        reason: text,
        status: "open",
        decidedBy: null,
        decidedAt: null,
        createdAt: now(),
      };
      requests.set(request.id, request);
      return copyRequest(request);
    },
    answerDelete(userId, requestId, approve) {
      const request = requests.get(requestId);
      if (!request || request.status !== "open") throw new FileError(404, "not_found", "Not found");
      const file = files.get(request.fileId);
      if (!file || file.ownerUserId !== userId) throw new FileError(403, "not_allowed", "Not allowed");
      request.status = approve ? "approved" : "declined";
      request.decidedBy = userId;
      request.decidedAt = now();
      if (approve) hideFile(file, "request_approved", userId);
      return { request: copyRequest(request), file: file ? copyFile(file) : null };
    },
    dismissDelete(userId, requestId) {
      const request = requests.get(requestId);
      if (!request || request.status !== "open") throw new FileError(404, "not_found", "Not found");
      if (!isAdmin(userId, request.tenantId)) throw new FileError(403, "not_allowed", "Not allowed");
      request.status = "dismissed";
      request.decidedBy = userId;
      request.decidedAt = now();
      return copyRequest(request);
    },
    listRequests(userId) {
      return [...requests.values()].filter((request) => {
        if (request.requestedBy === userId) return true;
        const file = files.get(request.fileId);
        if (file?.ownerUserId === userId) return true;
        if (isAdmin(userId, request.tenantId)) return true;
        return false;
      }).map(copyRequest);
    },
    listUnanswered(userId, hours = DELETE_REQUEST_HOURS) {
      const cutoff = now().getTime() - hours * HOUR;
      return [...requests.values()].filter((request) => {
        return request.status === "open" && request.createdAt.getTime() < cutoff && isAdmin(userId, request.tenantId);
      }).map(copyRequest);
    },
    addLink(input) {
      const row = {
        fileId: input.fileId,
        memoryBlobId: input.memoryBlobId,
        memoryObjectId: input.memoryObjectId || null,
        namespace: input.namespace || fileNamespace(input.fileId),
        status: input.status || "live",
        reason: null,
        createdAt: now(),
      };
      const list = links.get(row.fileId) || [];
      list.push(row);
      links.set(row.fileId, list);
      return { ...row };
    },
    linksFor(fileId) {
      return (links.get(fileId) || []).map((link) => ({ ...link }));
    },
    setLinksStatus(fileId, status, reason) {
      for (const link of links.get(fileId) || []) {
        link.status = status;
        link.reason = reason || null;
      }
    },
    markMessageDeleted(messageId) {
      const message = messages.get(messageId);
      if (!message || message.deletedAt) return 0;
      message.deletedAt = now();
      let count = 0;
      for (const file of files.values()) {
        if (file.messageId === messageId && hideFile(file, "message_deleted", null)) count += 1;
      }
      return count;
    },
    markExternalMessageDeleted(externalMessageId) {
      let count = 0;
      for (const message of messages.values()) {
        if (message.externalMessageId === externalMessageId) count += this.markMessageDeleted(message.id);
      }
      return count;
    },
    failStuckUploads(maxAgeMs) {
      const cutoff = now().getTime() - maxAgeMs;
      const failed = [];
      for (const file of files.values()) {
        if (file.status === "uploading" && file.createdAt.getTime() < cutoff) {
          file.status = "failed";
          file.updatedAt = now();
          failed.push(file.id);
        }
      }
      return failed;
    },
    claimJob() {
      const due = jobs
        .filter((job) => !job.locked && (job.status === "queued" || job.status === "failed") && job.runAfter.getTime() <= now().getTime())
        .sort((a, b) => a.runAfter - b.runAfter || a.id - b.id);
      const job = due[0];
      if (!job) return null;
      job.locked = true;
      job.status = "running";
      job.attempts += 1;
      return copyJob(job);
    },
    finishJob(id) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return null;
      job.status = "done";
      job.locked = false;
      job.lastError = null;
      return copyJob(job);
    },
    skipJob(id, reason) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return null;
      job.status = "skipped";
      job.locked = false;
      job.lastError = publicError(reason);
      return copyJob(job);
    },
    failJob(id, error, delayMs) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return null;
      job.locked = false;
      job.lastError = publicError(error);
      if (job.attempts >= JOB_MAX_ATTEMPTS) {
        job.status = "dead";
        return copyJob(job);
      }
      job.status = "failed";
      job.runAfter = new Date(now().getTime() + delayMs);
      return copyJob(job);
    },
    enqueue(fileId, kind) {
      return copyJob(queue(fileId, kind));
    },
    jobsFor(fileId) {
      return jobs.filter((job) => job.fileId === fileId).map(copyJob);
    },
    allJobs() {
      return jobs.map(copyJob);
    },
  };
}

export function backoffDelayMs(attempts) {
  const minute = 60 * 1000;
  const cap = 6 * HOUR;
  const delay = minute * (2 ** Math.max(0, attempts - 1));
  return Math.min(cap, delay);
}

function copyFile(file) {
  return { ...file, sha256: file.sha256 ? Buffer.from(file.sha256) : null };
}

function copyRequest(request) {
  return { ...request };
}

function copyJob(job) {
  return { ...job };
}
