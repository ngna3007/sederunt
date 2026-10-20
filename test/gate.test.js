import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../src/session.js";
import { handleUtterance } from "../src/typed-path.js";

globalThis.fetch = async () => {
  throw new Error("gate tests must not call the network");
};

function countingLinear(createResult = { identifier: "ROW-44", id: "ROW-44" }) {
  const calls = [];
  return {
    calls,
    async readOpenTripTickets() {
      calls.push("read");
      return {
        team: "ROW",
        trip: [{ identifier: "ROW-8", title: "Typed Linear read", status: "Backlog" }],
        open: [{ identifier: "ROW-10", title: "Status, allow, and clash as pure functions", status: "Backlog" }],
      };
    },
    async createIssue() {
      calls.push("create");
      if (createResult instanceof Error) throw createResult;
      return createResult;
    },
  };
}

test("a Linear read needs no allow and does not create", async () => {
  const linear = countingLinear();
  const session = createSession();
  const result = await handleUtterance(
    { text: "What tickets are open for the trip?", session },
    { linear },
  );
  assert.deepEqual(linear.calls, ["read"]);
  assert.match(result.body, /ROW-8/);
  assert.match(result.body, /team ROW/);
  assert.match(result.body, /created nothing/);
  assert.equal(result.issueId, null);
  assert.equal(session.items.at(-1).kind, "answer");
  assert.match(session.items.at(-1).text, /ROW-8/);
});

test("a missing allow returns before the connector is called", async () => {
  const linear = countingLinear();
  let memoryCalls = 0;
  const session = createSession();
  const result = await handleUtterance(
    { text: "File the venue ticket seaside-hall", session },
    {
      linear,
      memory: {
        async remember() {
          memoryCalls += 1;
        },
      },
    },
  );
  assert.deepEqual(linear.calls, []);
  assert.equal(memoryCalls, 0);
  assert.equal(result.status, "recorded");
  assert.equal(result.issueId, null);
  assert.match(result.body, /seaside-hall/);
  assert.match(result.body, /recorded/);
  assert.doesNotMatch(result.body, /filed/);
  assert.doesNotMatch(result.body, /ROW-/);
});

test("a spoken yes files one write, and the next write without a new allow does not", async () => {
  const linear = countingLinear();
  const session = createSession();
  const proposed = await handleUtterance(
    { text: "File the venue ticket hall-one", session },
    { linear },
  );
  assert.equal(proposed.status, "recorded");
  assert.deepEqual(linear.calls, []);

  const filed = await handleUtterance({ text: "yes", session }, { linear });
  assert.equal(filed.status, "filed");
  assert.equal(filed.issueId, "ROW-44");
  assert.match(filed.body, /filed/);
  assert.match(filed.body, /ROW-44/);
  assert.deepEqual(linear.calls, ["create"]);

  const second = await handleUtterance(
    { text: "File the venue ticket hall-two", session },
    { linear },
  );
  assert.equal(second.status, "recorded");
  assert.equal(second.issueId, null);
  assert.deepEqual(linear.calls, ["create"]);
});

test("a refused Linear create stays recorded and says the edit did not happen", async () => {
  const linear = countingLinear(new Error("Linear refused"));
  const session = createSession();
  await handleUtterance({ text: "File the venue ticket hall-three", session }, { linear });
  const result = await handleUtterance({ text: "yes", session }, { linear });
  assert.equal(result.status, "recorded");
  assert.equal(result.issueId, null);
  assert.match(result.body, /The edit did not happen/);
  assert.doesNotMatch(result.body, /filed/);
});

test("an empty connector id stays recorded", async () => {
  const linear = countingLinear({ identifier: "", id: "" });
  const session = createSession();
  await handleUtterance({ text: "File the venue ticket hall-four", session }, { linear });
  const result = await handleUtterance({ text: "yes", session }, { linear });
  assert.equal(result.status, "recorded");
  assert.match(result.body, /The edit did not happen/);
  assert.equal(linear.calls.length, 1);
});
