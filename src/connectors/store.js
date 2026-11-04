import { randomUUID } from "node:crypto";
import { connectorError, connectorMessage } from "./errors.js";
import { decodeSecret, encodeSecret, openSecret, sealSecret } from "./secrets.js";
import {
  mergeDiscoveredTools,
  publicConnector,
  slugFromName,
  tokenLast4,
  uniqueSlug,
  validHeaderName,
  validToolName,
  withEnabled,
} from "./tools.js";
import { CALENDAR_SCOPES } from "../calendar/mcp.js";
import { GOOGLE_CALENDAR_MCP_URL, isGoogleCalendarPreset } from "./builtin-calendar.js";
import { BUILTIN_GOOGLE_FORMS_URL, isBuiltinGoogleForms } from "./builtin-forms.js";
import { guardConnectorUrl } from "./url-guard.js";
import { FORMS_SCOPES } from "./google-person.js";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetch?: typeof fetch, memory?: boolean }} [options]
 */
export function createConnectorStore(env = process.env, options = {}) {
  const authFake = String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1";
  const mcpFake = String(env.SEDERUNT_MCP_FAKE || "").trim() === "1";
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (options.memory || authFake || mcpFake || !url || !key) return createMemoryConnectorStore(env);
  return createSupabaseConnectorStore({ url, key, fetchImpl: options.fetch || globalThis.fetch, env });
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createMemoryConnectorStore(env = process.env) {
  const connectors = new Map();
  const tools = new Map();
  const secrets = new Map();
  const tenants = new Set();

  function rowsFor(tenantId) {
    return [...connectors.values()].filter((row) => row.tenantId === tenantId);
  }

  function must(tenantId, id) {
    const row = connectors.get(id);
    if (!row || row.tenantId !== tenantId) return null;
    return row;
  }

  function present(row) {
    return publicConnector(row, tools.get(row.id) || []);
  }

  return {
    kind: "memory",
    soleTenantId() {
      return tenants.size === 1 ? [...tenants][0] : "";
    },
    async list(tenantId) {
      return rowsFor(tenantId).map(present);
    },
    async get(tenantId, id) {
      const row = must(tenantId, id);
      return row ? present(row) : null;
    },
    async openToken(tenantId, id) {
      const row = must(tenantId, id);
      const sealed = row && secrets.get(id);
      if (!row || !sealed) return null;
      return decodeSecret(openSecret(sealed, env));
    },
    async create(tenantId, input) {
      const name = String(input?.name || "").trim();
      if (!name || name.length > 120) throw connectorError("invalid-url", "Enter a name.");
      const url = await resolveConnectorUrl(input, env);
      const headerName = input?.token ? validHeaderName(input?.headerName || "Authorization") : "";
      if (input?.token && !headerName) throw connectorError("invalid-url", "Enter a header name.");
      const base = slugFromName(name);
      if (!base) throw connectorError("invalid-url", "Enter a name.");
      const slug = uniqueSlug(base, rowsFor(tenantId).map((row) => row.slug));
      let sealed = null;
      if (input?.token) sealed = sealSecret(encodeSecret({ token: String(input.token), headerName }), env);
      const row = {
        id: randomUUID(),
        tenantId,
        slug,
        name,
        url,
        transport: "streamable_http",
        authType: storedAuthType(input),
        preset: storedPreset(input),
        scopes: storedScopes(input),
        status: "draft",
        enabled: true,
        lastTestedAt: null,
        lastError: "",
        serverInfo: null,
        headerName: headerName || "",
        tokenLast4: input?.token ? tokenLast4(input.token) : "",
        hasToken: Boolean(input?.token),
      };
      connectors.set(row.id, row);
      tools.set(row.id, []);
      if (sealed) secrets.set(row.id, { ...sealed, tenantId });
      tenants.add(tenantId);
      return present(row);
    },
    async update(tenantId, id, patch) {
      const row = must(tenantId, id);
      if (!row) return null;
      if (typeof patch?.name === "string" && patch.name.trim()) row.name = patch.name.trim().slice(0, 120);
      if (typeof patch?.url === "string") {
        row.url = await resolveConnectorUrl({ url: patch.url, preset: row.preset, lookup: patch.lookup }, env);
        row.status = "draft";
        row.lastTestedAt = null;
      }
      return present(row);
    },
    async remove(tenantId, id) {
      const row = must(tenantId, id);
      if (!row) return false;
      connectors.delete(id);
      tools.delete(id);
      secrets.delete(id);
      return true;
    },
    async upsertTools(tenantId, id, discovered) {
      const row = must(tenantId, id);
      if (!row) return null;
      tools.set(id, mergeDiscoveredTools(tools.get(id) || [], discovered || []));
      return present(row);
    },
    async setToolEnabled(tenantId, id, name, enabled) {
      const row = must(tenantId, id);
      if (!row || !validToolName(name)) return null;
      const list = tools.get(id) || [];
      const tool = list.find((item) => item.name === name);
      if (!tool) return null;
      const next = withEnabled(tool, enabled === true);
      tools.set(id, list.map((item) => (item.name === name ? next : item)));
      return present(row);
    },
    async recordTest(tenantId, id, result) {
      const row = must(tenantId, id);
      if (!row) return null;
      row.lastTestedAt = new Date().toISOString();
      if (result?.ok) {
        row.status = "connected";
        row.lastError = "";
        row.serverInfo = {
          name: String(result.serverInfo?.name || ""),
          version: String(result.serverInfo?.version || ""),
        };
        tools.set(id, mergeDiscoveredTools(tools.get(id) || [], result.tools || []));
      } else {
        row.status = result?.code === "unauthorized" ? "needs_auth" : "error";
        row.lastError = connectorMessage(result?.code || "protocol");
      }
      return present(row);
    },
    async replaceToken(tenantId, id, next) {
      const row = must(tenantId, id);
      if (!row) return null;
      const token = String(next?.token || "");
      if (!token) {
        secrets.delete(id);
        row.authType = "none";
        row.headerName = "";
        row.tokenLast4 = "";
        row.hasToken = false;
      } else {
        const headerName = validHeaderName(next?.headerName || "Authorization");
        if (!headerName) throw connectorError("invalid-url", "Enter a header name.");
        secrets.set(id, { ...sealSecret(encodeSecret({ token, headerName }), env), tenantId });
        row.authType = "bearer";
        row.headerName = headerName;
        row.tokenLast4 = tokenLast4(token);
        row.hasToken = true;
      }
      row.status = "draft";
      row.lastTestedAt = null;
      return present(row);
    },
  };
}

/**
 * Forms keeps a marker. Calendar stores the fixed Google MCP URL and skips DNS.
 * Every other connector still goes through the URL guard.
 *
 * @param {{ url?: string, preset?: string, lookup?: Function }} input
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
async function resolveConnectorUrl(input, env) {
  if (isBuiltinGoogleForms(input)) return BUILTIN_GOOGLE_FORMS_URL;
  if (isGoogleCalendarPreset(input)) return GOOGLE_CALENDAR_MCP_URL;
  const url = await guardConnectorUrl(input?.url, { env, lookup: input?.lookup });
  return url.href;
}

function storedPreset(input) {
  if (input?.preset === "google-forms") return "google-forms";
  if (input?.preset === "google-calendar") return "google-calendar";
  return null;
}

function storedAuthType(input) {
  const preset = storedPreset(input);
  if ((preset === "google-forms" || preset === "google-calendar") && input?.authType === "google_oauth" && !input?.token) {
    return "google_oauth";
  }
  if (input?.token) return "bearer";
  return "none";
}

function storedScopes(input) {
  if (storedAuthType(input) !== "google_oauth") return [];
  const given = Array.isArray(input?.scopes) ? input.scopes : [];
  const allowed = storedPreset(input) === "google-calendar" ? CALENDAR_SCOPES : FORMS_SCOPES;
  return allowed.filter((scope) => given.includes(scope));
}

function bytea(buffer) {
  return `\\x${Buffer.from(buffer).toString("hex")}`;
}

function fromBytea(value) {
  if (Buffer.isBuffer(value)) return value;
  const text = String(value || "");
  const hex = text.startsWith("\\x") ? text.slice(2) : text;
  return Buffer.from(hex, "hex");
}

/**
 * @param {{ url: string, key: string, fetchImpl: typeof fetch, env: NodeJS.ProcessEnv | Record<string, string | undefined> }} options
 */
export function createSupabaseConnectorStore({ url, key, fetchImpl, env }) {
  const rest = `${url}/rest/v1`;

  async function call(path, { method = "GET", body, query } = {}) {
    const endpoint = new URL(`${rest}/${path}`);
    if (query) {
      for (const [name, value] of Object.entries(query)) endpoint.searchParams.set(name, String(value));
    }
    const headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "accept-profile": "public",
      "content-profile": "public",
    };
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      headers.prefer = "return=representation";
      payload = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(endpoint, { method, headers, body: payload, redirect: "manual" });
    } catch {
      throw connectorError("network", "The connector store could not be reached.");
    }
    const text = await response.text();
    if (!response.ok) throw connectorError("network", "The connector store could not be reached.");
    if (!text) return null;
    return JSON.parse(text);
  }

  function toolFrom(row) {
    return {
      name: row.name,
      description: row.description || "",
      inputSchema: row.input_schema || { type: "object" },
      annotations: row.annotations || {},
      actionClass: row.action_class || "write",
      enabled: row.enabled === true,
      approvedHash: row.approved_hash || null,
      definitionHash: row.definition_hash,
    };
  }

  function fromConnector(row) {
    const headers = row.headers_public || {};
    const list = Array.isArray(row.mcp_tools) ? row.mcp_tools.map(toolFrom) : [];
    return publicConnector({
      id: row.id,
      slug: row.slug,
      name: row.display_name,
      url: row.url,
      transport: row.transport,
      authType: row.auth_type,
      preset: row.preset || null,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      status: row.status,
      enabled: row.enabled !== false,
      lastTestedAt: row.last_tested_at,
      lastError: row.last_error || "",
      serverInfo: row.server_info,
      headerName: headers.header_name || "",
      tokenLast4: headers.token_last4 || "",
      hasToken: Boolean(headers.token_last4),
    }, list);
  }

  async function load(tenantId, id) {
    const query = {
      select: "*,mcp_tools(*)",
      tenant_id: `eq.${tenantId}`,
    };
    if (id) query.id = `eq.${id}`;
    const rows = await call("mcp_connectors", { query });
    return Array.isArray(rows) ? rows : [];
  }

  async function writeSecret(tenantId, id, token, headerName) {
    const sealed = sealSecret(encodeSecret({ token, headerName }), env);
    const body = {
      connector_id: id,
      tenant_id: tenantId,
      ciphertext: bytea(sealed.ciphertext),
      nonce: bytea(sealed.nonce),
      key_version: sealed.keyVersion,
    };
    const existing = await call("mcp_connector_secrets", {
      query: { select: "connector_id", connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}` },
    });
    if (Array.isArray(existing) && existing.length) {
      await call("mcp_connector_secrets", {
        method: "PATCH",
        query: { connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}` },
        body,
      });
      return;
    }
    await call("mcp_connector_secrets", { method: "POST", body });
  }

  return {
    kind: "supabase",
    soleTenantId() {
      return "";
    },
    async list(tenantId) {
      const rows = await load(tenantId);
      return rows.map(fromConnector);
    },
    async get(tenantId, id) {
      const rows = await load(tenantId, id);
      return rows[0] ? fromConnector(rows[0]) : null;
    },
    async openToken(tenantId, id) {
      const rows = await call("mcp_connector_secrets", {
        query: { select: "ciphertext,nonce,key_version", connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}` },
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return decodeSecret(openSecret({ ciphertext: fromBytea(row.ciphertext), nonce: fromBytea(row.nonce) }, env));
    },
    async create(tenantId, input) {
      const name = String(input?.name || "").trim();
      if (!name || name.length > 120) throw connectorError("invalid-url", "Enter a name.");
      const guarded = await resolveConnectorUrl(input, env);
      const headerName = input?.token ? validHeaderName(input?.headerName || "Authorization") : "";
      if (input?.token && !headerName) throw connectorError("invalid-url", "Enter a header name.");
      const base = slugFromName(name);
      if (!base) throw connectorError("invalid-url", "Enter a name.");
      const existing = await load(tenantId);
      const slug = uniqueSlug(base, existing.map((row) => row.slug));
      if (input?.token) sealSecret(encodeSecret({ token: String(input.token), headerName }), env);
      const id = randomUUID();
      const createdBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input?.createdBy || ""))
        ? input.createdBy
        : undefined;
      const body = {
        id,
        tenant_id: tenantId,
        slug,
        display_name: name,
        preset: storedPreset(input),
        transport: "streamable_http",
        url: guarded,
        command: null,
        auth_type: storedAuthType(input),
        headers_public: input?.token ? { header_name: headerName, token_last4: tokenLast4(input.token) } : {},
        scopes: storedScopes(input),
        enabled: true,
        status: "draft",
      };
      if (createdBy) body.created_by = createdBy;
      const inserted = await call("mcp_connectors", { method: "POST", body });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (input?.token) await writeSecret(tenantId, id, String(input.token), headerName);
      return fromConnector({ ...(row || body), mcp_tools: [] });
    },
    async update(tenantId, id, patch) {
      const current = await this.get(tenantId, id);
      if (!current) return null;
      const body = {};
      if (typeof patch?.name === "string" && patch.name.trim()) body.display_name = patch.name.trim().slice(0, 120);
      if (typeof patch?.url === "string") {
        body.url = await resolveConnectorUrl({ url: patch.url, preset: current.preset, lookup: patch.lookup }, env);
      }
      if (!Object.keys(body).length) return current;
      await call("mcp_connectors", { method: "PATCH", query: { id: `eq.${id}`, tenant_id: `eq.${tenantId}` }, body });
      return this.get(tenantId, id);
    },
    async remove(tenantId, id) {
      const current = await this.get(tenantId, id);
      if (!current) return false;
      await call("mcp_connectors", { method: "DELETE", query: { id: `eq.${id}`, tenant_id: `eq.${tenantId}` } });
      return true;
    },
    async upsertTools(tenantId, id, discovered) {
      const rows = await load(tenantId, id);
      if (!rows[0]) return null;
      const merged = mergeDiscoveredTools((rows[0].mcp_tools || []).map(toolFrom), discovered || []);
      const seen = new Set(merged.map((tool) => tool.name));
      for (const old of rows[0].mcp_tools || []) {
        if (!seen.has(old.name)) {
          await call("mcp_tools", { method: "DELETE", query: { connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}`, name: `eq.${old.name}` } });
        }
      }
      const prior = new Set((rows[0].mcp_tools || []).map((tool) => tool.name));
      for (const tool of merged) {
        const body = {
          connector_id: id,
          tenant_id: tenantId,
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
          annotations: tool.annotations,
          action_class: tool.actionClass,
          enabled: tool.enabled === true,
          definition_hash: tool.definitionHash,
          approved_hash: tool.approvedHash,
          last_seen_at: new Date().toISOString(),
        };
        if (prior.has(tool.name)) {
          await call("mcp_tools", {
            method: "PATCH",
            query: { connector_id: `eq.${id}`, name: `eq.${tool.name}` },
            body,
          });
        } else {
          await call("mcp_tools", { method: "POST", body });
        }
      }
      return this.get(tenantId, id);
    },
    async setToolEnabled(tenantId, id, name, enabled) {
      if (!validToolName(name)) return null;
      const rows = await load(tenantId, id);
      const tool = (rows[0]?.mcp_tools || []).map(toolFrom).find((item) => item.name === name);
      if (!tool) return null;
      const next = withEnabled(tool, enabled === true);
      await call("mcp_tools", {
        method: "PATCH",
        query: { connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}`, name: `eq.${name}` },
        body: { enabled: next.enabled === true, approved_hash: next.approvedHash },
      });
      return this.get(tenantId, id);
    },
    async recordTest(tenantId, id, result) {
      const current = await this.get(tenantId, id);
      if (!current) return null;
      const body = { last_tested_at: new Date().toISOString() };
      if (result?.ok) {
        body.status = "connected";
        body.last_error = null;
        body.server_info = {
          name: String(result.serverInfo?.name || ""),
          version: String(result.serverInfo?.version || ""),
        };
      } else {
        body.status = result?.code === "unauthorized" ? "needs_auth" : "error";
        body.last_error = connectorMessage(result?.code || "protocol");
      }
      await call("mcp_connectors", { method: "PATCH", query: { id: `eq.${id}`, tenant_id: `eq.${tenantId}` }, body });
      if (result?.ok) return this.upsertTools(tenantId, id, result.tools || []);
      return this.get(tenantId, id);
    },
    async replaceToken(tenantId, id, next) {
      const current = await this.get(tenantId, id);
      if (!current) return null;
      const token = String(next?.token || "");
      if (!token) {
        await call("mcp_connector_secrets", { method: "DELETE", query: { connector_id: `eq.${id}`, tenant_id: `eq.${tenantId}` } });
        await call("mcp_connectors", {
          method: "PATCH",
          query: { id: `eq.${id}`, tenant_id: `eq.${tenantId}` },
          body: { auth_type: "none", headers_public: {}, status: "draft" },
        });
      } else {
        const headerName = validHeaderName(next?.headerName || "Authorization");
        if (!headerName) throw connectorError("invalid-url", "Enter a header name.");
        await writeSecret(tenantId, id, token, headerName);
        await call("mcp_connectors", {
          method: "PATCH",
          query: { id: `eq.${id}`, tenant_id: `eq.${tenantId}` },
          body: {
            auth_type: "bearer",
            headers_public: { header_name: headerName, token_last4: tokenLast4(token) },
            status: "draft",
          },
        });
      }
      return this.get(tenantId, id);
    },
  };
}
