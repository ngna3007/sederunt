import assert from "node:assert/strict";
import test from "node:test";
import { deferredMemory } from "../src/meeting/agent-http.js";
import { isAlreadyStored, withRateLimitRetry } from "../src/memory/retry.js";

const STORED = "Walrus Memory server error (409): idempotency key was already stored";

test("a deferred activity write treats an already-stored Walrus 409 as saved", async () => {
  const writes = [];
  const queued = [];
  const logs = [];
  const raw = {
    async remember(input) {
      writes.push(JSON.parse(JSON.stringify(input)));
      const error = new Error(STORED);
      error.status = 409;
      throw error;
    },
  };
  const memory = withRateLimitRetry(raw, {
    tenantId: "cleanup2-test",
    redis: async (command) => {
      queued.push(command);
      return { ok: true, result: { result: 1 } };
    },
    log() {},
    waits: [],
    budgetMs: 0,
  });
  const later = deferredMemory({ workspace: {}, env: {} }, {
    memory,
    log: (row) => logs.push(row),
  });
  const document = {
    kind: "activity",
    text: "Filed the booth ticket",
    idempotencyKey: "activity-already",
    activity: { id: "activity-already", verb: "create" },
  };
  const returned = await later.deps.memory.remember(document);
  assert.equal(returned.deferred, true);
  assert.equal(returned.ok === false, false);
  await Promise.all(later.pending);
  assert.equal(writes.length, 1, "the same content is not written again");
  assert.equal(logs.some((row) => row.kind === "memory-remember-error"), false);
  assert.equal(logs.some((row) => row.kind === "memory-deferred" && row.alreadyStored === true), true);
  assert.equal(queued.some((command) => command[0] === "LPUSH"), false);
});

test("a different activity payload is not rewritten after an already-stored 409", async () => {
  const writes = [];
  const memory = {
    async remember(input) {
      writes.push(input.idempotencyKey);
      const error = new Error("Walrus Memory server error (409): {\"error\":\"idempotency_key was already used for a request with different content\"}");
      error.status = 409;
      throw error;
    },
  };
  const logs = [];
  const later = deferredMemory({ workspace: {}, env: {} }, { memory, log: (row) => logs.push(row) });
  await later.deps.memory.remember({
    kind: "activity",
    text: "other",
    idempotencyKey: "activity-other",
    activity: { id: "activity-other", verb: "assign" },
  });
  await Promise.all(later.pending);
  assert.deepEqual(writes, ["activity-other"]);
  assert.equal(logs.some((row) => row.kind === "memory-remember-error"), false);
});

test("an unrelated 409 is not treated as an already-stored memory", async () => {
  assert.equal(isAlreadyStored(Object.assign(new Error("Sign-in is not set up."), { status: 409 })), false);
  assert.equal(isAlreadyStored(new Error("Slack install conflict")), false);
  assert.equal(isAlreadyStored(Object.assign(new Error(STORED), { status: 409 })), true);
  const logs = [];
  const memory = {
    async remember() {
      const error = new Error("Sign-in is not set up.");
      error.status = 409;
      throw error;
    },
  };
  const later = deferredMemory({ workspace: {}, env: {} }, { memory, log: (row) => logs.push(row) });
  await later.deps.memory.remember({ kind: "activity", text: "nope", idempotencyKey: "activity-sign-in" });
  await Promise.all(later.pending);
  assert.equal(logs.some((row) => row.kind === "memory-remember-error"), true);
  assert.equal(logs.some((row) => row.alreadyStored === true), false);
});
