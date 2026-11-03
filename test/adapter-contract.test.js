import assert from "node:assert/strict";
import test from "node:test";
import { methodsReferenced } from "../src/activity-replay.js";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { createLinearClient } from "../src/linear/mcp.js";
import { defaultDeps } from "../src/server.js";

test("production adapters export every method the replay table references", () => {
  const needed = methodsReferenced();
  const linear = createLinearClient("token", async () => {
    throw new Error("contract test does not call the network");
  });
  const stub = defaultDeps({ env: {}, memory: {} }).linear;
  const calendar = createCalendarAdapter({ CALENDAR_MCP_TOKEN: "token" }, {
    fetch: async () => { throw new Error("contract test does not call the network"); },
  });
  for (const name of needed.linear) {
    assert.equal(typeof linear[name], "function", `linear client ${name}`);
    assert.equal(typeof stub[name], "function", `linear stub ${name}`);
  }
  for (const name of needed.calendar) {
    assert.equal(typeof calendar[name], "function", `calendar ${name}`);
  }
});
