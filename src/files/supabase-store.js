import { randomUUID } from "node:crypto";
import { FileError } from "./errors.js";

const byteFields = new Set(["sha256", "bytes", "ciphertext", "nonce"]);
const dateFields = new Set(["createdAt", "updatedAt", "deletedAt", "pendingDeleteAt", "decidedAt", "runAfter", "leaseUntil"]);

/** Service-role adapter. Every viewer read obtains current database membership. */
export function createSupabaseFileStore({ env = {}, fetch: fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const base = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key) throw new Error("Durable Files storage is not configured");
  async function request(path, { method = "GET", body, prefer } = {}) {
    let response;
    try {
      response = await fetchImpl(`${base}/rest/v1/${path}`, {
        method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000),
      });
    } catch { throw new FileError(503, "files_unavailable", "Files could not be refreshed. Try again."); }
    if (!response.ok) {
      let code;
      try { code = (await response.json()).code; } catch {}
      if (code === "P0002") throw new FileError(404, "not_found", "Not found");
      if (code === "42501") throw new FileError(403, "not_allowed", "Not allowed");
      if (code === "23505") throw new FileError(409, "duplicate", "A delete request is already open");
      if (code === "23514") throw new FileError(400, "invalid", "Invalid file request");
      if (code === "PT409") throw new FileError(409, "lease_lost", "File job lease lost");
      throw new FileError(503, "files_unavailable", "Files could not be refreshed. Try again.");
    }
    if (response.status === 204) return null;
    return decode(await response.json());
  }
  const rpc = (name, body) => request(`rpc/files_runtime_${name}`, { method: "POST", body });
  const table = (name, query = "") => request(`${name}?${query}`);
  const one = async (name, query) => (await table(name, `${query}&limit=1`))[0] || null;
  const upsert = async (name, body, conflict) => (await request(`${name}?on_conflict=${conflict}`, { method: "POST", body: encode(body), prefer: "resolution=merge-duplicates,return=representation" }))[0];
  const view = (userId) => rpc("view", { p_actor: userId });
  async function permissions(userId, channelId) {
    const state = await view(userId);
    return allows(state, channelId);
  }
  const action = (userId, operation, id, input = {}) => rpc("action", { p_actor: userId, p_action: operation, p_id: id, p_input: input });
  const store = {
    durable: true,
    now: () => new Date(clock()),
    view,
    async snapshot(userId) {
      const state = await view(userId);
      return {
        now: store.now,
        channel: (id) => state.channels.find((c) => c.id === id) || null,
        canSeeChannel: (_, id) => allows(state, id),
        viewerName: () => state.profile || "",
        isAdmin: (_, tenantId) => admin(state, tenantId),
        isWorkspaceAdmin: () => state.memberships.some((m) => ["owner", "admin"].includes(m.role)),
        getFile: (id) => state.files.find((f) => f.id === id) || null,
        listVisible: () => state.files.filter((f) => (f.status === "active" && allows(state, f.channelId)) || (f.status === "pending_delete" && f.ownerUserId === userId)),
        listOwnInFlight: () => state.files.filter((f) => f.ownerUserId === userId && ["uploading", "failed"].includes(f.status) && allows(state, f.channelId)),
        listRequests: () => state.requests,
        listUnanswered: () => state.requests.filter((r) => r.status === "open" && new Date(r.createdAt).getTime() <= store.now().getTime() - 72 * 3600000 && admin(state, r.tenantId)),
      };
    },
    async channel(id) { return one("channels", `id=eq.${uuid(id)}&archived_at=is.null`); },
    async addChannel(input) {
      const existing = await store.channel(input.id);
      if (existing) return existing;
      // Session setup never grants membership or promotes a role.
      return upsert("channels", input, "id");
    },
    async addMember(input) {
      const state = await view(input.userId);
      const memberships = state.memberships.filter((row) => row.tenantId === input.tenantId);
      if (!memberships.length) throw new FileError(403, "not_allowed", "Workspace access changed. Sign in again.");
      return { userId: input.userId, name: state.profile || input.name, memberships };
    },
    removeMember() {},
    canSeeChannel: permissions,
    async viewerName(userId) { return (await view(userId)).profile || ""; },
    async isAdmin(userId, tenantId) { return admin(await view(userId), tenantId); },
    async isWorkspaceAdmin(userId) { return (await view(userId)).memberships.some((m) => ["owner", "admin"].includes(m.role)); },
    async listVisible(userId) {
      const state = await view(userId);
      return state.files.filter((f) => (f.status === "active" && allows(state, f.channelId)) || (f.status === "pending_delete" && f.ownerUserId === userId));
    },
    async listOwnInFlight(userId) {
      const state = await view(userId);
      return state.files.filter((f) => f.ownerUserId === userId && ["uploading", "failed"].includes(f.status) && allows(state, f.channelId));
    },
    async getVisible(userId, id) {
      const state = await view(userId);
      return state.files.find((f) => f.id === id && f.status === "active" && allows(state, f.channelId)) || null;
    },
    getFile: (id) => one("files", `id=eq.${uuid(id)}`),
    async stageUpload(input, bytes) {
      return rpc("upload", { p_actor: input.ownerUserId, p_file: { ...input, sha256: Buffer.from(input.sha256).toString("hex") }, p_bytes: Buffer.from(bytes).toString("base64") });
    },
    async peekUpload(id) { return (await one("file_upload_staging", `file_id=eq.${uuid(id)}`))?.bytes || null; },
    async importActive(input) {
      // Console metadata without a checksum cannot be promoted to trusted rows.
      if (!input.sha256) return null;
      return rpc("import", { p_file: { ...input, sha256: Buffer.from(input.sha256).toString("hex") } });
    },
    deleteFile: (userId, id, reason) => action(userId, "delete", id, { reason }),
    requestDelete: (userId, id, reason) => action(userId, "request", id, { reason }),
    answerDelete: (userId, id, approve) => action(userId, "answer", id, { approve }),
    dismissDelete: (userId, id) => action(userId, "dismiss", id),
    discardFailed: (userId, id) => action(userId, "discard", id),
    async listRequests(userId) { return (await view(userId)).requests; },
    async listUnanswered(userId) {
      const state = await view(userId);
      return state.requests.filter((r) => r.status === "open" && new Date(r.createdAt).getTime() <= store.now().getTime() - 72 * 3600000 && admin(state, r.tenantId));
    },
    async addLink(input) { return upsert("file_memory_links", input, "file_id,memory_blob_id"); },
    linksFor: (id) => table("file_memory_links", `file_id=eq.${uuid(id)}`),
    async failStuckUploads() {
      // Durable bytes survive a restart. Exhaustion, rather than age alone,
      // makes an upload failed; a currently leased job is never timed out here.
      await request("file_jobs?status=eq.running&attempts=gte.12&lease_until=lt.now", { method: "PATCH", body: { status: "dead", claim_token: null, lease_until: null } });
      const jobs = await table("file_jobs", "status=eq.dead&kind=eq.upload");
      for (const job of jobs) await request(`files?id=eq.${uuid(job.fileId)}&status=eq.uploading`, { method: "PATCH", body: { status: "failed", updated_at: store.now().toISOString() } });
    },
    async claimJob() { return (await rpc("claim", {}))[0] || null; },
    async finishJob(id, token) { return (await rpc("settle", { p_id: id, p_token: token, p_status: "done" }))[0] || null; },
    async skipJob(id, reason, token) { return (await rpc("settle", { p_id: id, p_token: token, p_status: "skipped", p_error: String(reason).slice(0, 400) }))[0] || null; },
    async failJob(id, error, delay, token) {
      // Never persist remote errors that may contain a signed URL or credential.
      return (await rpc("settle", { p_id: id, p_token: token, p_status: "failed", p_error: "File operation failed", p_delay_ms: delay }))[0] || null;
    },
    renewJob(job) { return rpc("renew", { p_id: job.id, p_token: job.claimToken }); },
    workerMutation(job, operation, input = {}) { return rpc("worker", { p_id: job.id, p_token: job.claimToken, p_action: operation, p_input: input }); },
    jobsFor: (id) => table("file_jobs", `file_id=eq.${uuid(id)}`),
    allJobs: () => table("file_jobs"),
    findConsoleFolder: (space, name) => one("console_folders", `space_id=eq.${encodeURIComponent(space)}&name=eq.${encodeURIComponent(name)}`),
    saveConsoleFolder: (input) => upsert("console_folders", input, "space_id,name"),
    async saveConsoleCredential(input) {
      const existing = await store.findConsoleCredentialByFolder(input.folderId);
      return upsert("console_folder_credentials", { ...input, id: existing?.id || input.id || randomUUID() }, "folder_id");
    },
    findConsoleCredential: (id) => one("console_folder_credentials", `id=eq.${uuid(id)}`),
    findConsoleCredentialByFolder: (id) => one("console_folder_credentials", `folder_id=eq.${encodeURIComponent(id)}`),
    saveConsoleTenant: (input) => upsert("console_tenant_folders", tenantMapping(input), "tenant_id"),
    async findConsoleTenant(id) { return tenantResult(await one("console_tenant_folders", `tenant_id=eq.${uuid(id)}`)); },
    async findConsoleTenantByFolder(id) { return tenantResult(await one("console_tenant_folders", `console_folder_id=eq.${encodeURIComponent(id)}`)); },
    async markExternalMessageDeleted(externalId, scope = {}) {
      return rpc("message_deleted", { p_workspace: scope.externalWorkspaceId || "", p_channel: scope.externalChannelId || "", p_external_id: externalId });
    },
    async channelByExternal(provider, externalId, scope = {}) {
      if (!scope.externalWorkspaceId) return null;
      const rows = await table("channel_bindings", `provider=eq.${encodeURIComponent(provider)}&external_channel_id=eq.${encodeURIComponent(externalId)}&external_workspace_id=eq.${encodeURIComponent(scope.externalWorkspaceId)}&status=eq.active&limit=2`);
      return rows.length === 1 ? store.channel(rows[0].channelId) : null;
    },
    async userByExternal(provider, externalId, scope = {}) {
      if (!scope.externalWorkspaceId || !scope.tenantId) return null;
      const identity = await one("identities", `provider=eq.${encodeURIComponent(provider)}&external_user_id=eq.${encodeURIComponent(externalId)}&external_workspace_id=eq.${encodeURIComponent(scope.externalWorkspaceId)}`);
      if (!identity?.userId || !identity.linkedAt) return null;
      return (await view(identity.userId)).memberships.some((m) => m.tenantId === scope.tenantId) ? identity : null;
    },
    async ensureGuest() { throw new FileError(503, "binding_required", "A verified workspace-scoped Slack identity is required"); },
  };
  return store;
}

function allows(state, id) {
  const channel = state.channels.find((c) => c.id === id);
  return Boolean(channel && state.memberships.some((m) => m.tenantId === channel.tenantId) &&
    (channel.visibility === "tenant" || state.channelMembers.some((m) => m.channelId === id)));
}
function admin(state, tenantId) { return state.memberships.some((m) => m.tenantId === tenantId && ["owner", "admin"].includes(m.role)); }
function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) throw new FileError(404, "not_found", "Not found");
  return value;
}
function tenantMapping(input) { const { spaceId, folderId, ...rest } = input; return { ...rest, consoleSpaceId: spaceId, consoleFolderId: folderId }; }
function tenantResult(row) { return row ? { ...row, spaceId: row.consoleSpaceId, folderId: row.consoleFolderId } : null; }
function encode(input) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), Buffer.isBuffer(value) ? `\\x${value.toString("hex")}` : value]));
}
function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => {
    const name = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const item = byteFields.has(name) && typeof raw === "string" && raw.startsWith("\\x") ? Buffer.from(raw.slice(2), "hex")
      : dateFields.has(name) && raw ? new Date(raw) : decode(raw);
    return [name, item];
  }));
}
