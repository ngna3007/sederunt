import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { requestOrigin } from "../identity/routes.js";
import { sederuntMark, FAVICON_LINK } from "../sederunt-mark.js";
import { createFormsService, formsFakeEnabled } from "./api.js";
import { runWithFormsContext } from "./context.js";
import { createFormsMcpServer } from "./server.js";

const FAKE_FORM = /^\/forms\/fake\/([A-Za-z0-9_-]+)\/viewform$/;

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   origin?: string,
 * }} [options]
 */
export function createFormsApp(options = {}) {
  const env = options.env || process.env;
  const fake = formsFakeEnabled(env);
  const service = createFormsService({
    fake,
    fetchImpl: options.fetchImpl,
    origin: options.origin || "http://127.0.0.1",
  });
  return { env, fake, service };
}

/**
 * @param {unknown} value
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TYPE_LABEL = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  scale: "Scale",
  date: "Date",
};

/**
 * Offline preview. The page scrolls on its own so the console shell's
 * overflow rule does not clip it.
 *
 * @param {Record<string, unknown> | null} form
 */
export function renderFakeFormPage(form) {
  const title = form ? escapeHtml(form.title) : "Form";
  const description = form && form.description ? `<p class="lede">${escapeHtml(form.description)}</p>` : "";
  const questions = form && Array.isArray(form.questions)
    ? form.questions.map((question, index) => {
      const label = TYPE_LABEL[question.type] || "Question";
      return `<li><p class="q-title">${index + 1}. ${escapeHtml(question.title)}</p><p class="q-type">${escapeHtml(label)}${question.required ? " · Required" : ""}</p></li>`;
    }).join("")
    : "";
  const body = form
    ? `${description}<ol class="questions">${questions}</ol><p class="note">${form.published ? "This form is published on this server." : "This form is not published yet."}</p>`
    : `<p class="note">That form was not found.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${FAVICON_LINK}
<style>
  :root {
    color-scheme: light;
    --background: #f7f8fb;
    --foreground: #171a24;
    --card: #ffffff;
    --muted-foreground: #5e636f;
    --border: #dce0e6;
    --primary: #2458f6;
    --font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body.forms-preview {
    margin: 0;
    height: auto;
    min-height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.45;
  }
  .wrap { width: min(640px, 100%); margin: 0 auto; padding: 32px 20px 64px; }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  header .brand-word { font-weight: 600; }
  h1, p, li { overflow-wrap: anywhere; }
  h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
  .lede, .note, .q-type { color: var(--muted-foreground); }
  .questions { margin: 20px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
  .questions li { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .q-title { margin: 0 0 4px; font-weight: 600; }
  .q-type, .note, .lede { margin: 0; }
  .note { margin-top: 8px; }
  a { color: var(--primary); }
</style>
</head>
<body class="forms-preview">
  <div class="wrap">
    <header>${sederuntMark({ size: 28 })}<span class="brand-word">Sederunt</span></header>
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function bearerToken(req) {
  const header = req.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : String(header || "");
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : "";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {URL} url
 */
async function nodeToWebRequest(req, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  const method = req.method || "GET";
  const absolute = new URL(url.pathname + url.search, "http://127.0.0.1");
  if (method === "GET" || method === "HEAD") return new Request(absolute, { method, headers });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new Request(absolute, { method, headers, body: Buffer.concat(chunks) });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {Response} response
 */
async function writeWebResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key === "transfer-encoding" || key === "content-encoding" || key === "content-length") return;
    headers[key] = value;
  });
  const body = Buffer.from(await response.arrayBuffer());
  headers["content-length"] = String(body.length);
  res.writeHead(response.status, headers);
  res.end(body);
}

/**
 * Mounted at /mcp/forms and /forms/fake/:id/viewform.
 * Returns true when this path belongs to Forms, including a 404 preview.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ forms: ReturnType<typeof createFormsApp>, env: NodeJS.ProcessEnv | Record<string, string | undefined>, url: URL }} ctx
 */
export async function handleNodeForms(req, res, ctx) {
  const { forms, env, url } = ctx;
  if (!forms) return false;
  const preview = FAKE_FORM.exec(url.pathname);
  if (req.method === "GET" && preview) {
    if (!forms.fake) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Not found");
      return true;
    }
    const record = forms.service.store?.get(preview[1]) || null;
    const status = record ? 200 : 404;
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(renderFakeFormPage(record));
    return true;
  }
  if (url.pathname !== "/mcp/forms" && url.pathname !== "/mcp/forms/") return false;

  const token = bearerToken(req);
  const origin = requestOrigin(req, env);
  const server = createFormsMcpServer(forms.service);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    keepAliveMs: 0,
  });
  try {
    await server.connect(transport);
    const webRequest = await nodeToWebRequest(req, url);
    const response = await runWithFormsContext({ token, origin }, () => transport.handleRequest(webRequest));
    await writeWebResponse(res, response);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
  return true;
}
