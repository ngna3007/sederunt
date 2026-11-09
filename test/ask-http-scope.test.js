import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/server.js";
import { createAskStore } from "../src/ask/store.js";
import { sealSession } from "../src/console-auth.js";

const secret = "ask-http-scope-fixture";
const cookie = `sederunt_session=${sealSession({ kind: "oauth", provider: "google", memberId: "reader", userId: "reader", accessToken: "fixture", accessExp: Date.now() + 60000, exp: Date.now() + 60000 }, secret)}`;

test("Ask authorizes before quota and hides history and streams outside their workspace", async (t) => {
  const store = createAskStore({});
  const a = await store.create("reader", "Company A launch", { tenantId: "tenant-a", workspace: "company" });
  await store.append(a, "Monday secret");
  await store.finish(a, { status: "done", source: "memory" });
  const b = await store.create("reader", "Company B launch", { tenantId: "tenant-b", workspace: "company" });
  await store.append(b, "Friday secret");
  await store.finish(b, { status: "done", source: "memory" });
  const app = createApp({ env: { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: secret }, askStore: store, files: false,
    identity: { async myTenants() { return [{ id: "tenant-a", kind: "company" }, { id: "tenant-b", kind: "company" }]; } },
    companyLoaded: true, deps: { memory: null } });
  app.listen(0, "127.0.0.1"); await once(app, "listening"); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;
  const denied = await fetch(`${base}/api/ask`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ company: "forbidden", workspace: "company", text: "What changed?" }) });
  assert.equal(denied.status, 403);
  assert.equal((await store.quota("reader", 5)).used, 0);
  assert.equal((await store.list("reader")).length, 2);
  for (const [company, expected, absent] of [["tenant-a", "Monday secret", "Friday secret"], ["tenant-b", "Friday secret", "Monday secret"]]) {
    const response = await fetch(`${base}/api/ask?workspace=company&company=${company}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const body = await response.text(); assert.ok(body.includes(expected)); assert.ok(!body.includes(absent));
  }
  const wrong = await fetch(`${base}/api/ask/${a}/stream?workspace=company&company=tenant-b`, { headers: { cookie } });
  assert.equal(wrong.status, 404);
  const personal = await fetch(`${base}/api/ask?workspace=personal`, { headers: { cookie } });
  assert.deepEqual((await personal.json()).asks, []);
  const invalid = await fetch(`${base}/api/ask?workspace=other&company=tenant-a`, { headers: { cookie } });
  assert.equal(invalid.status, 400);
});
