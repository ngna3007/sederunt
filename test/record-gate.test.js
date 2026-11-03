import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { connectorCalls, ledgerDirectory, ledgerMemory } from "../src/memory/ledger.js";
import { createSession } from "../src/session.js";
import { createApp, defaultDeps } from "../src/server.js";
import { downloadFile, handleUtterance } from "../src/typed-path.js";

const root = fileURLToPath(new URL("..", import.meta.url));

globalThis.fetch = async () => {
  throw new Error("record gate tests must not call the network");
};

function room(overrides = {}) {
  return {
    id: "room-1",
    kind: "meeting",
    source: "meet",
    botPresent: true,
    memberIds: ["rowan", "alex"],
    ...overrides,
  };
}

function listen(deps) {
  const server = createApp({ deps, env: { SEDERUNT_MEMBER: "rowan" } });
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => ({
    port: server.address().port,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  }));
}

function post(port, path, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, raw, body: JSON.parse(raw) });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function runProcess(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, env });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${script} timed out`));
    }, 8000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function recordEnv(accountId, delegateKey, memberId, roomId) {
  return {
    PATH: process.env.PATH ?? "",
    SEDERUNT_ACCOUNT: accountId,
    SEDERUNT_DELEGATE: delegateKey,
    SEDERUNT_MEMBER: memberId,
    SEDERUNT_ROOM: roomId,
    SEDERUNT_TEXT: "what was decided",
  };
}

function frame(message) {
  const json = JSON.stringify(message);
  return Buffer.concat([
    Buffer.from(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`),
    Buffer.from(json),
  ]);
}

function parseFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf("\r\n\r\n", offset);
    if (headerEnd < 0) break;
    const header = buffer.subarray(offset, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) break;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) break;
    messages.push(JSON.parse(buffer.subarray(start, start + length).toString("utf8")));
    offset = start + length;
  }
  return { messages, offset };
}

function stdioCall(env, calls) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/mcp-stdio.js"], { cwd: root, env });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("stdio mcp timed out"));
    }, 8000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    }));
    for (const call of calls) {
      child.stdin.write(frame({ jsonrpc: "2.0", id: call.id, method: "tools/call", params: call.params }));
    }
    child.stdin.end();
    child.on("close", () => {
      clearTimeout(timer);
      const parsed = parseFrames(Buffer.concat(stdout));
      resolve(parsed.messages);
    });
  });
}

test("a second process given the company delegate returns the sentence and an outsider receives none", async () => {
  const sentence = "The xylophone stays in the hall";
  const accountId = "company-ledger-alpha";
  const delegateKey = "delegate-ledger-alpha";
  const memory = ledgerMemory({ accountId, delegateKey });
  const session = createSession();
  try {
    const stored = await handleUtterance({
      text: sentence,
      session,
      memberId: "rowan",
      room: room(),
      deliveryId: "ledger-store",
    }, { memory });
    assert.match(stored.body, /xylophone/);
    assert.equal(stored.status, "current");

    const memberEnv = recordEnv(accountId, delegateKey, "rowan", "room-1");
    assert.equal(JSON.stringify(memberEnv).includes(sentence), false);
    const member = await runProcess("src/memory/read-record.js", memberEnv);
    assert.equal(member.code, 0);
    const heard = JSON.parse(member.stdout);
    assert.match(heard.body, /xylophone/);
    assert.equal(heard.status, stored.status);
    assert.doesNotMatch(member.stderr, /xylophone/);

    const outsider = await runProcess(
      "src/memory/read-record.js",
      recordEnv(accountId, delegateKey, "sam", "room-1"),
    );
    assert.equal(outsider.code, 0);
    assert.doesNotMatch(outsider.stdout, /xylophone/);
    assert.doesNotMatch(outsider.stderr, /xylophone/);
    assert.match(JSON.parse(outsider.stdout).body, /not-invited/);
    const outsiderEvents = outsider.stderr.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(outsiderEvents.some((event) => event.outcome === "recall"), false);
    assert.equal(outsiderEvents.some((event) => event.outcome === "not-invited"), true);

    const wrong = await runProcess(
      "src/memory/read-record.js",
      recordEnv(accountId, "other-delegate", "rowan", "room-1"),
    );
    assert.doesNotMatch(wrong.stdout, /xylophone/);
    assert.doesNotMatch(wrong.stderr, /xylophone/);
  } finally {
    await rm(ledgerDirectory(accountId), { recursive: true, force: true });
  }
});

test("recall names the console file and a separate download returns its bytes", async () => {
  const bytes = "FILEBYTES-notes-77";
  const storedBytes = new Map();
  let downloads = 0;
  let reads = 0;
  const consoleAdapter = {
    async upload(input) {
      assert.equal(input.name, "notes.pdf");
      assert.equal(input.bytes, bytes);
      storedBytes.set("file-notes", input.bytes);
      return { id: "file-notes", folderId: "private-folder" };
    },
    async download(input) {
      downloads += 1;
      assert.equal(input.id, "file-notes");
      return storedBytes.get(input.id);
    },
    async read() {
      reads += 1;
      return bytes;
    },
  };
  const session = createSession();
  const deps = { console: consoleAdapter, memory: { async remember() { return { blobId: null }; } } };
  const stored = await handleUtterance({
    text: "The notes are notes.pdf",
    session,
    memberId: "rowan",
    room: room(),
    file: { name: "notes.pdf", bytes },
    deliveryId: "notes-store",
  }, deps);
  assert.match(stored.body, /notes\.pdf/);
  assert.doesNotMatch(stored.body, /FILEBYTES/);
  assert.equal(reads, 0);
  assert.equal(downloads, 0);

  const recalled = await handleUtterance({
    text: "what was decided",
    session,
    memberId: "rowan",
    room: room(),
  }, deps);
  assert.match(recalled.body, /notes\.pdf/);
  assert.match(recalled.body, /The notes are notes\.pdf/);
  assert.doesNotMatch(recalled.body, /FILEBYTES/);
  assert.equal(reads, 0);
  assert.equal(downloads, 0);

  const file = await downloadFile({ session, memberId: "rowan", room: room(), name: "notes.pdf" }, deps);
  assert.equal(file.bytes, bytes);
  assert.equal(file.name, "notes.pdf");
  assert.equal(downloads, 1);
  assert.equal(reads, 0);

  const outsider = await downloadFile({ session, memberId: "sam", room: room(), name: "notes.pdf" }, deps);
  assert.equal(outsider.bytes, null);
  assert.equal(downloads, 1);

  const app = await listen(deps);
  try {
    const throughDoor = await post(app.port, "/api/typed", {
      text: "The notes are notes.pdf",
      memberId: "rowan",
      room: room(),
      file: { name: "notes.pdf", bytes },
      deliveryId: "notes-http",
    });
    assert.match(throughDoor.body.body, /notes\.pdf/);
    assert.doesNotMatch(throughDoor.raw, /FILEBYTES/);
    const recalledHttp = await post(app.port, "/api/typed", {
      text: "what was decided",
      memberId: "rowan",
      room: room(),
    });
    assert.match(recalledHttp.body.body, /notes\.pdf/);
    assert.doesNotMatch(recalledHttp.raw, /FILEBYTES/);
    const overHttp = await post(app.port, "/api/download", {
      memberId: "rowan",
      room: room(),
      name: "notes.pdf",
    });
    assert.equal(overHttp.status, 200);
    assert.equal(overHttp.body.bytes, bytes);
    assert.doesNotMatch(overHttp.raw, /The notes are/);
    const hidden = await post(app.port, "/api/download", {
      memberId: "sam",
      room: room(),
      name: "notes.pdf",
    });
    assert.equal(hidden.body.bytes, null);
    assert.doesNotMatch(hidden.raw, /FILEBYTES/);
    assert.doesNotMatch(hidden.raw, /The notes are/);
    assert.equal(reads, 0);
  } finally {
    await app.close();
  }
});

test("the local object link opens on the object text and a failed read stays unknown", async () => {
  const opens = [];
  const tatum = {
    async getObject(id) {
      opens.push(id);
      if (id === "blob-9" || id === "obj-88") {
        return { text: "The offsite is in Porto", checkpoint: 88, objectId: "obj-88" };
      }
      throw new Error("missing object");
    },
  };
  const memory = {
    async remember() {
      return { blobId: "blob-9" };
    },
  };
  const app = await listen({ memory, tatum });
  try {
    await post(app.port, "/api/typed", {
      text: "The offsite is in Lisbon",
      memberId: "rowan",
      room: room(),
      deliveryId: "object-store",
    });
    const recalled = await post(app.port, "/api/typed", {
      text: "what was decided",
      memberId: "rowan",
      room: room(),
    });
    assert.equal(recalled.body.status, "current");
    assert.match(recalled.body.body, /Porto/);
    assert.doesNotMatch(recalled.body.body, /Lisbon/);
    assert.equal(recalled.body.objectLink, "/object/obj-88");
    const opened = await get(app.port, recalled.body.objectLink);
    assert.equal(opened.status, 200);
    assert.match(opened.raw, /Porto/);
    assert.match(opened.raw, /checkpoint 88/);
    assert.ok(opens.includes("obj-88"));

    const failed = await listen({
      memory,
      tatum: {
        async getObject() {
          throw new Error("tatum down");
        },
      },
    });
    try {
      await post(failed.port, "/api/typed", {
        text: "The offsite is in Lisbon",
        memberId: "rowan",
        room: room(),
        deliveryId: "object-fail",
      });
      const unknown = await post(failed.port, "/api/typed", {
        text: "what was decided",
        memberId: "rowan",
        room: room(),
      });
      assert.equal(unknown.body.status, "unknown");
      assert.match(unknown.body.body, /unknown/);
      assert.doesNotMatch(unknown.body.body, /Lisbon/);
      assert.equal(unknown.body.objectLink, null);
    } finally {
      await failed.close();
    }
  } finally {
    await app.close();
  }
});

test("stdio recall matches the web screen and ask does not reach the connector", async () => {
  const sentence = "The kiln fires on Monday";
  const accountId = "company-ledger-stdio";
  const delegateKey = "delegate-ledger-stdio";
  const memory = ledgerMemory({ accountId, delegateKey });
  const linear = {
    calls: [],
    async readOpenTripTickets() {
      this.calls.push("read");
      return { team: "ROW", trip: [], open: [] };
    },
    async createIssue() {
      this.calls.push("create");
      return { identifier: "ROW-70", id: "ROW-70" };
    },
  };
  const app = await listen(defaultDeps({ memory, linear }));
  try {
    const stored = await post(app.port, "/api/typed", {
      text: sentence,
      memberId: "rowan",
      room: room(),
      deliveryId: "stdio-store",
    });
    assert.match(stored.body.body, /kiln/);
    await post(app.port, "/api/typed", { text: "set linear to ask", memberId: "rowan", room: room(), deliveryId: "stdio-ask" });
    const web = await post(app.port, "/api/typed", {
      text: "what was decided",
      memberId: "rowan",
      room: room(),
    });
    const messages = await stdioCall(recordEnv(accountId, delegateKey, "rowan", "room-1"), [
      {
        id: 2,
        params: {
          name: "recall",
          arguments: {
            text: "what was decided",
            memberId: "rowan",
            room: room(),
          },
        },
      },
      {
        id: 3,
        params: {
          name: "act",
          arguments: {
            text: "File the venue ticket hall-stdio",
            memberId: "rowan",
            room: room(),
            deliveryId: "stdio-act",
          },
        },
      },
    ]);
    const recall = messages.find((message) => message.id === 2);
    const acted = messages.find((message) => message.id === 3);
    const heard = JSON.parse(recall.result.content[0].text);
    const action = JSON.parse(acted.result.content[0].text);
    assert.equal(heard.status, web.body.status);
    assert.match(heard.body, /kiln/);
    assert.match(web.body.body, /kiln/);
    assert.equal(action.preference, "ask");
    assert.equal(action.link, null);
    assert.doesNotMatch(action.body, /filed/);
    assert.deepEqual(await connectorCalls(accountId), []);
    assert.deepEqual(linear.calls, []);

    const httpAct = await post(app.port, "/api/mcp", {
      name: "act",
      arguments: {
        text: "File the venue ticket hall-http",
        memberId: "rowan",
        room: room(),
        deliveryId: "http-act",
      },
    });
    assert.equal(httpAct.body.preference, "ask");
    assert.deepEqual(linear.calls, []);
  } finally {
    await app.close();
    await rm(ledgerDirectory(accountId), { recursive: true, force: true });
  }
});

test("a scripted meeting stores a decision, answers, and completes one allowed action", async () => {
  const sentence = "The booth ships on Friday";
  const linear = {
    calls: [],
    async readOpenTripTickets() {
      this.calls.push("read");
      return { team: "ROW", trip: [], open: [] };
    },
    async createIssue() {
      this.calls.push("create");
      return { identifier: "ROW-71", id: "ROW-71" };
    },
  };
  const meeting = {
    calls: [],
    async join() {
      this.calls.push("join");
      throw new Error("live join is not used");
    },
  };
  const session = createSession();
  const people = ["rowan", "alex", "mina"];
  const meet = room({ id: "room-meet", memberIds: ["sam"] });
  const quiet = await handleUtterance({
    door: "meeting",
    text: sentence,
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    deliveryId: "meet-quiet",
  }, { linear, meeting });
  assert.equal(quiet.entered, false);
  assert.equal(session.decisions.length, 0);

  const stored = await handleUtterance({
    door: "meeting",
    text: `Hey @Maple ${sentence}`,
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-store",
  }, { linear, meeting });
  assert.match(stored.body, /booth/);
  assert.equal(session.decisions.length, 1);

  const answer = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple what was decided",
    session,
    memberId: "alex",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-ask",
  }, { linear, meeting });
  assert.match(answer.body, /booth/);
  assert.equal(answer.status, "current");
  const mina = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple what was decided",
    session,
    memberId: "mina",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-mina",
  }, { linear, meeting });
  assert.match(mina.body, /booth/);
  assert.equal(mina.status, "current");

  await handleUtterance({
    door: "meeting",
    text: "Hey @Maple set linear to do",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-do",
  }, { linear, meeting });
  const filed = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple File the venue ticket booth-hall",
    session,
    memberId: "rowan",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-file",
  }, { linear, meeting });
  assert.equal(filed.status, "filed");
  assert.equal(filed.issueId, "ROW-71");
  assert.deepEqual(linear.calls, ["create"]);
  assert.deepEqual(meeting.calls, []);

  const outsider = await handleUtterance({
    door: "meeting",
    text: "Hey @Maple what was decided",
    session,
    memberId: "sam",
    room: meet,
    participants: people,
    addressed: true,
    deliveryId: "meet-out",
  }, { linear, meeting });
  assert.doesNotMatch(outsider.body, /booth/);
  assert.match(outsider.body, /not-invited/);
  assert.deepEqual(linear.calls, ["create"]);
});

test("a channel member recalls that channel and someone outside it receives no sentence", async () => {
  const sentence = "The channel keeps the green copy";
  const accountId = "company-ledger-channel";
  const delegateKey = "delegate-ledger-channel";
  const memory = ledgerMemory({ accountId, delegateKey });
  const channel = room({ id: "channel-1", kind: "channel", source: "slack" });
  const session = createSession();
  try {
    const stored = await handleUtterance({
      door: "channel",
      text: sentence,
      session,
      memberId: "rowan",
      room: channel,
      deliveryId: "channel-store",
    }, { memory });
    assert.match(stored.body, /green copy/);
    const member = await runProcess(
      "src/memory/read-record.js",
      recordEnv(accountId, delegateKey, "alex", "channel-1"),
    );
    const heard = JSON.parse(member.stdout);
    assert.match(heard.body, /green copy/);
    assert.equal(heard.status, stored.status);
    const outsider = await runProcess(
      "src/memory/read-record.js",
      recordEnv(accountId, delegateKey, "sam", "channel-1"),
    );
    assert.doesNotMatch(outsider.stdout, /green copy/);
    assert.match(JSON.parse(outsider.stdout).body, /not-invited/);
    const outsiderEvents = outsider.stderr.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(outsiderEvents.some((event) => event.outcome === "recall"), false);
    assert.equal(outsiderEvents.some((event) => event.outcome === "not-invited"), true);
  } finally {
    await rm(ledgerDirectory(accountId), { recursive: true, force: true });
  }
});
