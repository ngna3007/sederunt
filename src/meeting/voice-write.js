import { parseScheduleUtterance, parseWhenAnswer, scheduledVoiceLine as scheduledLine } from "./schedule.js";
export { parseWhenAnswer };

const ROLE_MARK = /(?:^|\n)\s*(?:system|assistant|user|tool)\s*:/gi;
const DESTROY_NAME = /(?:^|__)(?:delete|remove|destroy|drop|revoke|unlink|erase)_/i;
const DESTROY_WORD = /^(?:delete|remove|destroy|drop|revoke|unlink|erase)(?:_|$)/i;

const ALIASES = [
  ["title", "summary", "name", "text", "subject"],
  ["startTime", "start", "start_time", "begin"],
  ["endTime", "end", "end_time"],
  ["timeZone", "timezone", "tz"],
  ["assignee", "owner", "who"],
];

/**
 * A keep that should be stored and not answered: "remember this:", "note that",
 * or "heads up," plus the fact. "Please note the launch" stays a request.
 */
export function isQuietKeep(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/\bremember\s+this\b[:\s,-]+.+/i.test(value)) return true;
  if (/^note\s+that\b[:\s,-]*.{4,}/i.test(stripLead(value))) return true;
  if (/^heads\s*up\b[:\s,-]*.{4,}/i.test(stripLead(value))) return true;
  if (/^fyi\b[:\s,-].{4,}/i.test(stripLead(value))) return true;
  return false;
}

/** The fact without the keep cue, for storage. */
export function stripKeepCue(text) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  value = value.replace(/^((?:hey|hi|ok|okay)[,:\s]+)?(?:adam|maple)\b[,:\s-]*/i, "");
  value = value.replace(/^(?:remember\s+this|note\s+that|heads\s*up|fyi)\b[:\s,-]+/i, "").trim();
  return value;
}

/**
 * A statement that is not a question or a request. Used in a solo call so a
 * fact can be kept without a reply, even while the floor is still open.
 */
export function isDeclarativeFact(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (isQuietKeep(value)) return true;
  if (/\?\s*$/.test(value)) return false;
  if (isScheduleRequest(value)) return false;
  const folded = stripLead(value).toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  if (!folded) return false;
  if (/^(what|when|who|where|why|how|can|could|would|should|do|does|is|are|please|create|remind|recall|tell|file|schedule|book|add|make|open|log)\b/.test(folded)) {
    return false;
  }
  if (/^(hmm+|hm+|uh+|um+|er+|ah+|okay|ok|thanks|thank you|yes|yeah|yep|no|nope)$/.test(folded)) return false;
  return /[a-z]{3,}/i.test(value) && value.split(/\s+/).filter(Boolean).length >= 3;
}

export function isScheduleRequest(text) {
  return parseScheduleUtterance(text) != null;
}

export function isCalendarCreateTool(name) {
  const leaf = toolLeaf(name);
  return leaf === "create_event" || /(?:^|__)google-calendar__create_event$/.test(String(name || ""));
}

export function isLinearCreateTool(name) {
  return name === "act" || name === "linear__create_issue";
}

export function toolLeaf(name) {
  const text = String(name || "");
  const index = text.lastIndexOf("__");
  return index >= 0 ? text.slice(index + 2) : text;
}

export function isDestructiveTool(tool) {
  const name = typeof tool === "string" ? tool : String(tool?.name || "");
  const klass = typeof tool === "object" ? String(tool?.actionClass || "") : "";
  const notes = typeof tool === "object" && tool?.parameters?.annotations
    ? tool.parameters.annotations
    : (typeof tool === "object" ? tool?.annotations : null);
  if (klass === "delete") return true;
  if (notes && notes.destructiveHint === true) return true;
  const leaf = toolLeaf(name);
  return DESTROY_NAME.test(name) || DESTROY_WORD.test(leaf);
}

export function requiredFields(tool) {
  const schema = toolSchema(tool);
  const listed = Array.isArray(schema?.required) ? schema.required : [];
  const names = [];
  for (const raw of listed) {
    const name = String(raw || "").trim();
    if (!name || BLOCKED.has(name)) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const BLOCKED = new Set([
  "memberId", "session", "token", "authorization", "confirmActionId", "confirmed",
  "channel", "channelId", "roomId", "tenantId", "room", "botId", "calendarId",
]);

function toolSchema(tool) {
  if (!tool || typeof tool !== "object") return null;
  const schema = tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
    ? tool.parameters
    : (tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : null);
  return schema;
}

export function fillAliasedArgs(args) {
  const source = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  for (const group of ALIASES) {
    let value = "";
    for (const key of group) {
      const raw = source[key];
      if (typeof raw === "string" && raw.trim()) {
        value = raw.trim();
        break;
      }
    }
    if (!value) continue;
    for (const key of group) {
      if (source[key] == null || source[key] === "") source[key] = value;
    }
  }
  return source;
}

export function missingRequired(tool, args) {
  const source = args && typeof args === "object" ? args : {};
  const missing = [];
  for (const field of requiredFields(tool)) {
    if (!hasValue(source[field])) missing.push(field);
  }
  return missing;
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function fieldDescription(tool, field) {
  const schema = toolSchema(tool);
  const prop = schema?.properties?.[field];
  return typeof prop?.description === "string" ? prop.description.trim() : "";
}

/** One short follow-up from a missing required field. */
export function argQuestion(field, tool) {
  const name = String(field || "").trim();
  const leaf = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  const desc = fieldDescription(tool, name).toLowerCase();
  const hay = `${leaf} ${desc}`;
  if (/\b(when|time|start|end|date|day|schedule)\b/.test(hay) || /^(start|end|starttime|endtime|when|date|day)$/i.test(name)) {
    return "When should it be?";
  }
  if (/\b(who|assignee|owner|attendee|person)\b/.test(hay) || /^(assignee|owner|who|attendees)$/i.test(name)) {
    return "Who should it be?";
  }
  if (/^(title|summary|name|subject|text)$/i.test(name) && isLinearCreateTool(tool?.name || "")) {
    return "What should the issue say?";
  }
  if (/^(title|summary|name|subject|text)$/i.test(name)) return "What should it be called?";
  const label = leaf || "value";
  return `What should the ${label} be?`;
}

export function isArgQuestion(text) {
  const value = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return false;
  return /^(when should it be|who should it be|what should it be called|what should the \w[\w ]{0,40} be)\b/.test(value)
    || /\bwhat should (?:the|this|that) (?:issue|task|ticket) (?:say|be called|be titled)\b/.test(value);
}

export function isWhenQuestion(text) {
  const value = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return value === "when should it be" || /^when should (?:it|that|the meeting|the event) be\b/.test(value);
}

export function isDestroyQuestion(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return /^should i (?:delete|remove|destroy|drop|revoke)\b/i.test(value);
}

export function destroyQuestion(args, name) {
  const title = String(args?.title || args?.summary || args?.name || args?.id || "").replace(/['"]/g, "").replace(/\s+/g, " ").trim();
  if (title) return `Should I delete ${title}?`;
  const leaf = toolLeaf(name).replace(/[_-]+/g, " ");
  return leaf ? `Should I ${leaf}?` : "Should I delete that?";
}

export function yesFromAnswer(text, botName = "Adam") {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  const name = String(botName || "Adam").replace(/[^\p{L}\p{N} ]+/gu, "").trim();
  const names = [name, "adam"].filter(Boolean).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  value = value.replace(new RegExp(`^(?:(?:hey|hi|ok|okay|so)[,\\s]+)?(?:${names.join("|")})\\b[,.:!\\s]*`, "iu"), "");
  if (/^(?:no|nope|nah|cancel|never ?mind|forget (?:it|that)|stop|skip|don'?t|do not)\b/i.test(value)) return false;
  return /^(?:yes|yeah|yep|yup|sure|do it|please do|confirm|ok|okay|go ahead)\b/i.test(value);
}

export const WHEN_QUESTION = "When should it be?";

/**
 * A short confirmation from a tool result. Only id, title, and a safe link
 * are read. The rest of the payload stays untrusted data and is not spoken.
 */
export function filedConfirmation(toolName, result, args = {}) {
  const name = String(toolName || "");
  if (isLinearCreateTool(name) && !isCalendarCreateTool(name)) {
    const title = sanitize(args.title || args.summary || resultTitle(result));
    const id = String(resultId(result, "issue") || "").trim().toUpperCase();
    const key = /^[A-Z][A-Z0-9]{0,9}-\d{1,7}$/.test(id) ? id : "";
    if (key) return title ? `I filed ${key}, '${title}'.` : `I filed ${key}.`;
    if (!title) return "I filed the Linear issue.";
    return `I filed the Linear issue '${title}'.`;
  }
  if (isCalendarCreateTool(name) || (name === "act" && args.startTime)) {
    return scheduledLine({
      title: args.title || args.summary || resultTitle(result) || "the event",
      start: args.startTime || args.start || "",
      now: args.now,
      timeZone: args.timeZone,
    });
  }
  const title = sanitize(resultTitle(result) || args.title || args.summary || args.name || "");
  const id = sanitize(resultId(result, "any"));
  const leaf = toolLeaf(name).replace(/[_-]+/g, " ") || "it";
  if (title && id) return `I ran ${leaf}: '${title}' (${id}).`;
  if (title) return `I ran ${leaf}: '${title}'.`;
  if (id) return `I ran ${leaf} (${id}).`;
  return `I ran ${leaf}.`;
}

export function scheduledVoiceLine(input) {
  return scheduledLine(input);
}

function resultTitle(result) {
  const row = result && typeof result === "object" ? result : {};
  const data = row.data && typeof row.data === "object" ? row.data : row;
  const structured = data.structuredContent && typeof data.structuredContent === "object" ? data.structuredContent : data;
  for (const key of ["title", "summary", "name", "identifier"]) {
    const value = structured[key] || data[key] || row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resultId(result, kind) {
  const row = result && typeof result === "object" ? result : {};
  const data = row.data && typeof row.data === "object" ? row.data : row;
  const structured = data.structuredContent && typeof data.structuredContent === "object" ? data.structuredContent : data;
  const keys = kind === "issue"
    ? ["issueId", "identifier", "id"]
    : ["id", "eventId", "identifier", "issueId"];
  for (const key of keys) {
    const value = row[key] || data[key] || structured[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const link = sanitizeLink(row.link || data.link || structured.link || structured.url || data.url);
  return link;
}

function sanitize(value) {
  return String(value || "")
    .replace(ROLE_MARK, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function sanitizeLink(value) {
  const text = String(value || "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(text)) return "";
  return text.slice(0, 160);
}

function stripLead(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:hey|hi|ok|okay)[,:\s]+)?(?:adam|maple)\b[,:\s-]*/i, "")
    .trim();
}

/**
 * Fill calendar create args from the utterance when the model omitted them.
 * A missing title can come from the sentence. A missing time is left blank
 * so the caller can ask "When should it be?"
 */
export function applyScheduleDefaults(args, utterance, options = {}) {
  const filled = fillAliasedArgs(args);
  const parsed = parseScheduleUtterance(utterance, { now: options.now, timeZone: options.timeZone, env: options.env }) || { title: "", start: "", end: "", timeZone: options.timeZone || "", missing: "when" };
  if (!filled.title && !filled.summary && parsed.title) {
    filled.title = parsed.title;
    filled.summary = parsed.title;
  } else if (filled.title && !filled.summary) filled.summary = filled.title;
  else if (filled.summary && !filled.title) filled.title = filled.summary;
  if (!filled.startTime && !filled.start && parsed.start) {
    filled.startTime = parsed.start;
    filled.start = parsed.start;
  }
  if (!filled.endTime && !filled.end && parsed.end) {
    filled.endTime = parsed.end;
    filled.end = parsed.end;
  }
  if (!filled.timeZone && parsed.timeZone) filled.timeZone = parsed.timeZone;
  return { args: filled, parsed };
}

/** Rank connector tools against the utterance and keep the best under the cap. */
export function pickVoiceTools(builtin, extra, options = {}) {
  const utterance = String(options.utterance || "");
  const allow = options.allow instanceof Set ? options.allow : null;
  const cap = Number.isFinite(options.cap) ? options.cap : (allow ? 16 : 6);
  const reservedNames = new Set(options.reserved || ["linear__create_issue", "linear__update_issue"]);
  const tools = (Array.isArray(builtin) ? builtin : []).map((tool) => ({ ...tool }));
  const reserved = [];
  const rest = [];
  for (const tool of Array.isArray(extra) ? extra : []) {
    const name = typeof tool?.name === "string" ? tool.name : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name) || name === "recall" || name === "act") continue;
    if (allow && !allow.has(name)) continue;
    const row = {
      name,
      description: String(tool.description || ""),
      parameters: tool.parameters || tool.inputSchema || { type: "object" },
      actionClass: tool.actionClass || "",
      annotations: tool.annotations || null,
    };
    if (reservedNames.has(name) || alwaysKeep(name, utterance)) reserved.push(row);
    else rest.push(row);
  }
  rest.sort((left, right) => scoreTool(right, utterance) - scoreTool(left, utterance));
  const room = Math.max(reserved.length, cap);
  const picked = [];
  const seen = new Set();
  for (const row of [...reserved, ...rest]) {
    if (seen.has(row.name) || picked.length >= room) continue;
    seen.add(row.name);
    picked.push(row);
  }
  // A strongly matching tool still enters even if the cap was filled with reserved ones.
  for (const row of rest) {
    if (seen.has(row.name)) continue;
    if (scoreTool(row, utterance) >= 4 && picked.length < room + 2) {
      seen.add(row.name);
      picked.push(row);
    }
  }
  tools.push(...picked);
  return tools;
}

function alwaysKeep(name, utterance) {
  const leaf = toolLeaf(name);
  if (utterance && isScheduleRequest(utterance) && (leaf === "create_event" || leaf === "update_event")) return true;
  if (utterance && /\b(linear|issue|ticket|task)\b/i.test(utterance) && /^(create_issue|update_issue)$/.test(leaf)) return true;
  return false;
}

export function scoreTool(tool, utterance) {
  const text = String(utterance || "").toLowerCase();
  if (!text) return 0;
  const hay = `${tool?.name || ""} ${tool?.description || ""} ${toolLeaf(tool?.name || "")}`.toLowerCase().replace(/[_-]+/g, " ");
  let score = 0;
  const words = text.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word));
  for (const word of words) {
    if (hay.includes(word)) score += 1;
  }
  const leaf = toolLeaf(tool?.name || "");
  if (isScheduleRequest(text) && leaf === "create_event") score += 8;
  if (/\b(linear|issue|ticket|task)\b/i.test(text) && leaf === "create_issue") score += 8;
  if (isDestructiveTool(tool) && /\b(delete|remove)\b/i.test(text)) score += 4;
  return score;
}

const STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "have", "has", "are", "was", "were", "you", "adam", "please", "just"]);

export function kindForField(field) {
  const name = String(field || "").toLowerCase();
  if (/^(start|end|starttime|endtime|when|date|day|time)$/i.test(name.replace(/[_-]/g, ""))) return "when";
  if (/^(title|summary)$/i.test(name) ) return "title";
  return "arg";
}

/** The asker's answer to a generic field question, without a wake word. */
export function argFromAnswer(text, botName = "Adam") {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const name = String(botName || "Adam").replace(/[^\p{L}\p{N} ]+/gu, "").trim();
  const names = [name, "adam"].filter(Boolean).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  value = value.replace(new RegExp(`^(?:(?:hey|hi|ok|okay|so)[,\\s]+)?(?:${names.join("|")})\\b[,.:!\\s]*`, "iu"), "");
  value = value.replace(/^(?:(?:ok|okay|yes|yeah|yep|sure|so|well|um+|uh+|alright|all right)\b[,.!:\s]+)+/i, "");
  if (/\?\s*$/.test(value)) return "";
  value = value.replace(/^(?:it should be|make it|set it(?: to)?|use|call it|the \w+ is)\b[,:\s]*/i, "");
  value = value.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").replace(/[\s.!?,;:]+$/g, "").trim();
  return value.slice(0, 200);
}


export const MEET_CHAT_MAX = 500;

/** A https link from a tool result, or a Linear issue URL when the workspace is known. Never invented. */
export function resultLink(result, options = {}) {
  const row = result && typeof result === "object" ? result : {};
  const data = row.data && typeof row.data === "object" ? row.data : row;
  const structured = data.structuredContent && typeof data.structuredContent === "object" ? data.structuredContent : data;
  for (const value of [row.url, row.link, row.htmlLink, data.url, data.link, data.htmlLink, structured.url, structured.link, structured.htmlLink]) {
    const link = safeHttps(value);
    if (link) return link;
  }
  const id = issueKey(row.issueId || row.identifier || data.identifier || data.issueId || structured.identifier || structured.issueId);
  const workspace = String(options.linearWorkspace || "").trim();
  if (id && workspace && /^[A-Za-z0-9_-]{1,64}$/.test(workspace)) {
    return `https://linear.app/${encodeURIComponent(workspace)}/issue/${id}`;
  }
  return "";
}

/**
 * A short Meet chat line after a successful write. Google Meet caps this at 500
 * characters. Tool-result text is sanitized; only id, title, and a safe link are used.
 */
export function actionChatLine(input = {}) {
  const toolName = String(input.toolName || "");
  const args = input.args && typeof input.args === "object" ? input.args : {};
  const result = input.result && typeof input.result === "object" ? input.result : {};
  const title = sanitizeChat(args.title || args.summary || args.name || resultTitle(result));
  const link = resultLink({ ...result, issueId: result.issueId || result.identifier || result.id }, { linearWorkspace: input.linearWorkspace });
  let body = "";
  if (isLinearCreateTool(toolName) && !isCalendarCreateTool(toolName)) {
    const id = issueKey(resultId(result, "issue") || result.issueId);
    if (id && title) body = `Filed ${id}: ${title}`;
    else if (id) body = `Filed ${id}`;
    else if (title) body = `Filed ${title}`;
    else body = "Filed a Linear issue";
  } else if (isCalendarCreateTool(toolName) || (toolName === "act" && (args.startTime || args.start))) {
    const when = formatChatWhen(args.startTime || args.start || result.start || "", args.timeZone || input.timeZone, input.now);
    const name = title || "the event";
    body = when ? `Scheduled ${name}, ${when}` : `Scheduled ${name}`;
  } else {
    const leaf = toolLeaf(toolName).replace(/[_-]+/g, " ") || "it";
    body = title ? `Ran ${leaf}: ${title}` : `Ran ${leaf}`;
  }
  body = sanitizeChat(body);
  if (!body) return "";
  if (link) {
    const room = MEET_CHAT_MAX - link.length - 1;
    if (room >= 8) body = `${body.slice(0, room)} ${link}`.trim();
  }
  return body.slice(0, MEET_CHAT_MAX);
}

export function formatChatWhen(start, timeZone, now) {
  const zone = String(timeZone || "Asia/Ho_Chi_Minh");
  const ms = Date.parse(String(start || ""));
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  let weekday = "";
  let hour = "";
  let minute = "";
  let abbrev = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).formatToParts(date);
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    weekday = read("weekday");
    hour = read("hour");
    minute = read("minute");
    abbrev = read("timeZoneName");
  } catch {
    return "";
  }
  if (abbrev === "GMT+7" && /Ho_Chi_Minh|Saigon|Bangkok|Jakarta|Phnom_Penh|Vientiane/.test(zone)) abbrev = "ICT";
  if (!weekday || hour === "") return "";
  return `${weekday} ${hour}:${minute || "00"}${abbrev ? ` ${abbrev}` : ""}`;
}

function issueKey(value) {
  const id = String(value || "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,9}-\d{1,7}$/.test(id) ? id : "";
}

function safeHttps(value) {
  const text = String(value || "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(text)) return "";
  if (ROLE_MARK.test(text) || /[\r\n]/.test(text)) return "";
  return text.slice(0, 200);
}

function sanitizeChat(value) {
  return String(value || "")
    .replace(ROLE_MARK, " ")
    .replace(/[`*_#<>\[\]()]/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEET_CHAT_MAX);
}
