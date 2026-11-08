import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp, consoleBoardMember } from "../src/server.js";
import { sealSession } from "../src/console-auth.js";
import { createSession } from "../src/session.js";
import { canReadRecord } from "../src/domain/read-access.js";
import { handleUtterance, roomLedger } from "../src/typed-path.js";
import { createParticipantBindings } from "../src/participant-bindings.js";

const decision = (extra = {}) => ({ id: "d1", roomId: "room-1", text: "Launch on Monday", account: "company", kind: "decision", inviteMemberIds: ["alice"], ...extra });

test("meeting aliases are scoped to a room and cannot open personal or deleted records", () => {
  const principal = { memberId: "google-user", identities: [{ memberId: "alice", roomId: "room-1" }] };
  assert.equal(canReadRecord(principal, decision()), true);
  assert.equal(canReadRecord(principal, decision({ roomId: "other-meeting" })), false);
  assert.equal(canReadRecord(principal, decision({ account: "personal" })), false);
  assert.equal(canReadRecord(principal, decision({ deleted: true })), false);
  assert.equal(canReadRecord("bob", decision()), false);
  assert.equal(canReadRecord("", decision()), false);
  assert.equal(canReadRecord("alice", decision()), true);
  assert.equal(consoleBoardMember({ kind: "oauth", memberId: "bob", userId: "bob" }, { SEDERUNT_MEMBER: "alice" }, "company"), "bob");
});

test("room HTTP cannot reveal decisions or waiting actions to a nonparticipant", async (t) => {
  const session = createSession();
  session.decisions = [decision(), decision({ id: "deleted", deleted: true, text: "Deleted secret" })];
  session.actions = [{ id: "a1", state: "waiting", roomId: "room-1", memberId: "alice", statement: "Secret task", inviteMemberIds: ["alice"] }];
  const env = { SEDERUNT_CONSOLE_SECRET: "fixture" };
  const app = createApp({ session, env, files: false, companyLoaded: true, deps: { memory: null } });
  app.listen(0, "127.0.0.1"); await once(app, "listening"); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const who of ["bob", "alice"]) {
    const cookie = `sederunt_session=${sealSession({ memberId: who }, "fixture")}`;
    const res = await fetch(`${base}/api/room?room=room-1&member=alice`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decisions.length, who === "alice" ? 1 : 0);
    assert.equal(body.waiting.length, who === "alice" ? 1 : 0);
    assert.equal(JSON.stringify(body).includes("Deleted secret"), false);
    const media = await fetch(`${base}/console/rooms/unknown/media`, { headers: { cookie } });
    assert.equal(media.status, 404);
  }
  assert.equal(roomLedger(session, "room-1").decisions.length, 0);
});

test("recall does not shape an allowed answer from another room's learned material", async () => {
  const session = createSession();
  session.decisions = [decision()];
  session.learned = [{ key: "private", kind: "correction", text: "The secret budget is 90000", roomId: "private-room" }];
  const result = await handleUtterance({ session, memberId: "alice", intent: "recall", text: "What is the secret budget?", room: { id: "room-1" } }, {});
  assert.doesNotMatch(result.body, /90000/);
  assert.doesNotMatch(JSON.stringify(result.why || []), /90000/);
});

test("verified participant bindings never match a different tenant or mailbox", async () => {
  const store = createParticipantBindings({ SEDERUNT_AUTH_FAKE: "1" });
  await store.record({ tenantId: "tenant-a", roomId: "room-1", memberId: "alice", email: "Alice@Example.com" });
  assert.equal((await store.forUser("tenant-a", "user", "alice@example.com")).length, 1);
  assert.deepEqual(await store.forUser("tenant-b", "user", "alice@example.com"), []);
  assert.deepEqual(await store.forUser("tenant-a", "user", "bob@example.com"), []);
});
