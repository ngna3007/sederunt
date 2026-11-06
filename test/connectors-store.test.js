import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sealSecret, openSecret, encodeSecret, decodeSecret } from "../src/connectors/secrets.js";
import { createConnectorStore, createMemoryConnectorStore, createSupabaseConnectorStore } from "../src/connectors/store.js";
import { actionClassFromAnnotations, definitionHash } from "../src/connectors/tools.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const env = { SEDERUNT_MCP_FAKE: "1", MCP_SECRETS_KEY_V1: KEY };
const TOKEN = "super-secret-connector-token-abcd";
const lookup = async () => [{ address: "1.2.3.4" }];

function tool(name, description, annotations) {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: { q: { type: "string" } } },
    annotations,
  };
}

test("secrets round trip and refuse a missing key", () => {
  const sealed = sealSecret(encodeSecret({ token: TOKEN, headerName: "Authorization" }), env);
  assert.equal(sealed.ciphertext.toString("utf8").includes(TOKEN), false);
  assert.equal(decodeSecret(openSecret(sealed, env)).token, TOKEN);
  assert.throws(() => sealSecret("x", {}), (error) => error.code === "secrets-key" && error.message === "Connector secrets are not configured.");
});

test("memory store isolates tenants and pins tool approval", async () => {
  const store = createMemoryConnectorStore(env);
  assert.equal(actionClassFromAnnotations({ readOnlyHint: true }), "read");
  assert.equal(actionClassFromAnnotations({ readOnlyHint: true, destructiveHint: true }), "delete");
  assert.equal(actionClassFromAnnotations(undefined), "write");
  const created = await store.create("local", { name: "Demo Tools", url: "https://mcp.example/mcp", token: TOKEN, lookup });
  assert.equal(created.slug, "demo-tools");
  assert.equal(created.hasToken, true);
  assert.equal(created.tokenLast4, "abcd");
  assert.equal(created.status, "draft");
  assert.equal(JSON.stringify(created).includes(TOKEN), false);
  assert.equal((await store.openToken("local", created.id)).token, TOKEN);
  const other = await store.create("other", { name: "Demo Tools", url: "https://mcp.example/mcp", lookup });
  assert.equal((await store.list("local")).length, 1);
  assert.equal((await store.get("other", created.id)), null);
  assert.equal(other.slug, "demo-tools");
  const again = await store.create("local", { name: "Demo Tools", url: "https://mcp.example/mcp", lookup });
  assert.equal(again.slug, "demo-tools-2");

  const discovered = [
    tool("lookup_customer", "Look up", { readOnlyHint: true }),
    tool("create_note", "Create", { readOnlyHint: false }),
  ];
  const listed = await store.upsertTools("local", created.id, discovered);
  assert.equal(listed.tools.every((item) => item.enabled === false && item.changed === false), true);
  assert.equal(listed.tools[0].actionClass, "read");
  assert.equal(listed.tools[1].actionClass, "write");
  const enabled = await store.setToolEnabled("local", created.id, "lookup_customer", true);
  assert.equal(enabled.tools.find((item) => item.name === "lookup_customer").enabled, true);
  const changed = await store.upsertTools("local", created.id, [
    tool("lookup_customer", "Look up (updated).", { readOnlyHint: true }),
    tool("ping_status", "Ping", undefined),
  ]);
  const lookupTool = changed.tools.find((item) => item.name === "lookup_customer");
  const ping = changed.tools.find((item) => item.name === "ping_status");
  assert.equal(lookupTool.enabled, false);
  assert.equal(lookupTool.changed, true);
  assert.equal(ping.enabled, false);
  assert.equal(ping.changed, false);
  assert.equal(ping.actionClass, "write");
  assert.equal(changed.tools.some((item) => item.name === "create_note"), false);
  const reapproved = await store.setToolEnabled("local", created.id, "lookup_customer", true);
  const pinned = reapproved.tools.find((item) => item.name === "lookup_customer");
  assert.equal(pinned.enabled, true);
  assert.equal(pinned.changed, false);
  assert.equal(pinned.definitionHash, definitionHash(tool("lookup_customer", "Look up (updated).", { readOnlyHint: true })));

  const tested = await store.recordTest("local", created.id, { ok: false, code: "unauthorized" });
  assert.equal(tested.status, "needs_auth");
  assert.equal(tested.lastError, "The server refused the token.");
  const cleared = await store.replaceToken("local", created.id, { token: "" });
  assert.equal(cleared.hasToken, false);
  assert.equal(cleared.status, "draft");
  assert.equal(await store.openToken("local", created.id), null);
  assert.equal(await store.remove("local", created.id), true);
  assert.equal(await store.get("local", created.id), null);
});

test("store selection stays in memory without a service key", () => {
  assert.equal(createConnectorStore({ SUPABASE_URL: "https://example.supabase.co" }).kind, "memory");
  assert.equal(createConnectorStore({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_xxx", SEDERUNT_AUTH_FAKE: "1" }).kind, "memory");
  assert.equal(createConnectorStore({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_xxx" }, { fetch: async () => { throw new Error("no network"); } }).kind, "supabase");
});

test("supabase store writes ciphertext and tool rows through PostgREST", async () => {
  const tenant = randomUUID();
  const requests = [];
  const tables = { mcp_connectors: [], mcp_tools: [], mcp_connector_secrets: [] };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ table, method, body, search: url.search });
    assert.equal(String(init.headers.authorization || "").includes("sb_secret_xxx"), true);
    assert.equal(JSON.stringify(body || {}).includes(TOKEN), false);
    if (method === "GET") {
      if (table === "mcp_connectors") {
        return json(tables.mcp_connectors.filter((row) => url.searchParams.get("tenant_id") === `eq.${row.tenant_id}`).map((row) => ({
          ...row,
          mcp_tools: tables.mcp_tools.filter((tool) => tool.connector_id === row.id),
        })));
      }
      if (table === "mcp_connector_secrets") {
        return json(tables.mcp_connector_secrets.filter((row) => url.searchParams.get("connector_id") === `eq.${row.connector_id}`));
      }
      return json([]);
    }
    if (method === "POST") {
      tables[table].push(body);
      return json([body]);
    }
    if (method === "PATCH") {
      const rows = tables[table] || [];
      for (const row of rows) {
        const idMatch = !url.searchParams.get("id") || url.searchParams.get("id") === `eq.${row.id}`;
        const connectorMatch = !url.searchParams.get("connector_id") || url.searchParams.get("connector_id") === `eq.${row.connector_id}`;
        const nameMatch = !url.searchParams.get("name") || url.searchParams.get("name") === `eq.${row.name}`;
        if (idMatch && connectorMatch && nameMatch) Object.assign(row, body);
      }
      return json([body]);
    }
    if (method === "DELETE") return json([]);
    return json([]);
  };
  const store = createSupabaseConnectorStore({
    url: "https://example.supabase.co",
    key: "sb_secret_xxx",
    fetchImpl,
    env: { MCP_SECRETS_KEY_V1: KEY },
  });
  const created = await store.create(tenant, { name: "Demo", url: "https://mcp.example/mcp", token: TOKEN, headerName: "Authorization", lookup });
  assert.equal(created.tokenLast4, "abcd");
  assert.equal(JSON.stringify(created).includes(TOKEN), false);
  const secret = tables.mcp_connector_secrets[0];
  assert.match(secret.ciphertext, /^\\x[0-9a-f]+$/);
  assert.equal(Buffer.from(secret.ciphertext.slice(2), "hex").toString("utf8").includes(TOKEN), false);
  const opened = await store.openToken(tenant, created.id);
  assert.equal(opened.token, TOKEN);
  const saved = await store.upsertTools(tenant, created.id, [tool("lookup_customer", "Look", { readOnlyHint: true })]);
  assert.equal(saved.tools[0].enabled, false);
  const turnedOn = await store.setToolEnabled(tenant, created.id, "lookup_customer", true);
  assert.equal(turnedOn.tools[0].enabled, true);
  const enable = requests.filter((row) => row.table === "mcp_tools" && row.method === "PATCH").at(-1);
  assert.equal(enable.body.enabled, true);
  assert.equal(typeof enable.body.approved_hash, "string");
  assert.equal(requests.some((row) => row.table === "mcp_connector_secrets" && row.method === "GET" && row.search.includes("select=ciphertext")), true);
  assert.equal(requests.some((row) => row.table === "mcp_connectors" && row.search.includes("mcp_connector_secrets")), false);
});

function json(body) {
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify(body); },
  };
}
