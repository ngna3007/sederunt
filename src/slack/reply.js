import { openRouterComplete, openRouterConfig } from "../openrouter.js";
import { buildSystemPrompt } from "../bot/persona.js";

const STOP = new Set(["what", "about", "that", "this", "with", "from", "your", "have", "does", "file", "when", "where", "who", "why", "how", "was", "decided", "the", "and", "for"]);

/** The file name a question is about, or an empty string. */
export function replyFile(visible, question) {
  const words = questionWords(question);
  if (words.length === 0) return "";
  for (const row of visible ?? []) {
    if (!row?.fileName) continue;
    const hay = `${row.text ?? ""} ${row.fileName}`.toLowerCase();
    if (words.some((word) => hay.includes(word))) return row.fileName;
  }
  return "";
}

/**
 * One plain sentence for each kept decision. A file is named only when the
 * question is about that file. A row with no text is left out.
 */
export function slackAnswer(visible, question) {
  const file = replyFile(visible, question);
  const rows = (visible ?? []).filter((row) => {
    const text = String(row?.text ?? "").trim();
    if (!text) return false;
    if (file) return row?.fileName === file || text.toLowerCase().includes(file.toLowerCase());
    return !row?.fileName;
  });
  if (file) {
    const row = rows.find((item) => item?.fileName === file) ?? rows[0];
    const fact = String(row?.text ?? "").trim();
    if (!fact) return { text: "Nothing is stored that you can read.", file: "" };
    const text = fact.toLowerCase().includes(file.toLowerCase()) ? fact : `${fact}\n${file}`;
    return { text, file };
  }
  if (rows.length === 0) return { text: "Nothing is stored that you can read.", file: "" };
  return {
    text: rows.map((row) => plainFact(row.text, row.connectorId)).join("\n"),
    file: "",
  };
}

/**
 * Slack Q&A, Walrus Memory chatbot shape (see withMemWal docs):
 * remember on the write path already stored decisions; here we recall invite-visible
 * rows, inject the top matches into the prompt, then generate. No auto-save on ask.
 * OpenRouter when OPENROUTER_API_KEY is set; otherwise retrieval-only.
 *
 * @param {unknown} visible
 * @param {string} question
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, botName?: string, maxMemories?: number }} [options]
 */
export async function answerSlackQuestion(visible, question, options = {}) {
  const base = slackAnswer(visible, question);
  const env = options.env ?? process.env;
  const limit = options.maxMemories ?? 5;
  // A stored file is a read. Resend it. Do not ask the model to confirm.
  if (base.file) {
    const recalled = recallVisibleForAsk(visible, question, limit);
    return { ...base, source: "retrieval", recalled: recalled.length };
  }
  let recalled = recallVisibleForAsk(visible, question, limit);
  // withMemWal shape: optional MemWal.recall(query) before generate; invite-visible only.
  if (typeof options.recall === "function") {
    try {
      const hits = await options.recall(String(question ?? "").trim());
      const merged = mergeSemanticVisible(visible, hits, question, limit);
      if (merged.length) recalled = merged;
    } catch {
      // Keep keyword rank when the relayer is down.
    }
  }
  if (!openRouterConfig(env).enabled) {
    return { ...base, source: "retrieval", recalled: recalled.length };
  }
  const facts = recalled.length
    ? recalled.map((row) => plainFact(row.text, row.connectorId)).join("\n")
    : String(base.text || "").trim();
  const system = [
    buildSystemPrompt({ mode: "slack", botName: options.botName || "" }),
    "Walrus Memory recall ran before this reply. Only answer from the memories below.",
    "Do not invent facts. Do not store anything from this question.",
    "Resending or sharing a stored file is not a write and must not ask for confirmation.",
    "If nothing applies, say exactly: Nothing is stored that you can read.",
    "Lead with the answer. Keep it short.",
    "",
    "Relevant memories:",
    facts || "(none)",
  ].join("\n");
  const completed = await openRouterComplete({
    env,
    system,
    messages: [{ role: "user", content: String(question ?? "").trim() || "What was decided?" }],
    fetchImpl: options.fetchImpl,
  });
  if (!completed.used || !completed.text) {
    return { ...base, source: "retrieval", recalled: recalled.length };
  }
  return { text: completed.text, file: base.file, source: "openrouter", recalled: recalled.length };
}

/**
 * Rank invite-visible decisions for the question (withMemWal-style maxMemories).
 * File questions stay pinned to the matching file row.
 */
export function recallVisibleForAsk(visible, question, maxMemories = 5) {
  const limit = Math.max(1, Math.min(Number(maxMemories) || 5, 20));
  const file = replyFile(visible, question);
  const rows = (visible ?? []).filter((row) => {
    const text = String(row?.text ?? "").trim();
    if (!text) return false;
    if (file) return row?.fileName === file || text.toLowerCase().includes(file.toLowerCase());
    return !row?.fileName;
  });
  if (file) {
    const row = rows.find((item) => item?.fileName === file) ?? rows[0];
    return row ? [row] : [];
  }
  const words = questionWords(question);
  const scored = rows.map((row) => {
    const hay = String(row?.text ?? "").toLowerCase();
    const hits = words.reduce((n, word) => n + (hay.includes(word) ? 1 : 0), 0);
    return { row, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((item) => item.hits > 0).map((item) => item.row);
  const picked = matched.length ? matched : scored.map((item) => item.row);
  return picked.slice(0, limit);
}

/**
 * Prefer invite-visible rows that MemWal.recall ranked (low distance first).
 * Falls back to keyword rank so Slack never answers outside the invite set.
 */
export function mergeSemanticVisible(visible, hits, question, maxMemories = 5) {
  const limit = Math.max(1, Math.min(Number(maxMemories) || 5, 20));
  // Invite set first (file-scoped when needed); semantic order is applied next.
  const file = replyFile(visible, question);
  const invite = (visible ?? []).filter((row) => {
    const text = String(row?.text ?? "").trim();
    if (!text) return false;
    if (file) return row?.fileName === file || text.toLowerCase().includes(file.toLowerCase());
    return !row?.fileName;
  });
  if (!invite.length) return [];
  const byId = new Map();
  const byText = new Map();
  for (const row of invite) {
    if (row?.id) byId.set(String(row.id), row);
    const key = String(row?.text ?? "").trim().toLowerCase();
    if (key) byText.set(key, row);
  }
  const ordered = [];
  const seen = new Set();
  const list = Array.isArray(hits) ? hits : [];
  const ranked = [...list].sort((a, b) => {
    const da = typeof a?.distance === "number" ? a.distance : 1;
    const db = typeof b?.distance === "number" ? b.distance : 1;
    return da - db;
  });
  for (const hit of ranked) {
    const id = hit?.decision?.id || hit?.id || "";
    const text = String(hit?.decision?.text ?? hit?.text ?? "").trim().toLowerCase();
    const row = (id && byId.get(String(id))) || (text && byText.get(text)) || null;
    if (!row) continue;
    const key = row.id || row.text;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(row);
    if (ordered.length >= limit) return ordered;
  }
  const fallback = recallVisibleForAsk(invite, question, limit);
  for (const row of fallback) {
    const key = row.id || row.text;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(row);
    if (ordered.length >= limit) break;
  }
  return ordered;
}


function plainFact(text, connectorId) {
  const sentence = String(text ?? "").trim();
  const issue = typeof connectorId === "string" ? connectorId.trim() : "";
  return issue ? `Decided: ${sentence} (${issue})` : sentence;
}

function questionWords(question) {
  return String(question ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
}

/**
 * Post one answer into the channel or direct message that asked.
 * A file is uploaded to that conversation. The token stays with the caller.
 *
 * @param {{ token?: string, fetchImpl?: typeof fetch, channel?: string, text?: string, thread?: string, file?: { name?: string, bytes?: string } }} input
 */
export async function postSlackReply(input) {
  const token = input.token;
  const channel = input.channel;
  const text = input.text;
  if (!token || !channel || !text) return { posted: false, file: "" };
  const fetchImpl = input.fetchImpl || fetch;
  const file = input.file;
  if (file?.name && file.bytes != null) {
    return postSlackFile({ token, channel, text, thread: input.thread, file, fetchImpl });
  }
  const speaker = typeof input.username === "string" ? input.username.trim() : "";
  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: input.thread || undefined,
      ...(speaker ? { username: speaker } : {}),
    }),
  });
  return { posted: response.ok, file: "" };
}

/** People Slack currently lists in the channel. An empty list means the platform did not say. */
export async function slackChannelMembers({ token, channel, fetchImpl }) {
  if (!token || !channel) return [];
  const fetchFn = fetchImpl || fetch;
  const members = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://slack.com/api/conversations.members");
    url.searchParams.set("channel", channel);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchFn(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!body?.ok || !Array.isArray(body.members)) return [];
    members.push(...body.members.filter((id) => typeof id === "string" && id));
    cursor = typeof body.response_metadata?.next_cursor === "string" ? body.response_metadata.next_cursor : "";
    if (!cursor) break;
  }
  return members;
}

/**
 * Bytes of one Slack file. A file id is resolved through files.info.
 * A Slack download often redirects to a signed URL, so the redirect is followed.
 */
export async function slackFileBytes({ token, file, fetchImpl }) {
  if (!token || !file?.name && !file?.id) return null;
  const fetchFn = fetchImpl || fetch;
  let name = file?.name || "";
  let url = slackFileUrl(file?.url);
  if (!url && file?.id) {
    const info = await slackForm(fetchFn, token, "files.info", { file: file.id });
    const found = info?.file;
    if (!found) return null;
    if (!name && typeof found.name === "string") name = found.name;
    url = slackFileUrl(found.url_private_download || found.url_private || "");
  }
  if (!name || !url) return null;
  const bytes = await slackDownload(fetchFn, token, url);
  if (!bytes) return null;
  return { name, bytes, id: typeof file?.id === "string" ? file.id : "" };
}

async function slackDownload(fetchFn, token, url, hops = 0) {
  if (!url || hops > 3) return "";
  const response = await fetchFn(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "manual",
  });
  const status = Number(response?.status || 0);
  if (status >= 300 && status < 400) {
    const location = typeof response.headers?.get === "function" ? response.headers.get("location") : "";
    if (!location) return "";
    if (slackFileUrl(location)) return slackDownload(fetchFn, token, location, hops + 1);
    if (!location.startsWith("https://")) return "";
    const followed = await fetchFn(location);
    if (!followed?.ok) return "";
    return typeof followed.text === "function" ? await followed.text() : "";
  }
  if (response?.ok === false || (status && status >= 400)) return "";
  return typeof response?.text === "function" ? await response.text() : "";
}

async function postSlackFile({ token, channel, text, thread, file, fetchImpl }) {
  const bytes = String(file.bytes);
  const opened = await slackForm(fetchImpl, token, "files.getUploadURLExternal", {
    filename: file.name,
    length: Buffer.byteLength(bytes),
  });
  const uploadUrl = slackUploadUrl(opened?.upload_url);
  if (!opened?.ok || !uploadUrl || !opened.file_id) return { posted: false, file: "" };
  const uploaded = await fetchImpl(uploadUrl, { method: "POST", body: bytes });
  if (!uploaded.ok) return { posted: false, file: "" };
  const done = await slackJson(fetchImpl, token, "files.completeUploadExternal", {
    files: [{ id: opened.file_id, title: file.name }],
    channel_id: channel,
    initial_comment: text,
    thread_ts: thread || undefined,
  });
  return { posted: Boolean(done?.ok), file: file.name };
}

async function slackForm(fetchImpl, token, method, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    body.set(key, String(value));
  }
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  return response.json();
}

async function slackJson(fetchImpl, token, method, payload) {
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function slackFileUrl(value) {
  return slackHostUrl(value, (host) => host === "files.slack.com" || host.endsWith(".slack.com"));
}

function slackUploadUrl(value) {
  return slackHostUrl(value, (host) => host === "files.slack.com");
}

function slackHostUrl(value, allow) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (!allow(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}
