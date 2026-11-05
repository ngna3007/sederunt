import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";

function listen() {
  const app = createApp({ env: { FILES_DEMO: "1" } });
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => ({
    port: app.address().port,
    close: () => new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve()))),
  }));
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const text = raw.toString("utf8");
        let body = null;
        if ((res.headers["content-type"] || "").includes("json")) {
          body = JSON.parse(text);
        }
        resolve({ status: res.statusCode, raw, text, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("the files page names the view and the empty state", async () => {
  const server = await listen();
  try {
    const page = await get(server.port, "/console/files?as=empty");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-show="files"/);
    assert.match(page.text, /id="files"/);
    assert.match(page.text, /id="channel-files-empty"/);
    assert.match(page.text, /No files yet\./);
    const api = await get(server.port, "/api/files?as=empty");
    assert.equal(api.status, 200);
    assert.equal(api.body.files.length, 0);
    assert.equal(api.body.unanswered.length, 0);
  } finally {
    await server.close();
  }
});

test("the demo owner, member, and admin see different file actions", async () => {
  const server = await listen();
  try {
    const owner = await get(server.port, "/api/files?as=owner");
    const deleting = owner.body.files.find((file) => file.name === "old-deck.pptx");
    assert.equal(deleting.deleting, true);
    assert.equal(owner.body.requests.some((request) => request.canAnswer && request.fileName === "roadmap.pdf"), true);

    const member = await get(server.port, "/api/files?as=member");
    const brief = member.body.files.find((file) => file.name === "launch-brief.pdf");
    const own = member.body.files.find((file) => file.name === "booth-notes.txt");
    assert.equal(brief.canRequest, true);
    assert.equal(brief.canDelete, false);
    assert.equal(own.canDelete, true);
    assert.equal(member.body.unanswered.length, 0);

    const admin = await get(server.port, "/api/files?as=admin");
    assert.equal(admin.body.files.some((file) => file.name === "q4-plan.pdf"), false);
    assert.equal(admin.body.unanswered.some((request) => request.fileName === "q4-plan.pdf" && request.canDismiss), true);
    const shared = admin.body.files.find((file) => file.name === "roadmap.pdf");
    assert.equal(shared.canDelete, true);
    assert.equal(shared.canRequest, false);
  } finally {
    await server.close();
  }
});

test("Vercel attaches /api/files when Files is configured", async () => {
  const prev = { VERCEL: process.env.VERCEL, FILES_DEMO: process.env.FILES_DEMO };
  process.env.VERCEL = "1";
  process.env.FILES_DEMO = "1";
  let server;
  try {
    // Same shape as the serverless entry: no options.env, no options.files.
    const app = createApp({});
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
    server = {
      port: app.address().port,
      close: () => new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve()))),
    };
    const api = await get(server.port, "/api/files?as=empty");
    assert.equal(api.status, 200);
    assert.equal(api.body.files.length, 0);
  } finally {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.FILES_DEMO === undefined) delete process.env.FILES_DEMO;
    else process.env.FILES_DEMO = prev.FILES_DEMO;
    if (server) await server.close();
  }
});
