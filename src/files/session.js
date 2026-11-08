import { createHash } from "node:crypto";
import { guardConsole } from "../console-auth.js";
import { loadSpaceView } from "../console-flow.js";

const RESTORE_RETRY_MS = 60 * 1000;

/**
 * Files for the signed-in Console. One shared space per workspace: everyone in
 * the workspace sees its files, owners and admins can delete any of them.
 * Membership comes from the identity service on each request so a reset revokes access.
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
  let restored = null;
  let restoredAt = 0;

  async function view(session) {
    return spaceView(identity, session);
  }

  /** Reconcile Console imports at a bounded interval. Database rows remain authoritative. */
  function restore() {
    if (typeof storage?.listShared !== "function") return Promise.resolve(0);
    if (restored && clock() - restoredAt < RESTORE_RETRY_MS) return restored;
    restoredAt = clock();
    restored = storage.listShared()
      .then(async (rows) => {
        for (const row of rows) await store.importActive(row);
        return rows.length;
      })
      .catch((error) => { restored = null; throw error; });
    return restored;
  }

  async function ensure({ userId, name, tenantId, workspaceName, role }) {
    const channelId = workspaceChannelId(tenantId);
    const label = workspaceName || "Workspace";
    const existing = await store.channel(channelId);
    if (!existing) await store.addChannel({ id: channelId, tenantId, name: label, visibility: "tenant" });
    else if (existing.name !== label) existing.name = label;
    const member = await store.addMember({
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
    invalidate(userId) { store.removeMember?.(userId); },
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
      if (!store.durable) await restore();
      const channelId = await ensure({ userId, name, tenantId, workspaceName, role });
      return { userId, name: name || "You", tenantId, channels: [{ id: channelId, name: workspaceName || "Workspace" }] };
    },
  };
}
