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
    tools.push([body.params.name, body.params.arguments]);
    if (body.params.name === "get_issue") {
      return rpc({ result: { content: [{ type: "text", text: JSON.stringify({ id: "ROW-1", labels: [{ name: "design" }, { name: "bug" }] }) }] } });
    }
    return rpc({ result: { content: [{ type: "text", text: JSON.stringify({ identifier: "ROW-1" }) }] } });
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
  assert.equal(tools[6][1].idempotencyKey, "req-1");
  assert.equal(tools[6][1].title, "Banner");
});

function rpc(body) {
  return {
    ok: true,
    status: 200,
    headers: { get() { return ""; } },
    text: async () => (body ? JSON.stringify(body) : ""),
  };
}
