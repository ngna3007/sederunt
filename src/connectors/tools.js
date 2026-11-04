import { createHash } from "node:crypto";

const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const HEADER = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}$/;
const TOOL_NAME = /^[\w.-]{1,128}$/;

/**
 * @param {unknown} value
 */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value ?? null;
}

/**
 * @param {{ name?: string, description?: string, inputSchema?: unknown, annotations?: unknown }} tool
 */
export function definitionHash(tool) {
  const payload = stable({
    name: String(tool?.name || ""),
    description: String(tool?.description || ""),
    inputSchema: tool?.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {},
    annotations: tool?.annotations && typeof tool.annotations === "object" ? tool.annotations : {},
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * destructiveHint wins. Missing annotations fail closed to write.
 *
 * @param {unknown} annotations
 * @returns {"read" | "write" | "delete"}
 */
export function actionClassFromAnnotations(annotations) {
  const notes = annotations && typeof annotations === "object" ? annotations : {};
  if (notes.destructiveHint === true) return "delete";
  if (notes.readOnlyHint === true) return "read";
  return "write";
}

/**
 * @param {string} name
 */
export function slugFromName(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!SLUG.test(slug)) return "";
  return slug;
}

/**
 * @param {string} slug
 * @param {Iterable<string>} taken
 */
export function uniqueSlug(slug, taken) {
  const used = new Set(taken);
  if (!used.has(slug)) return slug;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const next = `${slug.slice(0, 48 - suffix.length)}${suffix}`;
    if (SLUG.test(next) && !used.has(next)) return next;
  }
  return "";
}

/**
 * @param {string} name
 */
export function validHeaderName(name) {
  const header = String(name || "Authorization").trim() || "Authorization";
  if (!HEADER.test(header) || /[\r\n]/.test(header)) return "";
  return header;
}

/**
 * @param {string} name
 */
export function validToolName(name) {
  return TOOL_NAME.test(String(name || ""));
}

/**
 * @param {string} token
 */
export function tokenLast4(token) {
  const text = String(token || "");
  if (!text) return "";
  return text.slice(-4);
}

/**
 * New tools stay off. A hash that differs from the approved hash is changed and disabled.
 *
 * @param {Array<Record<string, unknown>>} existing
 * @param {Array<{ name: string, description?: string, inputSchema?: unknown, annotations?: unknown }>} discovered
 */
export function mergeDiscoveredTools(existing, discovered) {
  const prior = new Map(existing.map((tool) => [String(tool.name), tool]));
  const next = [];
  for (const found of discovered) {
    const name = String(found?.name || "");
    if (!validToolName(name)) continue;
    const description = String(found.description || "").slice(0, 8000);
    const inputSchema = found.inputSchema && typeof found.inputSchema === "object" ? found.inputSchema : { type: "object" };
    const annotations = found.annotations && typeof found.annotations === "object" ? found.annotations : {};
    const hash = definitionHash({ name, description, inputSchema, annotations });
    const actionClass = actionClassFromAnnotations(annotations);
    const old = prior.get(name);
    if (!old) {
      next.push({
        name,
        description,
        inputSchema,
        annotations,
        actionClass,
        enabled: false,
        approvedHash: null,
        definitionHash: hash,
        changed: false,
      });
      continue;
    }
    const same = old.definitionHash === hash;
    const approvedHash = old.approvedHash || null;
    const enabled = same ? old.enabled === true : false;
    next.push({
      name,
      description,
      inputSchema,
      annotations,
      actionClass,
      enabled,
      approvedHash,
      definitionHash: hash,
      changed: Boolean(approvedHash) && approvedHash !== hash,
    });
  }
  return next;
}

/**
 * Enabling pins the current definition. Disabling keeps the pin.
 *
 * @param {Record<string, unknown>} tool
 * @param {boolean} enabled
 */
export function withEnabled(tool, enabled) {
  const on = enabled === true;
  const approvedHash = on ? tool.definitionHash : (tool.approvedHash || null);
  return {
    ...tool,
    enabled: on,
    approvedHash,
    changed: Boolean(approvedHash) && approvedHash !== tool.definitionHash,
  };
}

/**
 * @param {Record<string, unknown>} connector
 * @param {Array<Record<string, unknown>>} tools
 */
export function publicConnector(connector, tools) {
  return {
    id: connector.id,
    slug: connector.slug,
    name: connector.name,
    url: connector.url,
    transport: connector.transport,
    authType: connector.authType,
    status: connector.status,
    enabled: connector.enabled !== false,
    lastTestedAt: connector.lastTestedAt || null,
    lastError: connector.lastError || "",
    serverInfo: connector.serverInfo ? { name: String(connector.serverInfo.name || ""), version: String(connector.serverInfo.version || "") } : null,
    headerName: connector.headerName || "",
    tokenLast4: connector.tokenLast4 || "",
    hasToken: Boolean(connector.hasToken),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema || { type: "object" },
      annotations: tool.annotations || {},
      actionClass: tool.actionClass || "write",
      enabled: tool.enabled === true,
      changed: Boolean(tool.approvedHash) && tool.approvedHash !== tool.definitionHash,
      definitionHash: tool.definitionHash,
    })),
  };
}
