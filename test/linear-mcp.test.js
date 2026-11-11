import assert from "node:assert/strict";
import test from "node:test";
import { createLinearClient } from "../src/linear/mcp.js";

test("the linear client updates state, labels, and assignee through save_issue", async () => {
  const tools = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "initialize" || body.method === "notifications/initialized") {
      return rpc(body.method === "notifications/initialized" ? null : { result: {} });
    }
    if (body.params.name === "get_team") return rpc({ result: { content: [{ type: "text", text: "Team lookup is unavailable" }], isError: true } });
    tools.push([body.params.name, body.params.arguments]);
    if (body.params.name === "get_issue") {
      return rpc({ result: { content: [{ type: "text", text: JSON.stringify({ id: "ROW-1", labels: [{ name: "design" }, { name: "bug" }] }) }] } });
    }
    const issueId = body.params.arguments.id === "ENG-12" ? "ENG-12" : "ROW-1";
    return rpc({ result: { content: [{ type: "text", text: JSON.stringify({ identifier: issueId }) }] } });
  };
  const linear = createLinearClient("token", fetchImpl);
  const updated = await linear.updateIssue({ id: "ROW-1", state: "Todo" });
  assert.equal(updated.id, "ROW-1");
  await linear.addLabel({ id: "ROW-1", label: "copy" });
  await linear.removeLabel({ id: "ROW-1", label: "bug" });
  await linear.unassignIssue({ id: "ROW-1" });
  await linear.createIssue({ title: "Banner", idempotencyKey: "req-1" });
  assert.deepEqual(tools[0], ["save_issue", { id: "ROW-1", state: "Todo" }]);
  assert.equal(tools[1][0], "get_issue");
  assert.deepEqual(tools[2][1].labels, ["design", "bug", "copy"]);
  assert.equal(tools[3][0], "get_issue");
  assert.deepEqual(tools[4][1].labels, ["design"]);
  assert.deepEqual(tools[5], ["save_issue", { id: "ROW-1", assignee: null }]);
  assert.equal(tools[6][0], "save_issue");
  // save_issue has no idempotency argument; the action claim keeps one call per filing.
  assert.equal("idempotencyKey" in tools[6][1], false);
  assert.equal(tools[6][1].title, "Banner");
  // A failed team lookup falls back to the configured key.
  assert.equal(tools[6][1].team, "ROW");
  const other = await linear.updateIssue({ id: "ENG-12", state: "Done" });
  assert.equal(other.id, "ENG-12");
});

function rpc(body) {
  return {
    ok: true,
    status: 200,
    headers: { get() { return ""; } },
    text: async () => (body ? JSON.stringify(body) : ""),
  };
}

test("save_issue gets the team ID from get_team, and an SSE reply is read by request id", async () => {
  const tools = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "notifications/initialized") return rpc(null);
    if (body.method === "initialize") return rpc({ jsonrpc: "2.0", id: body.id, result: {} });
    tools.push([body.params.name, body.params.arguments]);
    const answer = body.params.name === "get_team"
      ? { id: "0b6e2f7a-1111-4222-8333-444455556666", key: "ROW", name: "Rowan" }
      : { id: "9c1d0000-0000-4000-8000-000000000009", identifier: "ROW-21", url: "https://linear.app/rowan3007/issue/ROW-21/banner" };
    // The response is followed by a notification on the same stream.
    const sse = [
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(answer) }] } })}`,
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "done" } })}`,
    ].join("\n\n");
    return { ok: true, status: 200, headers: { get() { return ""; } }, text: async () => `${sse}\n\n` };
  };
  const linear = createLinearClient("token", fetchImpl);
  const first = await linear.createIssue({ title: "Banner copy" });
  const second = await linear.createIssue({ title: "Banner art" });
  assert.equal(first.id, "ROW-21");
  assert.equal(first.url, "https://linear.app/rowan3007/issue/ROW-21/banner");
  assert.equal(second.id, "ROW-21");
  assert.equal(tools.filter(([name]) => name === "get_team").length, 1, "the team is looked up once per client");
  assert.deepEqual(tools[0], ["get_team", { query: "ROW" }]);
  assert.equal(tools[1][1].team, "0b6e2f7a-1111-4222-8333-444455556666");
});

test("a bare issue key inside a failure message is not taken as the new issue", async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "notifications/initialized") return rpc(null);
    if (body.method === "initialize") return rpc({ result: {} });
    if (body.params.name === "get_team") return rpc({ result: { content: [{ type: "text", text: "{}" }] } });
    return rpc({ result: { content: [{ type: "text", text: "Could not save: a similar issue ROW-7 already exists" }] } });
  };
  const linear = createLinearClient("token", fetchImpl);
  await assert.rejects(() => linear.createIssue({ title: "Banner" }), (error) => error.reason === "no-id");
});
