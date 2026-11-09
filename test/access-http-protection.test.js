import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createSession } from "../src/session.js";
import { sealSession } from "../src/console-auth.js";

const secret = "access-http-test-secret";
const cookie = (memberId) => `sederunt_session=${sealSession({ memberId }, secret)}`;
async function listen(t, app) {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => app.close());
  return `http://127.0.0.1:${app.address().port}`;
}

test("file, proof object and typed endpoints bind access to the signed-in person", async (t) => {
  const session = createSession();
  session.decisions.push({ id: "d1", roomId: "meeting", account: "company", kind: "decision", text: "Private decision", inviteMemberIds: ["alice"], objectId: "object-a", fileNames: [{ name: "private.txt", consoleFileId: "file-a" }] });
  let reads = 0;
  const app = createApp({ env: { SEDERUNT_CONSOLE_SECRET: secret }, session, companyLoaded: true, files: false,
    deps: { memory: null, console: { async download() { reads++; return "private bytes"; } }, tatum: { async getObject() { reads++; return { text: "private proof" }; } } } });
  const base = await listen(t, app);
  const post = (path, body, who) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(who ? { cookie: cookie(who) } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post("/api/download", { name: "private.txt", memberId: "alice" })).status, 401);
  assert.equal((await fetch(`${base}/object/object-a`)).status, 401);
  assert.equal((await post("/api/typed", { text: "private note: secret" })).status, 401);
  assert.equal((await post("/api/typed", { memberId: "alice", text: "private note: secret" }, "bob")).status, 403);
  const denied = await post("/api/download", { name: "private.txt", memberId: "alice" }, "bob");
  assert.equal((await denied.json()).bytes, null);
  assert.equal((await fetch(`${base}/object/object-a`, { headers: { cookie: cookie("bob") } })).status, 404);
  assert.equal(reads, 0);
  const allowed = await post("/api/download", { name: "private.txt", memberId: "bob" }, "alice");
  assert.equal((await allowed.json()).bytes, "private bytes");
  const object = await fetch(`${base}/object/object-a`, { headers: { cookie: cookie("alice") } });
  assert.equal(await object.text(), "private proof");
  session.decisions[0].deleted = true;
  assert.equal((await fetch(`${base}/object/object-a`, { headers: { cookie: cookie("alice") } })).status, 404);
  assert.equal((await (await post("/api/download", { name: "private.txt" }, "alice")).json()).bytes, null);
});

test("Ask history and streams become unavailable after a deletion or deletion-store outage", async (t) => {
  const session = createSession();
  let state = [];
  let down = false;
  const deletions = { async list() { if (down) throw new Error("unavailable"); return state; } };
  const app = createApp({ env: { SEDERUNT_CONSOLE_SECRET: secret }, session, deletions, companyLoaded: true, files: false, deps: { memory: null } });
  const base = await listen(t, app);
  const headers = { cookie: cookie("alice"), "content-type": "application/json" };
  const created = await fetch(`${base}/api/ask`, { method: "POST", headers, body: JSON.stringify({ text: "What happened?", workspace: "company" }) });
  assert.equal(created.status, 200);
  const { id } = await created.json();
  let history = await fetch(`${base}/api/ask?workspace=company`, { headers });
  assert.match(await history.text(), /What happened/);
  state = [{ id: "deleted-intent" }];
  history = await fetch(`${base}/api/ask?workspace=company`, { headers });
  assert.doesNotMatch(await history.text(), /What happened/);
  assert.equal((await fetch(`${base}/api/ask/${id}/stream?workspace=company`, { headers })).status, 404);
  down = true;
  const unavailable = await fetch(`${base}/api/ask?workspace=company`, { headers });
  assert.ok(unavailable.status >= 500);
  assert.doesNotMatch(await unavailable.text(), /What happened/);
});
