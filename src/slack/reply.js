import { looksLikeOpenQuestion } from "../parse.js";

const RECALL = /what was decided|what happened/i;
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

function plainFact(text, connectorId) {
  const sentence = String(text ?? "").trim();
  const issue = typeof connectorId === "string" ? connectorId.trim() : "";
  return issue ? `Decided: ${sentence} (${issue})` : sentence;
}

function questionWords(question) {
  return String(question ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
}

/** A Slack message that should be answered, not stored. */
export function slackQuestion(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  return looksLikeOpenQuestion(trimmed) || RECALL.test(trimmed);
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
  return { name, bytes };
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
