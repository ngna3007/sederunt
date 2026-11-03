import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp, defaultDeps } from "../src/server.js";

globalThis.fetch = async () => {
  throw new Error("server gate tests must not call the network");
};

function room(overrides = {}) {
  return {
    id: "room-1",
    kind: "meeting",
    source: "recall",
    botPresent: true,
    memberIds: ["rowan", "alex"],
    ...overrides,
  };
}

function countingLinear(createResult = { identifier: "ROW-44", id: "ROW-44" }) {
  const calls = [];
  return {
    calls,
    async readOpenTripTickets() {
      calls.push("read");
      return {
        team: "ROW",
        trip: [{ identifier: "ROW-8", title: "Typed Linear read", status: "Backlog" }],
        open: [],
      };
    },
    async createIssue() {
      calls.push("create");
      if (createResult instanceof Error) throw createResult;
      return createResult;
    },
  };
}

async function listen(deps, env = {}) {
  const server = createApp({ deps, env });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    port: address.port,
    deps,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function post(port, path, body, headers = { "content-type": "application/json" }) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            raw,
            body: raw.startsWith("{") ? JSON.parse(raw) : raw,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

test("the HTTP door passes the delivery, and an allow reaches the connector once", async () => {
  const linear = countingLinear();
  const app = await listen(defaultDeps({ linear, memory: null }));
  try {
    const blocked = await post(app.port, "/api/typed", {
      text: "File the venue ticket hall-http",
      deliveryId: "http-blocked",
    });
    assert.equal(blocked.status, 200);
    assert.deepEqual(linear.calls, []);
    assert.match(blocked.body.body, /missing-member/);
    assert.equal(blocked.body.link, null);

    const preference = await post(app.port, "/api/typed", {
      text: "set linear to do",
      memberId: "rowan",
      room: room(),
      deliveryId: "http-pref",
    });
    assert.match(preference.body.body, /preference do/);
    assert.deepEqual(linear.calls, []);

    const filed = await post(app.port, "/api/typed", {
      text: "File the venue ticket hall-http",
      memberId: "rowan",
      room: room(),
      door: "channel",
      participants: ["rowan", "alex"],
      deliveryId: "http-file",
    });
    assert.equal(filed.body.status, "filed");
    assert.equal(filed.body.issueId, "ROW-44");
    assert.equal(filed.body.link, "ROW-44");
    assert.match(filed.body.body, /hall-http/);
    assert.deepEqual(linear.calls, ["create"]);

    const repeat = await post(app.port, "/api/typed", {
      text: "File the venue ticket hall-http",
      memberId: "rowan",
      room: room(),
      deliveryId: "http-file",
    });
    assert.match(repeat.body.body, /duplicate-delivery/);
    assert.deepEqual(linear.calls, ["create"]);
  } finally {
    await app.close();
  }
});

test("a form delivery carries the member id into the same gate", async () => {
  const linear = countingLinear();
  const app = await listen(defaultDeps({ linear, memory: null }));
  try {
    await post(app.port, "/api/typed", "text=set+linear+to+do&memberId=rowan", {
      "content-type": "application/x-www-form-urlencoded",
    });
    const filed = await post(
      app.port,
      "/api/typed",
      `text=${encodeURIComponent("File the venue ticket hall-form")}&memberId=rowan&deliveryId=form-1&room=${encodeURIComponent(JSON.stringify(room()))}`,
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(filed.body.status, "filed");
    assert.deepEqual(linear.calls, ["create"]);
  } finally {
    await app.close();
  }
});

test("the process calendar, tatum, console, and meeting adapters answer without the network", async () => {
  const deps = defaultDeps({ memory: null });
  const memory = {
    async remember() {
      return { blobId: "blob-9", accountId: "0xcc67abcdef1234567890" };
    },
  };
  const app = await listen({ ...deps, memory }, { SEDERUNT_MEMBER: "rowan" });
  try {
    const day = await post(app.port, "/api/typed", { text: "what is on Thursday" });
    assert.equal(day.status, 200);
    assert.match(day.body.body, /Thursday/);
    assert.equal(day.body.link, null);

    const joined = await post(app.port, "/api/typed", {
      text: "What tickets are open for the trip?",
      join: { url: "https://example.test/meet" },
    });
    assert.equal(joined.status, 200);
    assert.match(joined.body.body, /created nothing/);
    assert.deepEqual(deps.meeting.calls, ["join"]);
    assert.deepEqual(deps.linear.calls, ["read"]);

    const stored = await post(app.port, "/api/typed", {
      text: "The brief is brief.pdf",
      memberId: "rowan",
      room: room(),
      deliveryId: "file-http",
      file: { name: "brief.pdf", bytes: "PDFBYTES" },
    });
    assert.match(stored.body.body, /brief\.pdf/);
    assert.doesNotMatch(stored.raw, /PDFBYTES/);
    assert.doesNotMatch(stored.body.body, /PDFBYTES/);
    assert.deepEqual(deps.console.calls, ["brief.pdf"]);

    const recalled = await post(app.port, "/api/mcp", {
      name: "recall",
      arguments: { memberId: "rowan", room: room(), text: "what was decided" },
    });
    assert.equal(recalled.body.status, "unknown");
    assert.deepEqual(deps.tatum.calls, ["blob-9"]);
    assert.doesNotMatch(recalled.body.body, /brief\.pdf/);
    assert.doesNotMatch(recalled.raw, /0xcc67/);
  } finally {
    await app.close();
  }
});

test("POST /mcp speaks MCP so any agent can recall", async () => {
  const app = await listen(defaultDeps({ memory: null }), { SEDERUNT_MEMBER: "rowan" });
  try {
    const init = await post(app.port, "/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "grok", version: "0" } },
    });
    assert.equal(init.status, 200);
    assert.equal(init.body.result.serverInfo.name, "sederunt");
    const list = await post(app.port, "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(list.body.result.tools.map((tool) => tool.name).sort(), ["act", "recall"]);
    const noted = await post(app.port, "/mcp", { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(noted.status, 202);
    await post(app.port, "/api/typed", {
      door: "meeting",
      text: "Hey @Maple the offsite is in Lisbon",
      memberId: "rowan",
      room: room({ memberIds: ["sam"] }),
      participants: ["rowan", "alex"],
      deliveryId: "agent-meet",
    });
    const recall = await post(app.port, "/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "recall",
        arguments: { memberId: "rowan", room: room(), text: "what was decided" },
      },
    });
    assert.match(recall.body.result.content[0].text, /Lisbon/);
    const get = await post(app.port, "/mcp", { jsonrpc: "2.0", id: 4, method: "ping" });
    assert.deepEqual(get.body.result, {});
  } finally {
    await app.close();
  }
});

test("MCP act under ask does not call, and a meeting participant set is the invite", async () => {
  const linear = countingLinear();
  const app = await listen(defaultDeps({ linear, memory: null }), { SEDERUNT_MEMBER: "rowan" });
  try {
    const acted = await post(app.port, "/api/mcp", {
      name: "act",
      arguments: {
        text: "File the venue ticket hall-mcp",
        memberId: "rowan",
        room: room(),
        deliveryId: "mcp-http",
      },
    });
    assert.equal(acted.body.preference, "ask");
    assert.equal(acted.body.link, null);
    assert.deepEqual(linear.calls, []);
    assert.doesNotMatch(acted.body.body, /filed/);

    const heard = await post(app.port, "/api/typed", {
      door: "meeting",
      text: "Hey @Maple the offsite is in Lisbon",
      memberId: "rowan",
      room: room({ memberIds: ["sam"] }),
      participants: ["rowan", "alex"],
      deliveryId: "meet-http",
    });
    assert.equal(heard.body.entered, true);
    assert.match(heard.body.body, /Lisbon/);

    const sam = await post(app.port, "/api/mcp", {
      name: "recall",
      arguments: { memberId: "sam", room: room(), text: "what was decided" },
    });
    assert.doesNotMatch(sam.body.body, /Lisbon/);
    const rowan = await post(app.port, "/api/mcp", {
      name: "recall",
      arguments: { memberId: "rowan", room: room(), text: "what was decided" },
    });
    assert.match(rowan.body.body, /Lisbon/);
    assert.deepEqual(linear.calls, []);
  } finally {
    await app.close();
  }
});
