import { MAX_FILE_BYTES } from "./config.js";
import { FileError, publicError } from "./errors.js";

/**
 * File HTTP routes. A missing or hidden file is 404, including a non-member.
 * The body is read here as bytes. The shared text body reader would corrupt it.
 */
export async function handleFileRequest(req, res, url, runtime, { send }) {
  const path = url.pathname;
  if (!path.startsWith("/api/files")) return false;
  try {
    const viewer = runtime.viewer ? await runtime.viewer(req, url) : null;
    const userId = viewer?.userId || "";
    const channels = Array.isArray(viewer?.channels) ? viewer.channels : [];
    // Background runtimes fire-and-forget. Foreground (Vercel) awaits the pass
    // so delete jobs finish before the response, or they stay "Deleting…".
    async function settleJobs() {
      if (typeof runtime.kick !== "function") return;
      if (runtime.background === true) {
        runtime.kick();
        return;
      }
      await runtime.kick();
    }
    if (req.method === "GET" && path === "/api/files") {
      if (!userId) {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({ viewer: null, files: [], requests: [], unanswered: [] }));
        return true;
      }
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(runtime.service.list(userId, { channels })));
      return true;
    }
    if (req.method === "GET" && path === "/api/files/unanswered") {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ unanswered: runtime.service.list(userId).unanswered }));
      return true;
    }
    if (req.method === "POST" && path === "/api/files") {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const upload = await readUpload(req);
      const channelId = upload.channelId || (channels.length === 1 ? channels[0].id : "");
      const saved = await runtime.service.upload({
        actorUserId: userId,
        channelId,
        name: upload.name,
        mimeType: upload.mimeType,
        bytes: upload.bytes,
        ownerName: viewer.name || "",
        defer: runtime.background === true,
      });
      if (runtime.background === true) {
        await settleJobs();
        send(res, 202, "application/json; charset=utf-8", JSON.stringify(publicFile(saved)));
        return true;
      }
      send(res, 201, "application/json; charset=utf-8", JSON.stringify(publicFile(saved)));
      return true;
    }
    const answer = /^\/api\/files\/requests\/([^/]+)\/answer$/.exec(path);
    if (req.method === "POST" && answer) {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const body = await readJson(req);
      const result = runtime.service.answerDelete(userId, decodeURIComponent(answer[1]), body.approve === true);
      if (result.file) await settleJobs();
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        request: { id: result.request.id, status: result.request.status },
        file: result.file ? { id: result.file.id, status: result.file.status } : null,
      }));
      return true;
    }
    const dismiss = /^\/api\/files\/requests\/([^/]+)\/dismiss$/.exec(path);
    if (req.method === "POST" && dismiss) {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const request = runtime.service.dismissDelete(userId, decodeURIComponent(dismiss[1]));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ id: request.id, status: request.status }));
      return true;
    }
    const link = /^\/api\/files\/([^/]+)\/link$/.exec(path);
    if (req.method === "POST" && link) {
      if (!userId || !runtime.links) throw new FileError(404, "not_found", "Not found");
      const fileId = decodeURIComponent(link[1]);
      const file = runtime.store.getVisible(userId, fileId);
      if (!file || file.status !== "active") throw new FileError(404, "not_found", "Not found");
      const issued = runtime.links.issue(fileId, userId);
      const query = new URLSearchParams({ token: issued.token });
      if (url.searchParams.get("as")) query.set("as", url.searchParams.get("as"));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        url: `/api/files/${encodeURIComponent(fileId)}/download?${query}`,
        expiresAt: issued.expiresAt,
      }));
      return true;
    }
    const signed = /^\/api\/files\/([^/]+)\/download$/.exec(path);
    if (req.method === "GET" && signed) {
      const fileId = decodeURIComponent(signed[1]);
      const opened = runtime.links ? runtime.links.open(url.searchParams.get("token"), fileId) : null;
      if (!opened) throw new FileError(410, "link_expired", "This download link has expired. Go back and choose Download again.");
      // The link carries the person, so it works in a new tab; access is checked again here.
      const downloaded = await runtime.service.download(opened.userId, fileId);
      sendFile(res, send, downloaded);
      return true;
    }
    const discard = /^\/api\/files\/([^/]+)\/discard$/.exec(path);
    if (req.method === "POST" && discard) {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const file = runtime.service.discardFailed(userId, decodeURIComponent(discard[1]));
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ id: file.id, status: file.status }));
      return true;
    }
    const filePath = /^\/api\/files\/([^/]+)$/.exec(path);
    const sub = /^\/api\/files\/([^/]+)\/(delete|request-delete)$/.exec(path);
    if (req.method === "GET" && filePath) {
      if (!userId) throw new FileError(404, "not_found", "Not found");
      const downloaded = await runtime.service.download(userId, decodeURIComponent(filePath[1]));
      sendFile(res, send, downloaded);
      return true;
    }
    if (req.method === "POST" && sub && sub[2] === "delete") {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const deletedId = decodeURIComponent(sub[1]);
      runtime.service.deleteFile(userId, deletedId);
      await settleJobs();
      const file = runtime.store.getFile(deletedId);
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ id: file.id, status: file.status, deleteReason: file.deleteReason }));
      return true;
    }
    if (req.method === "POST" && sub && sub[2] === "request-delete") {
      if (!userId) throw new FileError(401, "auth", "Sign in again.");
      const body = await readJson(req);
      const request = runtime.service.requestDelete(userId, decodeURIComponent(sub[1]), body.reason);
      send(res, 201, "application/json; charset=utf-8", JSON.stringify({ id: request.id, status: request.status }));
      return true;
    }
    send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }));
    return true;
  } catch (error) {
    const status = error instanceof FileError ? error.status : 500;
    const message = error instanceof FileError ? error.message : "The file request failed";
    send(res, status, "application/json; charset=utf-8", JSON.stringify({ error: publicError(message) }));
    return true;
  }
}

function sendFile(res, send, downloaded) {
  const name = downloaded.file.name.replace(/["\r\n\\]/g, "").replace(/[^\x20-\x7e]/g, "_");
  send(res, 200, downloaded.file.mimeType || "application/octet-stream", downloaded.bytes, {
    "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(downloaded.file.name)}`,
    "cache-control": "no-store",
  });
}

function publicFile(file) {
  return {
    id: file.id,
    name: file.name,
    status: file.status,
    sizeBytes: file.sizeBytes,
    consoleFileId: file.consoleFileId,
    consoleFolderId: file.consoleFolderId,
    channelId: file.channelId,
  };
}

async function readUpload(req) {
  const type = String(req.headers["content-type"] || "");
  const raw = await readBytes(req, MAX_FILE_BYTES);
  if (type.includes("multipart/form-data")) {
    const parts = parseMultipart(raw, type);
    const file = parts.find((part) => part.filename || part.name === "file");
    const channel = parts.find((part) => part.name === "channelId" || part.name === "channel_id");
    if (!file) throw new FileError(400, "file", "The file is missing");
    return {
      bytes: file.body,
      name: file.filename || headerName(req),
      mimeType: file.type || "application/octet-stream",
      channelId: channel ? channel.body.toString("utf8").trim() : headerValue(req.headers["x-channel-id"]),
    };
  }
  return {
    bytes: raw,
    name: headerName(req),
    mimeType: type.split(";")[0].trim() || "application/octet-stream",
    channelId: headerValue(req.headers["x-channel-id"]),
  };
}

function headerName(req) {
  const raw = headerValue(req.headers["x-file-name"]);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

async function readBytes(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new FileError(413, "too_large", "payload_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBytes(req, 64 * 1024);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new FileError(400, "json", "The request was not understood");
  }
}

export function parseMultipart(buffer, contentType) {
  const match = /boundary="?([^";]+)"?/i.exec(contentType || "");
  if (!match) throw new FileError(400, "multipart", "Upload was not understood");
  const boundary = Buffer.from(`--${match[1]}`);
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    else if (buffer[start] === 10) start += 1;
    const next = buffer.indexOf(boundary, start);
    if (next === -1) break;
    let end = next;
    if (buffer[end - 2] === 13 && buffer[end - 1] === 10) end -= 2;
    else if (buffer[end - 1] === 10) end -= 1;
    const chunk = buffer.subarray(start, end);
    const headerEnd = indexOfBuffer(chunk, Buffer.from("\r\n\r\n"));
    const split = headerEnd === -1 ? indexOfBuffer(chunk, Buffer.from("\n\n")) : headerEnd;
    const sep = headerEnd === -1 ? 2 : 4;
    if (split === -1) {
      start = next;
      continue;
    }
    const headerText = chunk.subarray(0, split).toString("utf8");
    const name = /name="([^"]*)"/.exec(headerText)?.[1] || "";
    const filename = /filename="([^"]*)"/.exec(headerText)?.[1] || "";
    const type = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || "";
    parts.push({ name, filename, type, body: chunk.subarray(split + sep) });
    start = next;
  }
  return parts;
}

function indexOfBuffer(buf, needle) {
  return buf.indexOf(needle);
}
