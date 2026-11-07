import { openRouterComplete, openRouterConfig } from "../openrouter.js";
import { buildSlackAskPrompt } from "../bot/persona.js";
import { checkInvite } from "../domain/invite.js";

const STOP = new Set(["what", "about", "that", "this", "with", "from", "your", "have", "does", "file", "when", "where", "who", "why", "how", "was", "decided", "the", "and", "for"]);

/**
 * Fallback only, for when the model is down: a stored file the question
 * names, by its exact name or its name said as words. It reads stored file
 * names, not question patterns.
 */
export function replyFile(visible, question) {
  return findReplyFile(visible, question)?.name || "";
}

/**
 * Invite-visible stored files. Used so attach selection can read session
 * fileNames (and Slack file ids) even when a visible row hid them.
 */
export function invitedFileRows(decisions, memberId) {
  const member = typeof memberId === "string" ? memberId.trim() : "";
  const rows = [];
  for (const row of decisions ?? []) {
    if (!row || row.deleted === true) continue;
    if (member) {
      const invite = Array.isArray(row.inviteMemberIds) ? row.inviteMemberIds : [];
      if (invite.length && !invite.includes(member)) continue;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Visible rows plus recall hits the asker is invited to. A stale isolate
 * may omit a freshly kept file from session.visible; the hit still has
 * fileNames and slackFileId.
 */
export function fileCatalog(visible, hits, memberId) {
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    if (!row || typeof row !== "object") return;
    const names = rowFileNames(row);
    const key = `${String(row.id || "")}:${names.map((name) => name.toLowerCase()).join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const row of visible ?? []) add(row);
  const member = typeof memberId === "string" ? memberId.trim() : "";
  for (const hit of hits ?? []) {
    const decision = hit?.decision && typeof hit.decision === "object" ? hit.decision : hit;
    if (!decision || typeof decision !== "object") continue;
    if (member) {
      const invite = Array.isArray(decision.inviteMemberIds) ? decision.inviteMemberIds : [];
      if (!invite.length || !invite.includes(member)) continue;
    }
    add(decision);
  }
  return rows;
}

/** The stored file the question names, with any Slack/Console ids on that row. */
export function findReplyFile(visible, question) {
  const asked = String(question ?? "").toLowerCase();
  if (!asked) return null;
  const spaced = ` ${spacedWords(asked)} `;
  let best = "";
  for (const row of visible ?? []) {
    for (const name of rowFileNames(row)) {
      if (fileNameSaid(name, asked, spaced) && name.length > best.length) best = name;
    }
  }
  return best ? fileMeta(visible, best) : null;
}

export function fileMeta(catalog, name) {
  const wanted = String(name || "").trim();
  if (!wanted) return null;
  const key = wanted.toLowerCase();
  for (const row of catalog ?? []) {
    if (Array.isArray(row?.fileNames)) {
      for (const item of row.fileNames) {
        if (typeof item === "string") {
          if (item.trim().toLowerCase() === key) {
            return {
              name: item.trim(),
              slackFileId: typeof row.slackFileId === "string" ? row.slackFileId : "",
              consoleFileId: row.consoleFileId ?? null,
              folderId: row.folderId ?? null,
            };
          }
        } else if (item && typeof item.name === "string" && item.name.trim().toLowerCase() === key) {
          return {
            name: item.name.trim(),
            slackFileId: typeof item.slackFileId === "string" ? item.slackFileId : "",
            consoleFileId: item.consoleFileId ?? null,
            folderId: item.folderId ?? null,
          };
        }
      }
    }
    if (typeof row?.fileName === "string" && row.fileName.trim().toLowerCase() === key) {
      return {
        name: row.fileName.trim(),
        slackFileId: typeof row.slackFileId === "string" ? row.slackFileId : "",
        consoleFileId: row.consoleFileId ?? null,
        folderId: row.folderId ?? null,
      };
    }
  }
  return { name: wanted, slackFileId: "", consoleFileId: null, folderId: null };
}

/** Stored file names on a visible row: fileNames[], then fileName. */
export function rowFileNames(row) {
  const names = [];
  const seen = new Set();
  const push = (value) => {
    const name = typeof value === "string" ? value.trim() : (value && typeof value.name === "string" ? value.name.trim() : "");
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  if (Array.isArray(row?.fileNames)) {
    for (const item of row.fileNames) push(item);
  }
  push(row?.fileName);
  return names;
}

function fileNameSaid(name, asked, spaced) {
  const lower = name.toLowerCase();
  if (asked.includes(lower)) {
    // "../demo-note.txt" must not count as naming demo-note.txt.
    if (asked.includes(`/${lower}`) || asked.includes(`\\${lower}`)) return false;
    return true;
  }
  const dot = name.lastIndexOf(".");
  const stem = spacedWords((dot > 0 ? name.slice(0, dot) : name).toLowerCase());
  if (stem.length < 3) return false;
  // The full stem as words ("floor plan" for floor-plan.pdf), or a
  // distinctive suffix ("floor brief" for northline-d7-floor-brief.txt).
  if (spaced.includes(` ${stem} `)) return true;
  const words = stem.split(" ").filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const part = words.slice(i).join(" ");
    if (part.length >= 8 && spaced.includes(` ${part} `)) return true;
  }
  return false;
}

function rowHasFile(row, name) {
  if (!name) return false;
  const wanted = name.toLowerCase();
  return rowFileNames(row).some((item) => item.toLowerCase() === wanted);
}

/** Lowercase words joined by one space; punctuation and separators become spaces. */
function spacedWords(text) {
  let out = "";
  for (const char of String(text)) {
    const word = (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char.charCodeAt(0) > 127;
    out += word ? char : " ";
  }
  return out.split(" ").filter(Boolean).join(" ");
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
    if (file) return rowHasFile(row, file) || text.toLowerCase().includes(file.toLowerCase());
    return rowFileNames(row).length === 0;
  });
  if (file) {
    const row = rows.find((item) => rowHasFile(item, file)) ?? rows[0];
    const fact = String(row?.text ?? "").trim();
    if (!fact) return { text: slackFileCaption(file), file };
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
 * Slack ask (DM or @mention). The model reads the message and the
 * invite-visible memories and answers naturally. It returns
 * {"text","attach"}; attach is honored only when it is a listed stored file.
 * With no key, or when every model fails, a short retrieval answer is used.
 *
 * @param {unknown} visible
 * @param {string} question
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, botName?: string, maxMemories?: number, recall?: (query: string) => Promise<unknown>, preferences?: object | null }} [options]
 * @returns {Promise<{ text: string, file: string, source: "openrouter" | "retrieval", recalled: number }>}
 */

/**
 * Recent Slack turns for the ask model, oldest first. Bot lines become
 * assistant; people become user. The current event ts is left out so it
 * is not duplicated as the latest user turn.
 *
 * @param {{ token?: string, channel?: string, fetchImpl?: typeof fetch, limit?: number, excludeTs?: string }} [input]
 * @returns {Promise<Array<{ role: "user" | "assistant", content: string }>>}
 */
export async function slackRecentTurns(input = {}) {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const channel = typeof input.channel === "string" ? input.channel.trim() : "";
  if (!token || !channel) return [];
  const fetchFn = input.fetchImpl || fetch;
  const limit = Math.max(1, Math.min(Number(input.limit) || 6, 20));
  const exclude = typeof input.excludeTs === "string" ? input.excludeTs.trim() : "";
  try {
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", channel);
    url.searchParams.set("limit", String(limit));
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const body = await response.json();
    if (body?.ok !== true || !Array.isArray(body.messages)) return [];
    const turns = [];
    for (const message of [...body.messages].reverse()) {
      if (!message || typeof message !== "object") continue;
      if (exclude && String(message.ts || "") === exclude) continue;
      if (message.subtype && message.subtype !== "bot_message" && message.subtype !== "file_share") continue;
      const text = String(message.text || "").trim();
      if (!text) continue;
      const bot = Boolean(message.bot_id) || message.subtype === "bot_message";
      turns.push({ role: bot ? "assistant" : "user", content: text });
    }
    return turns;
  } catch {
    return [];
  }
}

export async function answerSlackQuestion(visible, question, options = {}) {
  const env = options.env ?? process.env;
  const asked = String(question ?? "").trim();
  const limit = Math.max(1, Math.min(Number(options.maxMemories) || 20, 50));
  const rows = (Array.isArray(visible) ? visible : []).filter((row) =>
    String(row?.text ?? "").trim() || rowFileNames(row).length > 0);
  let hits = null;
  if (typeof options.recall === "function" && asked) {
    try {
      hits = await options.recall(asked);
    } catch {
      hits = null;
    }
  }
  const memories = askMemories(rows, hits, limit);
  const fallback = () => ({ ...slackAnswer(rows, asked), source: "retrieval", recalled: memories.length });
  if (!openRouterConfig(env).enabled) return fallback();
  const prior = Array.isArray(options.history) ? options.history : await slackRecentTurns({
    token: options.token || env.SLACK_BOT_TOKEN,
    channel: options.channel,
    fetchImpl: options.fetchImpl,
    limit: options.historyLimit || 6,
    excludeTs: options.excludeTs,
  });
  const messages = [
    ...prior.filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && String(turn.content || "").trim()),
    { role: "user", content: asked || "Hi" },
  ];
  const completed = await openRouterComplete({
    env,
    system: buildSlackAskPrompt({ botName: options.botName || "", preferences: options.preferences ?? null, memories }),
    messages,
    fetchImpl: options.fetchImpl,
  });
  if (!completed.used || !completed.text) return fallback();
  const reply = readAskReply(completed.text);
  // Question-named files win over the model's attach so "District 7 floor
  // brief" picks northline-d7-floor-brief.txt, not a leftover floor-plan.txt.
  // Session-visible rows plus invite-checked recall hits. A warm isolate
  // that indexed before the keep may omit northline-d7-floor-brief.txt
  // from visible while recall(question) still returns it with slackFileId.
  const catalog = fileCatalog(rows, hits, options.memberId);
  const picked = findReplyFile(catalog, asked);
  const attached = picked?.name || listedFile(memories, reply.attach) || mentionedFile(memories, reply.text);
  if (!reply.text && !attached) return fallback();
  return {
    text: prepareSlackCaption(reply.text, attached),
    file: attached,
    fileMeta: picked && picked.name === attached ? picked : fileMeta(catalog, attached),
    source: "openrouter",
    recalled: memories.length,
  };
}

/**
 * Memories for the ask prompt. MemWal hits (inside the invite set) come first
 * and narrow the facts; every stored file stays listed so the model can attach it.
 * With no hits, every invite-visible row is listed, up to the cap.
 */
export function askMemories(rows, hits, limit = 20) {
  const list = Array.isArray(rows) ? rows : [];
  const ranked = Array.isArray(hits) ? [...hits].sort((a, b) => {
    const da = typeof a?.distance === "number" ? a.distance : 1;
    const db = typeof b?.distance === "number" ? b.distance : 1;
    return da - db;
  }) : [];
  const picked = [];
  const seen = new Set();
  const add = (row) => {
    if (!row || seen.has(row) || picked.length >= limit) return;
    seen.add(row);
    picked.push(row);
  };
  for (const hit of ranked) {
    const id = String(hit?.decision?.id || hit?.id || "");
    const text = String(hit?.decision?.text ?? hit?.text ?? "").trim().toLowerCase();
    add(list.find((row) => (id && String(row?.id || "") === id) || (text && String(row?.text ?? "").trim().toLowerCase() === text)));
  }
  if (picked.length) {
    for (const row of list) if (rowFileNames(row).length) add(row);
    return picked;
  }
  for (const row of list) add(row);
  return picked;
}

const EMPTY_ASK_FALLBACK = /^(?:nothing(?: is)? stored(?: that you can read)?(?: about that)?|nothing stored matches that|there are no notes yet)\.?$/i;
const ATTACH_FRAGMENT = /(?:^|[,{])\s*"attach"\s*:\s*(?:"([^"]*)"|null)\s*\}?\s*$/i;

/** Parse the model's {"text","attach"} reply. Plain prose is the text with no attach. */
export function readAskReply(raw) {
  const body = String(raw ?? "").trim();
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  if (open !== -1 && close > open) {
    try {
      const parsed = JSON.parse(body.slice(open, close + 1));
      if (parsed && typeof parsed === "object") {
        const attach = typeof parsed.attach === "string" && parsed.attach.trim() ? parsed.attach.trim() : null;
        if (typeof parsed.text === "string") {
          return { text: scrubSlackCaption(parsed.text), attach };
        }
        const prefix = scrubSlackCaption(body.slice(0, open));
        if (prefix) return { text: prefix, attach };
      }
    } catch {
      // Broken JSON. Split a trailing attach fragment from the prose.
    }
  }
  const fragment = body.match(ATTACH_FRAGMENT);
  if (fragment) {
    const attach = fragment[1] && fragment[1].trim() ? fragment[1].trim() : null;
    return { text: scrubSlackCaption(body.slice(0, fragment.index)), attach };
  }
  return { text: scrubSlackCaption(body), attach: null };
}

/** Drop leaked {"text","attach"} fragments so they never land in Slack. */
export function scrubSlackCaption(text) {
  let out = String(text ?? "").trim();
  if (!out) return "";
  out = out.replace(ATTACH_FRAGMENT, "").trim();
  out = out.replace(/^\{?\s*"text"\s*:\s*"?/i, "");
  out = out.replace(/"\s*\}?\s*$/, "");
  out = out.replace(/[,{\s]+$/, "");
  return out.trim();
}

function isEmptyAskFallback(text) {
  const line = String(text ?? "").trim();
  if (!line) return true;
  return EMPTY_ASK_FALLBACK.test(line);
}

/** A short natural caption for a pinned file, e.g. northline-d7-floor-brief.txt. */
export function slackFileCaption(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Here's the file.";
  const dot = raw.lastIndexOf(".");
  const stem = (dot > 0 ? raw.slice(0, dot) : raw);
  const label = stem.split(/[-_]+/).filter(Boolean)
    .filter((word) => !/^northline$/i.test(word))
    .map((word) => {
      const district = word.match(/^d(\d+)$/i);
      if (district) return `District ${district[1]}`;
      return word.toLowerCase();
    })
    .join(" ")
    .trim();
  if (!label) return `Here's ${raw}.`;
  return `Here's the ${label}.`;
}

/**
 * Caption posted with a Slack ask reply. Strips leaked attach JSON. When a
 * file was pinned, never leave the "Nothing is stored..." persona fallback.
 */
export function prepareSlackCaption(text, file) {
  const caption = scrubSlackCaption(text);
  const name = typeof file === "string" ? file.trim() : "";
  if (name && isEmptyAskFallback(caption)) return slackFileCaption(name);
  return caption;
}

/** The stored name of a listed file, or "" when the model named anything else. */
function listedFile(memories, attach) {
  if (!attach) return "";
  const wanted = attach.toLowerCase();
  for (const row of memories ?? []) {
    const name = rowFileNames(row).find((item) => item.toLowerCase() === wanted);
    if (name) return name;
  }
  return "";
}

/**
 * A listed file the reply text already names. Longest match wins so
 * "demo-note.txt" beats "note.txt". Used when the model forgot attach.
 */
export function mentionedFile(memories, text) {
  const hay = String(text ?? "").toLowerCase();
  if (!hay) return "";
  let best = "";
  for (const row of memories ?? []) {
    for (const name of rowFileNames(row)) {
      if (hay.includes(name.toLowerCase()) && name.length > best.length) best = name;
    }
  }
  return best;
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
    if (file) return rowHasFile(row, file) || text.toLowerCase().includes(file.toLowerCase());
    return rowFileNames(row).length === 0;
  });
  if (file) {
    const row = rows.find((item) => rowHasFile(item, file)) ?? rows[0];
    return row ? [row] : [];
  }
  const scored = rows.map((row) => ({ row, hits: askHits(row, question) }));
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((item) => item.hits > 0).map((item) => item.row);
  const picked = matched.length ? matched : scored.map((item) => item.row);
  return picked.slice(0, limit);
}

/**
 * Prefer invite-visible rows that MemWal.recall ranked (low distance first).
 * Falls back to keyword rank so Slack never answers outside the invite set.
 */
export function mergeSemanticVisible(visible, hits, question, maxMemories = 5, memberId = "") {
  const limit = Math.max(1, Math.min(Number(maxMemories) || 5, 20));
  // Invite set first (file-scoped when needed); semantic order is applied next.
  const file = replyFile(visible, question);
  const invite = (visible ?? []).filter((row) => {
    const text = String(row?.text ?? "").trim();
    if (!text) return false;
    if (file) return rowHasFile(row, file) || text.toLowerCase().includes(file.toLowerCase());
    return rowFileNames(row).length === 0;
  });
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
  const member = String(memberId || "").trim();
  for (const hit of ranked) {
    const id = hit?.decision?.id || hit?.id || "";
    const text = String(hit?.decision?.text ?? hit?.text ?? "").trim();
    let row = (id && byId.get(String(id))) || (text && byText.get(text.toLowerCase())) || null;
    // Index is incomplete (mark-topK). Admit a semantic hit when the asker is on its invite.
    if (!row && member && text && checkInvite(member, hit?.decision?.inviteMemberIds).ok) {
      if (file) {
        const names = Array.isArray(hit?.decision?.fileNames) ? hit.decision.fileNames : [];
        const has = names.some((f) => String(f?.name || f || "").toLowerCase() === file.toLowerCase())
          || text.toLowerCase().includes(file.toLowerCase());
        if (!has && names.length) continue;
      } else if (Array.isArray(hit?.decision?.fileNames) && hit.decision.fileNames.length) {
        continue;
      }
      row = {
        id: typeof hit?.decision?.id === "string" ? hit.decision.id : id || "",
        text,
        roomId: typeof hit?.decision?.roomId === "string" ? hit.decision.roomId : "",
        spokenAt: typeof hit?.decision?.spokenAt === "string" ? hit.decision.spokenAt : "",
        speaker: typeof hit?.decision?.speakerMemberId === "string" ? hit.decision.speakerMemberId : "",
        inviteMemberIds: Array.isArray(hit?.decision?.inviteMemberIds) ? hit.decision.inviteMemberIds : [],
        fileNames: Array.isArray(hit?.decision?.fileNames) ? hit.decision.fileNames : [],
      };
    }
    if (!row) continue;
    const key = row.id || row.text;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(row);
  }
  if (invite.length) {
    const fallback = recallVisibleForAsk(invite, question, limit);
    for (const row of fallback) {
      const key = row.id || row.text;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(row);
    }
  }
  return finalizeAskRecall(ordered, question, limit);
}


function plainFact(text, connectorId) {
  const sentence = String(text ?? "").trim();
  const issue = typeof connectorId === "string" ? connectorId.trim() : "";
  return issue ? `Decided: ${sentence} (${issue})` : sentence;
}

function questionWords(question) {
  return String(question ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
}

const SCHEDULE_QUESTION = /\b(gate|schedule|dates?|billing|slip(?:ped)?|november|december|january|february|march|april|june|july|august|september|october)\b/i;
const SCHEDULE_KEEP = /\b(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|billing|slip(?:ped)?|launch\s+gate|schedule)\b/i;
const UNLOCK_CODE = /\b(?:maple\d+|cedar[\s-]?\d+|unlock(?:\s+code)?|launch\s+code)\b/i;

/** Gate / schedule / date questions should prefer calendar keeps, not unlock phrases. */
function isScheduleQuestion(question) {
  return SCHEDULE_QUESTION.test(String(question ?? ""));
}

function isScheduleKeep(text) {
  return SCHEDULE_KEEP.test(String(text ?? ""));
}

function isUnlockCodeMemory(text) {
  const value = String(text ?? "");
  if (isScheduleKeep(value)) return false;
  return UNLOCK_CODE.test(value);
}

function askHits(row, question) {
  const hay = String(row?.text ?? "").toLowerCase();
  const words = questionWords(question);
  let hits = words.reduce((n, word) => n + (hay.includes(word) ? 1 : 0), 0);
  if (isScheduleQuestion(question)) {
    if (isScheduleKeep(row?.text)) hits += 10;
    if (isUnlockCodeMemory(row?.text)) hits -= 10;
  }
  return hits;
}

function finalizeAskRecall(rows, question, limit) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (isScheduleQuestion(question)) {
    list.sort((a, b) => askHits(b, question) - askHits(a, question));
  }
  return list.slice(0, limit);
}


const askClaims = new Set();

/**
 * Win the right to post one Slack ask reply for this delivery.
 * Process memory covers same-isolate retries; Upstash/KV SET NX covers
 * another Vercel isolate that receives Slack's 3s retry.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} deliveryId
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>} true when this caller should post
 */
export async function claimSlackAsk(env = process.env, deliveryId = "", fetchImpl = fetch, kind = "ask") {
  const id = String(deliveryId || "").trim();
  if (!id) return true;
  const prefix = kind === "keep" ? "keep" : "ask";
  const key = `sederunt:slack:${prefix}:${id}`;
  if (askClaims.has(key)) return false;
  askClaims.add(key);
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  if (url && token) {
    try {
      const response = await (fetchImpl || fetch)(`${url}/set/${encodeURIComponent(key)}/1?NX=true&EX=600`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) return true;
      const body = await response.json().catch(() => null);
      // Upstash REST SET NX returns result null when the key already exists.
      if (body && Object.prototype.hasOwnProperty.call(body, "result") && body.result == null) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }
  const redisUrl = String(env.REDIS_URL || env.KV_URL || "").trim();
  if (!redisUrl) return true;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
    client.on("error", () => {});
    await client.connect();
    try {
      const result = await client.set(key, "1", { NX: true, EX: 600 });
      return result === "OK";
    } finally {
      await client.quit().catch(() => {});
    }
  } catch {
    return true;
  }
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
  const file = input.file;
  const text = prepareSlackCaption(input.text, file?.name);
  if (!token || !channel || !text) return { posted: false, file: "" };
  const fetchImpl = input.fetchImpl || fetch;
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
  const body = response.ok ? await response.json() : null;
  return { posted: body?.ok === true, file: "", ...(body?.error ? { reason: body.error } : {}) };
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
  try {
    const response = await fetchFn(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const status = Number(response?.status || 0);
    if (status >= 300 && status < 400) {
      const location = typeof response.headers?.get === "function" ? response.headers.get("location") : "";
      if (!location) return "";
      if (slackFileUrl(location)) return slackDownload(fetchFn, token, location, hops + 1);
      if (!location.startsWith("https://")) return "";
      const followed = await fetchFn(location, { signal: AbortSignal.timeout(10_000) });
      if (!followed?.ok) return "";
      return typeof followed.text === "function" ? await followed.text() : "";
    }
    if (response?.ok === false || (status && status >= 400)) return "";
    return typeof response?.text === "function" ? await response.text() : "";
  } catch {
    return "";
  }
}

async function postSlackFile({ token, channel, text, thread, file, fetchImpl }) {
  const bytes = String(file.bytes);
  const opened = await slackForm(fetchImpl, token, "files.getUploadURLExternal", {
    filename: file.name,
    length: Buffer.byteLength(bytes),
  });
  const uploadUrl = slackUploadUrl(opened?.upload_url);
  if (!opened?.ok || !uploadUrl || !opened.file_id) return { posted: false, file: "", reason: opened?.error || "upload_failed" };
  const uploaded = await fetchImpl(uploadUrl, { method: "POST", body: bytes });
  if (!uploaded.ok) return { posted: false, file: "" };
  const done = await slackJson(fetchImpl, token, "files.completeUploadExternal", {
    files: [{ id: opened.file_id, title: file.name }],
    channel_id: channel,
    initial_comment: text,
    thread_ts: thread || undefined,
  });
  return { posted: Boolean(done?.ok), file: done?.ok ? file.name : "", ...(done?.error ? { reason: done.error } : {}) };
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
