import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createFormsService, formsFakeEnabled } from "../src/mcp-forms/api.js";
import { runWithFormsContext } from "../src/mcp-forms/context.js";
import { mapGoogleError } from "../src/mcp-forms/errors.js";
import { startFormsServer } from "../src/mcp-forms/serve.js";
import { createApp } from "../src/server.js";

const TOKEN = "ya29.forms-test-token";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof body === "string" ? body : JSON.stringify(body); },
  };
}

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function httpCall(port, method, path, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function appFor(env, fetchImpl) {
  return createApp({
    companyLoaded: true,
    env,
    fetch: fetchImpl,
    deps: {
      memory: { async remember() { return { blobId: null }; } },
      tatum: { async getObject() { return { text: "" }; } },
    },
  });
}

function liveService(fetchImpl) {
  return createFormsService({ fake: false, fetchImpl, origin: "http://127.0.0.1:9" });
}

function withToken(token, fn) {
  return runWithFormsContext({ token, origin: "http://127.0.0.1:9" }, fn);
}

test("forms fake flag follows FORMS_FAKE and otherwise AUTH_FAKE", () => {
  assert.equal(formsFakeEnabled({ SEDERUNT_FORMS_FAKE: "1" }), true);
  assert.equal(formsFakeEnabled({ SEDERUNT_FORMS_FAKE: "0", SEDERUNT_AUTH_FAKE: "1" }), false);
  assert.equal(formsFakeEnabled({ SEDERUNT_AUTH_FAKE: "1" }), true);
  assert.equal(formsFakeEnabled({}), false);
});

test("create_form sends title, then batchUpdate, then setPublishSettings", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, authorization: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
    if (calls.length === 1) {
      return jsonResponse(200, { formId: "Form_1", info: { title: "Standup" }, responderUri: "https://docs.google.com/forms/d/Form_1/viewform" });
    }
    return jsonResponse(200, {});
  };
  const service = liveService(fetchImpl);
  const created = await withToken(TOKEN, () => service.createForm({
    title: "Standup",
    description: "Daily",
    publish: true,
    questions: [
      { title: "Name", type: "short_text", required: true },
      { title: "Notes", type: "paragraph" },
      { title: "Room", type: "multiple_choice", options: ["A", " B "] },
      { title: "Days", type: "checkboxes", options: ["Mon", "Tue"] },
      { title: "Site", type: "dropdown", options: ["HQ"] },
      { title: "Score", type: "scale" },
      { title: "Effort", type: "scale", low: 0, high: 10, labels: { low: "Light", high: "Heavy" } },
      { title: "When", type: "date" },
    ],
  }));
  assert.deepEqual(created, {
    formId: "Form_1",
    title: "Standup",
    responderUri: "https://docs.google.com/forms/d/Form_1/viewform",
    editUrl: "https://docs.google.com/forms/d/Form_1/edit",
    published: true,
    questionCount: 8,
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://forms.googleapis.com/v1/forms");
  assert.equal(calls[0].authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(calls[0].body, { info: { title: "Standup" } });
  assert.equal(calls[1].url, "https://forms.googleapis.com/v1/forms/Form_1:batchUpdate");
  assert.deepEqual(calls[1].body.requests[0], {
    updateFormInfo: { info: { description: "Daily" }, updateMask: "description" },
  });
  assert.deepEqual(calls[1].body.requests.slice(1).map((request) => request.createItem.location.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(calls[1].body.requests[1].createItem.item, {
    title: "Name",
    questionItem: { question: { required: true, textQuestion: { paragraph: false } } },
  });
  assert.deepEqual(calls[1].body.requests[2].createItem.item.questionItem.question, {
    required: false,
    textQuestion: { paragraph: true },
  });
  assert.deepEqual(calls[1].body.requests[3].createItem.item.questionItem.question.choiceQuestion, {
    type: "RADIO",
    options: [{ value: "A" }, { value: "B" }],
  });
  assert.equal(calls[1].body.requests[4].createItem.item.questionItem.question.choiceQuestion.type, "CHECKBOX");
  assert.equal(calls[1].body.requests[5].createItem.item.questionItem.question.choiceQuestion.type, "DROP_DOWN");
  assert.deepEqual(calls[1].body.requests[6].createItem.item.questionItem.question.scaleQuestion, { low: 1, high: 5 });
  assert.deepEqual(calls[1].body.requests[7].createItem.item.questionItem.question.scaleQuestion, {
    low: 0,
    high: 10,
    lowLabel: "Light",
    highLabel: "Heavy",
  });
  assert.deepEqual(calls[1].body.requests[8].createItem.item.questionItem.question.dateQuestion, {
    includeTime: false,
    includeYear: true,
  });
  assert.equal(calls[2].url, "https://forms.googleapis.com/v1/forms/Form_1:setPublishSettings");
  assert.deepEqual(calls[2].body, {
    publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
    updateMask: "publishState",
  });
  assert.equal(JSON.stringify(created).includes(TOKEN), false);
});

test("publish false skips setPublishSettings and an empty form skips batchUpdate", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
    return jsonResponse(200, { formId: "Form_2", responderUri: "https://docs.google.com/forms/d/Form_2/viewform" });
  };
  const created = await withToken(TOKEN, () => liveService(fetchImpl).createForm({ title: "Bare", publish: false }));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { info: { title: "Bare" } });
  assert.equal(created.published, false);
  assert.equal(created.questionCount, 0);
});

test("add_questions appends after existing items", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === "GET") {
      return jsonResponse(200, { formId: "Form_9", items: [{ title: "One" }, { title: "Two" }] });
    }
    return jsonResponse(200, {});
  };
  const added = await withToken(TOKEN, () => liveService(fetchImpl).addQuestions({
    formId: "Form_9",
    questions: [{ title: "Three", type: "short_text" }],
  }));
  assert.equal(added.added, 1);
  assert.equal(added.questionCount, 3);
  assert.equal(calls[1].body.requests[0].createItem.location.index, 2);
});

test("get_form and list_responses map titles onto answers", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).includes("/responses")) {
      return jsonResponse(200, {
        responses: [{
          responseId: "r1",
          createTime: "2026-11-04T00:00:00.000Z",
          answers: {
            q1: { questionId: "q1", textAnswers: { answers: [{ value: "Ada" }, { value: "Lovelace" }] } },
          },
        }],
        nextPageToken: "next-1",
      });
    }
    return jsonResponse(200, {
      formId: "Form_3",
      info: { title: "Roster", description: "People" },
      responderUri: "https://docs.google.com/forms/d/Form_3/viewform",
      publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
      items: [{
        title: "Name",
        questionItem: { question: { questionId: "q1", required: true, textQuestion: { paragraph: false } } },
      }],
    });
  };
  const service = liveService(fetchImpl);
  const form = await withToken(TOKEN, () => service.getForm({ formId: "Form_3" }));
  assert.equal(form.title, "Roster");
  assert.equal(form.questions[0].type, "short_text");
  assert.equal(form.published, true);
  const listed = await withToken(TOKEN, () => service.listResponses({ formId: "Form_3", pageSize: 25, pageToken: "cursor" }));
  assert.deepEqual(listed.responses[0].answers, { Name: "Ada, Lovelace" });
  assert.equal(listed.nextPageToken, "next-1");
  assert.equal(calls[2].url, "https://forms.googleapis.com/v1/forms/Form_3/responses?pageSize=25&pageToken=cursor");
  const plain = [];
  await withToken(TOKEN, () => service.listResponses({ formId: "Form_3" }));
  assert.equal(calls.at(-1).url.endsWith("/responses"), true);
  assert.equal(plain.length, 0);
});

test("validation rejects bad questions before any request", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("network");
  };
  const service = liveService(fetchImpl);
  const samples = [
    [{ title: "Pick", type: "multiple_choice" }, /1 and 50 options/],
    [{ title: "Pick", type: "checkboxes", options: ["A", "A"] }, /unique/],
    [{ title: "Pick", type: "dropdown", options: ["  "] }, /must not be empty/],
    [{ title: "Pick", type: "dropdown", options: [] }, /1 and 50/],
    [{ title: "x".repeat(301), type: "short_text" }, /300 characters/],
    [{ title: "Score", type: "scale", low: 5, high: 5 }, /low below high/],
    [{ title: "Score", type: "scale", low: 1.5, high: 5 }, /integers/],
    [{ title: "Nope", type: "file" }, /Unknown question type/],
  ];
  for (const [question, pattern] of samples) {
    await assert.rejects(
      () => service.createForm({ title: "Form", questions: [question] }),
      (error) => error.message.startsWith("invalid-argument:") && pattern.test(error.message),
    );
  }
  const many = Array.from({ length: 101 }, (_, index) => ({ title: `Q${index}`, type: "short_text" }));
  await assert.rejects(() => service.createForm({ title: "Form", questions: many }), /at most 100/);
  await assert.rejects(() => service.createForm({ title: "   " }), /form title/);
  await assert.rejects(() => service.getForm({ formId: "../etc" }), /form id/);
  await assert.rejects(() => service.listResponses({ formId: "Form_1", pageSize: 0 }), /Page size/);
  await assert.rejects(() => service.addQuestions({ formId: "Form_1", questions: [] }), /at least one/);
  assert.equal(calls, 0);
  const fake = createFormsService({ fake: true, origin: "http://127.0.0.1:9", fetchImpl });
  const fifty = Array.from({ length: 50 }, (_, index) => `Option ${index}`);
  const full = Array.from({ length: 100 }, (_, index) => ({ title: `Q${index}`, type: "short_text" }));
  const created = await fake.createForm({
    title: "Limits",
    publish: false,
    questions: [{ title: "Pick", type: "multiple_choice", options: fifty }, ...full.slice(1)],
  });
  assert.equal(created.questionCount, 100);
  assert.equal(calls, 0);
});

test("google errors become tool errors and tokens are redacted", async () => {
  assert.equal(mapGoogleError(401, { error: { message: `Bearer ${TOKEN}` } }, TOKEN), "unauthorized: Google needs you to sign in again.");
  assert.match(mapGoogleError(403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, TOKEN), /forbidden:.*SERVICE_DISABLED/);
  assert.match(mapGoogleError(403, { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, TOKEN), /ACCESS_TOKEN_SCOPE_INSUFFICIENT/);
  assert.equal(mapGoogleError(404, {}, TOKEN), "not-found: That form was not found.");
  const leaked = mapGoogleError(400, { error: { message: `bad ${TOKEN} and ya29.OTHERSECRET` } }, TOKEN);
  assert.match(leaked, /^invalid-argument:/);
  assert.equal(leaked.includes(TOKEN), false);
  assert.equal(leaked.includes("ya29."), false);

  const cases = [
    [401, { error: { message: TOKEN } }, /unauthorized:/],
    [403, { error: { message: TOKEN, details: [{ reason: "SERVICE_DISABLED" }] } }, /SERVICE_DISABLED/],
    [404, { error: { message: TOKEN } }, /^not-found:/],
    [400, { error: { message: `see ${TOKEN}` } }, /^invalid-argument:/],
  ];
  for (const [status, body, pattern] of cases) {
    const service = liveService(async () => jsonResponse(status, body));
    await assert.rejects(
      () => withToken(TOKEN, () => service.getForm({ formId: "Form_1" })),
      (error) => pattern.test(error.message) && !error.message.includes(TOKEN) && !String(error.stack || "").includes("no-token-check"),
    );
  }
  const offline = liveService(async () => {
    throw new Error(`connect ${TOKEN}`);
  });
  await assert.rejects(
    () => withToken(TOKEN, () => offline.getForm({ formId: "Form_1" })),
    (error) => error.message === "invalid-argument: Google Forms could not be reached." && !error.message.includes(TOKEN),
  );
});

test("a live call does not keep the token for the next call", async () => {
  let calls = 0;
  const service = liveService(async () => {
    calls += 1;
    return jsonResponse(200, { formId: "Form_4", responderUri: "https://docs.google.com/forms/d/Form_4/viewform" });
  });
  await withToken(TOKEN, () => service.createForm({ title: "Once", publish: false }));
  await assert.rejects(() => service.createForm({ title: "Twice", publish: false }), /unauthorized/);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(service).includes(TOKEN), false);
});

test("fake forms are deterministic and do not call fetch", async () => {
  let calls = 0;
  const service = createFormsService({
    fake: true,
    origin: "http://127.0.0.1:9",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  const seeded = await service.listResponses({ formId: "fake-form-seed" });
  assert.equal(seeded.responses.length, 2);
  assert.equal(seeded.responses[0].answers["How was the week?"], "Good");
  assert.equal(seeded.responses[1].answers["How was the week?"], "Busy");
  const created = await service.createForm({
    title: "Retro",
    questions: [{ title: "Went well", type: "paragraph" }],
  });
  assert.equal(created.formId, "fake-form-1");
  assert.equal(created.published, true);
  assert.equal(created.responderUri, "http://127.0.0.1:9/forms/fake/fake-form-1/viewform");
  const again = await service.createForm({ title: "Second", publish: false });
  assert.equal(again.formId, "fake-form-2");
  assert.equal(again.published, false);
  const added = await service.addQuestions({ formId: "fake-form-1", questions: [{ title: "Next", type: "date" }] });
  assert.equal(added.questionCount, 2);
  const form = await service.getForm({ formId: "fake-form-1" });
  assert.equal(form.questions[1].type, "date");
  await assert.rejects(() => service.getForm({ formId: "fake-form-3" }), /not-found/);
  assert.equal(calls, 0);
});

test("mcp client talks to the forms server over streamable http", async (t) => {
  let calls = 0;
  const app = appFor({ SEDERUNT_FORMS_FAKE: "1", SEDERUNT_MEMBER: "mina" }, async () => {
    calls += 1;
    throw new Error("network");
  });
  const port = await listen(app);
  const client = new Client({ name: "forms-test", version: "0.0.0" }, { versionNegotiation: { mode: "legacy" } });
  t.after(async () => {
    await client.close().catch(() => {});
    await app.close();
  });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/forms`));
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["add_questions", "create_form", "get_form", "list_responses", "publish_form"]);
  const byName = Object.fromEntries(listed.tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.create_form.annotations.readOnlyHint, false);
  assert.equal(byName.create_form.annotations.destructiveHint, false);
  assert.equal(byName.get_form.annotations.readOnlyHint, true);
  assert.equal(byName.list_responses.annotations.readOnlyHint, true);
  assert.equal(byName.create_form.inputSchema.type, "object");
  assert.equal(typeof byName.create_form.inputSchema.properties.title, "object");
  const created = await client.callTool({
    name: "create_form",
    arguments: { title: "Standup", questions: [{ title: "Name", type: "short_text" }] },
  });
  assert.notEqual(created.isError, true);
  const body = JSON.parse(created.content[0].text);
  assert.equal(body.formId, "fake-form-1");
  assert.equal(body.title, "Standup");
  assert.equal(body.published, true);
  assert.equal(body.questionCount, 1);
  assert.equal(body.editUrl, "https://docs.google.com/forms/d/fake-form-1/edit");
  assert.equal(body.responderUri, `http://127.0.0.1:${port}/forms/fake/fake-form-1/viewform`);
  const page = await httpCall(port, "GET", "/forms/fake/fake-form-1/viewform");
  assert.equal(page.status, 200);
  assert.match(page.raw, /Standup/);
  assert.match(page.raw, /sederunt-mark/);
  assert.equal(page.raw.includes(">S<"), false);
  const read = await client.callTool({ name: "get_form", arguments: { formId: "fake-form-seed" } });
  const seed = JSON.parse(read.content[0].text);
  assert.equal(seed.title, "Weekly feedback");
  const responses = await client.callTool({ name: "list_responses", arguments: { formId: "fake-form-seed" } });
  const listedResponses = JSON.parse(responses.content[0].text);
  assert.equal(listedResponses.responses[0].answers["Anything else?"], "Ship it");
  const invalid = await client.callTool({
    name: "create_form",
    arguments: { title: "Bad", questions: [{ title: "Pick", type: "multiple_choice", options: ["A", "A"] }] },
  });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /^invalid-argument:/);
  assert.equal(calls, 0);
  const missing = await httpCall(port, "GET", "/forms/fake/fake-form-9/viewform");
  assert.equal(missing.status, 404);
});

test("live mcp errors redact the bearer token", async (t) => {
  const app = appFor({ SEDERUNT_FORMS_FAKE: "0", SEDERUNT_MEMBER: "mina" }, async () => jsonResponse(401, {
    error: { message: `leaked ${TOKEN} ya29.OTHERSECRET` },
  }));
  const port = await listen(app);
  const client = new Client({ name: "forms-test", version: "0.0.0" }, { versionNegotiation: { mode: "legacy" } });
  t.after(async () => {
    await client.close().catch(() => {});
    await app.close();
  });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/forms`), {
    authProvider: { async token() { return TOKEN; } },
  });
  await client.connect(transport);
  const result = await client.callTool({ name: "create_form", arguments: { title: "Nope" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^unauthorized:/);
  assert.equal(result.content[0].text.includes(TOKEN), false);
  assert.equal(result.content[0].text.includes("ya29."), false);
  const preview = await httpCall(port, "GET", "/forms/fake/fake-form-1/viewform");
  assert.equal(preview.status, 404);
});

test("standalone forms server listens on the given port", async (t) => {
  const server = await startFormsServer({ env: { SEDERUNT_FORMS_FAKE: "1" }, port: 0 });
  const port = server.address().port;
  const client = new Client({ name: "forms-standalone", version: "0.0.0" }, { versionNegotiation: { mode: "legacy" } });
  t.after(async () => {
    await client.close().catch(() => {});
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/forms`));
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 5);
});
