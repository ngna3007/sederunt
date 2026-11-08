import { randomUUID } from "node:crypto";
import { adminConfigured, adminCookie, adminSameOrigin, adminSession, newAdminSession, openAdminToken, sealAdminToken, verifyAdminPassword } from "./admin-auth.js";
import { createAdminStore } from "./admin-store.js";
import { renderAdminPage, renderAdminSignIn } from "./admin-page.js";
import { askLimit, settledStatus } from "./ask/store.js";
import { handleUtterance } from "./typed-path.js";

async function readAdminPosted(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) { const error = new Error("The admin request is too large."); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let value;
  try { value = String(req.headers["content-type"] || "").includes("application/json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw)); }
  catch { const error = new Error("Invalid admin request."); error.status = 400; throw error; }
  if (!value || Array.isArray(value) || typeof value !== "object") { const error = new Error("Invalid admin request."); error.status = 400; throw error; }
  return value;
}

export function createAdminRoutes({ env, ask, store = createAdminStore(env), invalidate = async () => {} }) {
  const attempts = [];
  async function busy(userId) {
    const views = await ask.reads(await ask.list(userId));
    return views.some(({ meta }) => settledStatus(meta) === "streaming");
  }
  return async function handleAdmin(req, res, url, { send, redirect }) {
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return false;
    const json = (status, body) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body), { "cache-control": "no-store", "x-frame-options": "DENY" });
    const html = (status, body) => send(res, status, "text/html; charset=utf-8", body, { "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "same-origin" });
    try {
      if (!adminConfigured(env)) { html(503, renderAdminSignIn({ error: "Admin access is not configured on this server.", configured: false })); return true; }
      if (req.method === "POST" && !adminSameOrigin(req)) { json(403, { error: "Open this action from the admin page." }); return true; }
      if (req.method === "GET" && url.pathname === "/admin/login") { html(200, renderAdminSignIn()); return true; }
      if (req.method === "POST" && url.pathname === "/admin/login") {
        const body = await readAdminPosted(req);
        while (attempts.length && attempts[0] < Date.now() - 600000) attempts.shift();
        if (attempts.length >= 10) { html(429, renderAdminSignIn({ error: "Too many attempts. Try again in 10 minutes." })); return true; }
        attempts.push(Date.now());
        if (!store || !(await store.loginAttempt())) { html(429, renderAdminSignIn({ error: "Sign-in is temporarily unavailable. Check admin setup or try again in 10 minutes." })); return true; }
        if (!(await verifyAdminPassword(body.username, body.password, env))) { html(401, renderAdminSignIn({ error: "Username or password is incorrect." })); return true; }
        const session = newAdminSession(env);
        redirect(res, "/admin", { "set-cookie": adminCookie(sealAdminToken(session, env), req) });
        return true;
      }
      const session = adminSession(req, env);
      if (!session) {
        if (url.pathname.startsWith("/admin/api/")) json(401, { error: "Sign in to admin again." });
        else redirect(res, "/admin/login");
        return true;
      }
      if (req.method === "GET" && url.pathname === "/admin") { html(200, renderAdminPage({ csrf: session.csrf, username: session.username })); return true; }
      if (req.method === "POST") {
        const body = await readAdminPosted(req);
        if (body.csrf !== session.csrf) { json(403, { error: "Refresh the admin page and try again." }); return true; }
        if (url.pathname === "/admin/logout") {
          redirect(res, "/admin/login", { "set-cookie": adminCookie("", req, true) }); return true;
        }
        if (!store) { json(503, { error: "Admin database access is not configured." }); return true; }
        if (url.pathname === "/admin/api/preview") {
          if (!/^[a-f0-9-]{36}$/i.test(body.userId || "") || !["reset-quota", "restart-demo"].includes(body.action)) { json(400, { error: "Choose an account and action." }); return true; }
          const plan = await store.plan(body.userId);
          if (!plan) { json(404, { error: "Account not found." }); return true; }
          const blockers = plan.workspaces.filter((s) => s.role === "owner" && s.members > 1 && !s.otherOwners);
          if (body.action === "restart-demo" && blockers.length) { json(409, { error: `Transfer ownership of ${blockers.map((s) => s.name).join(", ")} before deleting this account’s data.` }); return true; }
          if (await busy(body.userId)) { json(409, { error: "An AI answer is still running. Wait for it to finish, then preview again." }); return true; }
          const nonce = randomUUID();
          const exp = Date.now() + 300000;
          await store.issuePreview(nonce);
          const token = sealAdminToken({ kind: "admin-preview", userId: body.userId, action: body.action, plan, csrf: session.csrf, nonce, exp }, env);
          json(200, { plan, action: body.action, token, confirmation: plan.email || plan.id }); return true;
        }
        if (url.pathname === "/admin/api/confirm") {
          const preview = openAdminToken(body.token, env);
          if (!preview || preview.kind !== "admin-preview" || preview.csrf !== session.csrf || body.confirmation !== (preview.plan.email || preview.userId)) {
            json(409, { error: "The confirmation expired or does not match. Preview the action again." }); return true;
          }
          if (await busy(preview.userId)) { json(409, { error: "An AI answer started. Wait for it to finish and preview again." }); return true; }
          const current = await store.plan(preview.userId);
          if (JSON.stringify(current) !== JSON.stringify(preview.plan)) { json(409, { error: "The account changed. Preview again." }); return true; }
          if (!(await store.consumePreview(preview.nonce))) { json(409, { error: "This action was already confirmed or expired. Preview again." }); return true; }
          const result = await handleUtterance({ door: "admin", action: preview.action, allow: true }, { admin: { async commit(action) {
            if (action === "reset-quota") {
              await ask.resetQuota(preview.userId);
              try { await store.audit(session.username, preview.userId, action); }
              catch { return { message: "Today's AI quota was reset, but its audit record could not be saved. Check the admin database before the next action.", partial: true }; }
              return { message: "Today's AI quota was reset. Questions and workspace data are kept." };
            }
            const reset = await store.restart(preview.userId, preview.plan, session.username);
            try {
              const retired = typeof store.retiredForUser === "function" ? await store.retiredForUser(preview.userId) : reset.deletedTenants;
              await invalidate(preview.userId, retired);
              await ask.resetQuota(preview.userId);
              await ask.resetHistory(preview.userId);
            } catch {
              return { message: "Workspace and onboarding data was deleted, but connection or AI cleanup failed. After Redis recovers, preview and confirm data deletion again to retry cleanup; the old workspace stays inaccessible.", partial: true };
            }
            return { message: "User app data deleted. The Google login is kept. Sign in with the same account to begin onboarding again. Contributions in shared workspaces, external recordings, stored blobs, Slack messages and published proofs remain." };
          } } });
          json(200, result.result); return true;
        }
      }
      if (req.method === "GET" && url.pathname === "/admin/api/accounts") {
        if (!store) { json(503, { error: "Admin database access is not configured." }); return true; }
        const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
        const rows = await store.accounts((url.searchParams.get("q") || "").slice(0, 120), offset);
        json(200, { accounts: rows.slice(0, 25), more: rows.length > 25 }); return true;
      }
      const match = /^\/admin\/api\/accounts\/([a-f0-9-]{36})$/i.exec(url.pathname);
      if (req.method === "GET" && match && store) {
        const plan = await store.plan(match[1]);
        if (!plan) { json(404, { error: "Account not found." }); return true; }
        json(200, { ...plan, quota: await ask.quota(match[1], askLimit(env)), backend: ask.kind }); return true;
      }
      json(404, { error: "Admin page not found." });
    } catch (error) {
      const status = [400, 409, 413].includes(error.status) ? error.status : 503;
      const message = status === 503 ? "Admin request failed. Refresh and try again; check server configuration if it continues." : error.message;
      if (url.pathname === "/admin/login") html(status, renderAdminSignIn({ error: message }));
      else json(status, { error: message });
    }
    return true;
  };
}
