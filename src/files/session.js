import { createHash } from "node:crypto";
import { guardConsole } from "../console-auth.js";
import { loadSpaceView } from "../console-flow.js";

const VIEW_CACHE_MS = 60 * 1000;
const RESTORE_RETRY_MS = 60 * 1000;

/**
 * Files for the signed-in Console. One shared space per workspace: everyone in
 * the workspace sees its files, owners and admins can delete any of them.
 * Membership comes from the identity service on each request (cached a minute).
 */
export function workspaceChannelId(tenantId) {
  const hex = createHash("sha256").update(`sederunt-workspace-files:${tenantId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   identity?: object | null,
 *   store: any,
 *   storage?: any,
 *   spaceView?: (identity: any, session: any) => Promise<any>,
 *   guard?: (req: any, env: any) => any,
 *   clock?: () => number,
 * }} options
 */
export function createSessionFiles(options) {
  const { env, identity = null, store, storage = null } = options;
  const spaceView = options.spaceView || loadSpaceView;
  const guard = options.guard || guardConsole;
  const clock = options.clock || Date.now;
  const views = new Map();
  let restored = null;
  let restoredAt = 0;

  async function view(session) {
    const key = `${session.userId || session.memberId}:${session.tenantId || ""}:${session.accessExp || 0}`;
    const hit = views.get(key);
    if (hit && clock() - hit.at < VIEW_CACHE_MS) return hit.value;
    const value = await spaceView(identity, session);
    if (value && !value.error) views.set(key, { at: clock(), value });
    if (views.size > 500) views.clear();
    return value;
  }

  /** Rebuild the list from Console once per process. A failure retries after a minute. */
  function restore() {
    if (typeof storage?.listShared !== "function") return Promise.resolve(0);
    if (restored && (restoredAt === Infinity || clock() - restoredAt < RESTORE_RETRY_MS)) return restored;
    restoredAt = clock();
    restored = storage.listShared()
      .then((rows) => {
        restoredAt = Infinity;
        for (const row of rows) store.importActive(row);
        return rows.length;
      })
      .catch(() => 0);
    return restored;
  }

  function ensure({ userId, name, tenantId, workspaceName, role }) {
    const channelId = workspaceChannelId(tenantId);
    const label = workspaceName || "Workspace";
    const existing = store.channel(channelId);
    if (!existing) store.addChannel({ id: channelId, tenantId, name: label, visibility: "tenant" });
    else if (existing.name !== label) existing.name = label;
    const member = store.addMember({
      userId,
      name: name || "You",
      tenantId,
      role: role === "owner" || role === "admin" ? role : "member",
      channelIds: [channelId],
    });
    // A person is in one workspace at a time here, so other workspaces stay hidden.
    member.memberships = member.memberships.filter((item) => item.tenantId === tenantId);
    return channelId;
  }

  return {
    restore,
    /** @returns {Promise<{ userId: string, name: string, tenantId: string, channels: Array<{ id: string, name: string }> } | null>} */
    async viewer(req) {
      const gate = guard(req, env);
      let userId = "";
      let name = "";
      let tenantId = "";
      let workspaceName = "";
      let role = "";
      if (!gate.required) {
        userId = "local-owner";
        name = String(env.SEDERUNT_MEMBER || "You");
        tenantId = "local";
        workspaceName = "Workspace";
        role = "owner";
      } else {
        const session = gate.session;
        if (!session) return null;
        userId = String(session.userId || session.memberId || "");
        name = String(session.name || session.email || "");
        if (session.kind === "oauth" && identity) {
          const space = await view(session);
          tenantId = space?.activeId || "";
          workspaceName = space?.activeName || "";
          role = space?.activeRole || "";
        } else {
          tenantId = String(session.tenantId || "local");
          workspaceName = "Workspace";
          role = "owner";
        }
      }
      if (!userId || !tenantId) return null;
      await restore();
      const channelId = ensure({ userId, name, tenantId, workspaceName, role });
      return { userId, name: name || "You", tenantId, channels: [{ id: channelId, name: workspaceName || "Workspace" }] };
    },
  };
}
