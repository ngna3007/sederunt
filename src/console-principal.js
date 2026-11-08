import { guardConsole } from "./console-auth.js";
import { slackConnection, installationFetch } from "./slack/tenant-slack.js";
import { lookupByEmail } from "./slack/match.js";

export async function consolePrincipal(workspace, req, tenantId, scope = "company") {
  const gate = guardConsole(req, workspace.env);
  const session = gate.session;
  const requested = !gate.required ? new URL(req.url || "/", "http://localhost").searchParams.get("member") : "";
  const memberId = String(session?.userId || session?.memberId || (!gate.required ? requested || workspace.env.SEDERUNT_MEMBER : "") || "").trim();
  if (session?.kind !== "oauth" || scope === "personal") return memberId;
  const principal = { memberId, identities: [] };
  if (!tenantId || !memberId) return principal;
  if (workspace.participantBindings) {
    const bindings = await workspace.participantBindings.forUser(tenantId, memberId, session.email).catch(() => []);
    principal.identities.push(...bindings.map((binding) => ({ memberId: binding.memberId, roomId: binding.roomId })));
  }
  const email = String(session.email || "").trim().toLowerCase();
  if (!email || session.provider !== "google") return principal;
  const connection = await slackConnection(workspace, tenantId).catch(() => ({ linked: false }));
  if (!connection.linked || !connection.token) return principal;
  workspace.principalCache ??= new Map();
  const key = JSON.stringify([tenantId, memberId, email, connection.teamId, connection.generation]);
  const cached = workspace.principalCache.get(key);
  let slackUserId = cached?.until > Date.now() ? cached.memberId : "";
  if (!slackUserId) {
    const baseFetch = workspace.deps?.slack?.fetch || workspace.fetchImpl || globalThis.fetch;
    const looked = await lookupByEmail({ email, token: connection.token,
      fetchImpl: (url, init) => installationFetch(workspace, tenantId, connection, baseFetch)(url, { ...init, signal: AbortSignal.timeout(3000) }), retries: 0 }).catch(() => ({ ok: false }));
    if (looked.ok && looked.slackUserId) {
      slackUserId = looked.slackUserId;
      if (workspace.principalCache.size >= 1000) workspace.principalCache.clear();
      workspace.principalCache.set(key, { memberId: slackUserId, until: Date.now() + 60000 });
    }
  }
  if (slackUserId) principal.identities.push({ memberId: slackUserId, roomId: null, provider: "slack" });
  return principal;
}
