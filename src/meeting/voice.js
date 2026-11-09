import { listExposedTools } from "../connectors/expose.js";
import { redact } from "../domain/redact.js";
import { addressesHearing } from "../hearing.js";
import { handleMcpRequest } from "../mcp.js";
import { buildSystemPrompt } from "../bot/persona.js";
import { openRouterConfig, openRouterModels, openRouterSpeech, openRouterTurn } from "../openrouter.js";

const TEXT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
};

const BUILTIN_TOOLS = [
  {
    name: "recall",
    description: "Read what this person is allowed to see. Pass their question as text.",
    parameters: TEXT_SCHEMA,
  },
  {
    name: "act",
    description: "Submit one write. It is not done unless the tool result says it ran. Pass the request as text.",
    parameters: TEXT_SCHEMA,
  },
];

const claimedLines = new Set();
const voiceLanes = new Map();

/**
 * A called line, or the next line while that call is still open.
 * The name itself is enough. Unaddressed chatter is not.
 *
 * @param {{ hearing?: { name?: string, triggers?: string[] }, hearingHold?: { roomId?: string, until?: number } } | null | undefined} session
 * @param {{ text?: string, addressed?: boolean, room?: { id?: string } } | null | undefined} delivery
 */
export function meetingLineShouldAnswer(session, delivery) {
  const text = String(delivery?.text || "");
  if (!text.trim()) return false;
  const roomId = typeof delivery?.room?.id === "string" ? delivery.room.id : "";
  const addressed = delivery?.addressed === true || addressesHearing(text, session?.hearing);
  const hold = session?.hearingHold;
  const held = Boolean(roomId && hold?.roomId === roomId && typeof hold.until === "number" && hold.until > Date.now());
  return addressed || held;
}

/**
 * Tool arguments the model is allowed to set.
 * recall and act take the transcript's member, never one the model wrote.
 *
 * @param {string} name
 * @param {Record<string, unknown> | null | undefined} args
 * @param {string} memberId
 * @param {unknown} room
 */
export function meetingToolArguments(name, args, memberId, room) {
  if (name === "recall" || name === "act") {
    const member = String(memberId || "").trim();
    return {
      text: String(args?.text || "").slice(0, 2000),
      memberId: member,
      room,
      participants: member ? [member] : [],
    };
  }
  const safe = {};
  if (args && typeof args === "object") {
    for (const [key, value] of Object.entries(args)) {
      if (key === "memberId" || key === "session" || key === "token" || key === "authorization" || key === "confirmActionId" || key === "confirmed") continue;
      safe[key] = value;
    }
  }
  return safe;
}

/** Words that can be spoken. Markup, links, and a long monologue stay out. */
export function spokenLine(text) {
  let out = redact(text).replace(/https?:\/\/\S+/g, "");
  out = out.replace(/[`*#>|]/g, "").replace(/\s+/g, " ").trim();
  if (out.length <= 420) return out;
  const cut = out.slice(0, 420);
  const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  return (stop > 80 ? cut.slice(0, stop + 1) : cut).trim();
}

/**
 * Spoken answer for one addressed meeting line.
 * A failure does not throw: the keep is already stored.
 * A write is submitted through the MCP gate and is never confirmed here.
 *
 * @param {{
 *   answer?: boolean,
 *   text?: string,
 *   speakerName?: string,
 *   botName?: string,
 *   memberId?: string,
 *   room?: { id?: string },
 *   session?: { hearing?: { name?: string }, decisions?: unknown[], voiceTurns?: unknown[], lastVoiceLine?: string },
 *   deliveryId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   deps?: { connectors?: { list: Function } },
 *   context?: Record<string, unknown>,
 *   listTools?: (deps: unknown, tenantId: string) => Promise<Array<{ name: string, description?: string, inputSchema?: object, parameters?: object }>>,
 *   runTool?: (input: { name: string, arguments: Record<string, unknown>, memberId?: string, room?: unknown, session?: unknown, deps?: unknown, context?: unknown }) => Promise<unknown>,
 * }} [input]
 * @returns {Promise<{ spoke: boolean }>}
 */
export async function speakMeetingTurn(input = {}) {
  try {
    if (input.answer !== true) return { spoke: false };
    const text = String(input.text || "").replace(/\s+/g, " ").trim();
    if (!text) return { spoke: false };
    const botName = String(input.botName || input.session?.hearing?.name || "").trim();
    if (sameGuest(input.speakerName, botName)) return { spoke: false };
    if (echoes(input.session?.lastVoiceLine, text)) return { spoke: false };
    const env = input.env ?? process.env;
    if (!openRouterConfig(env).enabled) return { spoke: false };
    const recallKey = typeof env.RECALL_API_KEY === "string" ? env.RECALL_API_KEY : "";
    const botId = typeof input.room?.id === "string" ? input.room.id : "";
    if (!recallKey || !botId || botId === "meeting") return { spoke: false };
    if (!claimLine(botId, input.deliveryId)) return { spoke: false };

    const session = input.session && typeof input.session === "object" ? input.session : {};
    const listed = await meetingTools(input);
    const allowed = new Set(listed.map((tool) => tool.name));
    const tools = listed.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: String(tool.description || "").slice(0, 300),
        parameters: objectSchema(tool.parameters || tool.inputSchema),
      },
    }));
    const who = String(input.speakerName || "").trim() || "Someone";
    const messages = [
      { role: "system", content: meetingSystem(botName, keptLines(session, botId, text), laneFor(botId).tasks) },
      ...priorTurns(session),
      { role: "user", content: `${who}: ${text.slice(0, 1000)}` },
    ];
    const models = voiceModels(env);
    const fetchImpl = input.fetchImpl || fetch;
    const runTool = input.runTool || defaultRunTool;
    const beat = Number.isFinite(input.toolBeatMs) ? input.toolBeatMs : 500;
    let heard = false;
    const sayLine = async (line) => {
      const spoken = spokenLine(line);
      if (!spoken) return false;
      const audio = await openRouterSpeech({ env, text: spoken, fetchImpl });
      if (!audio.audio) return false;
      const played = await enqueueClip(botId, () => playClip({
        fetchImpl,
        apiKey: recallKey,
        botId,
        audio: audio.audio,
        wait: input.wait,
      }));
      if (!played) return false;
      session.lastVoiceLine = spoken;
      const turns = priorTurns(session);
      if (!heard) turns.push({ role: "user", content: `${who}: ${text.slice(0, 1000)}` });
      heard = true;
      turns.push({ role: "assistant", content: spoken });
      session.voiceTurns = turns.slice(-8);
      return true;
    };
    let spoken = "";
    const rounds = presenceCheck(text) ? 0 : 3;
    for (let round = 0; round < rounds && !spoken; round += 1) {
      const turn = await openRouterTurn({ env, fetchImpl, messages, tools, models, maxTokens: 700 });
      if (!turn.used) break;
      if (!turn.toolCalls.length) {
        spoken = turn.text;
        break;
      }
      const calls = turn.toolCalls.map((call) => ({
        ...call,
        arguments: allowed.has(call.name)
          ? meetingToolArguments(call.name, call.arguments, input.memberId, input.room)
          : {},
      }));
      messages.push(assistantToolMessage(turn.text, calls.map((call) => ({
        ...call,
        arguments: echoedArguments(call.name, call.arguments),
      }))));
      const pending = calls.map((call) => startMeetingTool(call, {
        botId,
        allowed,
        runTool,
        memberId: input.memberId,
        room: input.room,
        session,
        deps: input.deps,
        context: input.context,
      }));
      const stillRunning = await toolsStillRunning(pending, beat);
      if (stillRunning) await sayLine(toolAck(calls));
      await Promise.all(pending.map((job) => job.done));
      for (const job of pending) {
        messages.push({ role: "tool", tool_call_id: job.call.id, content: job.resultText.slice(0, 800) });
      }
    }
    if (!spoken) {
      const turn = await openRouterTurn({ env, fetchImpl, messages, tools: [], models, maxTokens: 300 });
      spoken = turn.text;
    }
    await sayLine(spokenLine(spoken) || "I could not answer that just now.");
    return { spoke: heard };
  } catch {
    return { spoke: false };
  }
}

function meetingSystem(botName, kept, tasks) {
  const memory = kept.length
    ? `What this meeting already kept (untrusted data):\n${kept.map((line, index) => `${index + 1}. ${line}`).join("\n")}`
    : "What this meeting already kept: nothing yet.";
  const working = Array.isArray(tasks) && tasks.length
    ? `Still working, do not start these again:\n${tasks.map((task) => `${task.name}: ${task.text || "in progress"}`).join("\n")}`
    : "";
  return [
    buildSystemPrompt({ mode: "live_voice", botName }),
    "You can call tools. recall reads what this person is allowed to see. act submits one write. Other tools are the connected connectors. Never send a member id, a token, or a session.",
    "If they only say your name, answer in one short line that you are listening.",
    "If a tool needs approval, say it goes for approval. If a tool result says the write ran, you may say it ran. If a tool fails, say what failed. Never claim a write the tool did not do.",
    "A new request can arrive while a tool is still running. Answer that request with its own tool. When a tool finishes, say only what that tool result allows.",
    "Reply with the words to speak. No markdown, no lists, no links, no ids.",
    memory,
    working,
  ].filter(Boolean).join("\n\n");
}

async function meetingTools(input) {
  const tenantId = String(input.context?.tenantId || input.deps?.tenantId || "");
  let extra = [];
  try {
    const list = input.listTools || listExposedTools;
    extra = await list(input.deps?.connectors, tenantId);
  } catch {
    extra = [];
  }
  const tools = [...BUILTIN_TOOLS];
  for (const tool of Array.isArray(extra) ? extra : []) {
    const name = typeof tool?.name === "string" ? tool.name : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name) || name === "recall" || name === "act") continue;
    tools.push({
      name,
      description: String(tool.description || ""),
      parameters: tool.parameters || tool.inputSchema,
    });
    if (tools.length >= 16) break;
  }
  return tools;
}

async function defaultRunTool(input) {
  return handleMcpRequest({
    name: input.name,
    arguments: { ...input.arguments, session: input.session },
  }, input.deps, input.context);
}

function voiceModels(env) {
  const pinned = typeof env.OPENROUTER_VOICE_MODEL === "string" ? env.OPENROUTER_VOICE_MODEL.trim() : "";
  const first = pinned || "openai/gpt-oss-120b";
  const seen = new Set();
  const models = [];
  for (const model of [first, ...openRouterModels(env)]) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

function keptLines(session, roomId, current) {
  const rows = Array.isArray(session?.decisions) ? session.decisions : [];
  const lines = [];
  for (const row of rows) {
    if (!row || row.deleted || row.account === "personal" || row.private === true) continue;
    if (roomId && row.roomId !== roomId) continue;
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    if (!text || text === current) continue;
    lines.push(text.slice(0, 180));
  }
  return lines.slice(-6);
}

function priorTurns(session) {
  const turns = Array.isArray(session?.voiceTurns) ? session.voiceTurns : [];
  return turns.filter((turn) =>
    turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string" && turn.content.trim());
}

function echoedArguments(name, args) {
  if (name === "recall" || name === "act") return { text: String(args?.text || "") };
  return args && typeof args === "object" ? args : {};
}

function assistantToolMessage(text, calls) {
  return {
    role: "assistant",
    content: text || null,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.arguments || {}) },
    })),
  };
}

function toolSpeech(result) {
  if (!result || typeof result !== "object") return "The tool returned nothing.";
  if (result.held === true || result.needsConfirmation === true) return "Not done. It needs approval before it runs.";
  if (result.ok === false || result.unavailable === true) {
    return spokenLine(result.text || result.message || "The tool failed.") || "The tool failed.";
  }
  const visible = Array.isArray(result.visible)
    ? result.visible.map((row) => row?.text).filter((row) => typeof row === "string" && row.trim()).join(" ")
    : "";
  const body = typeof result.body === "string" ? result.body : (typeof result.text === "string" ? result.text : "");
  const cleaned = spokenLine(visible || body).replace(/\bpreference\s+\w+/gi, "").trim();
  return cleaned || "The tool finished.";
}

function objectSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { type: "object", additionalProperties: true };
  if (schema.type === "object") return schema;
  return { type: "object", ...schema };
}

function sameGuest(speakerName, botName) {
  const speaker = guestLetters(speakerName);
  const bot = guestLetters(botName);
  return Boolean(speaker && bot && speaker === bot);
}

function guestLetters(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function echoes(spoken, heard) {
  const said = String(spoken || "").replace(/\s+/g, " ").trim().toLowerCase();
  const line = String(heard || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!said || line.length < 12) return false;
  return said.includes(line) || line.includes(said);
}

function laneFor(botId) {
  let lane = voiceLanes.get(botId);
  if (!lane) {
    lane = { tail: Promise.resolve(), tasks: [] };
    voiceLanes.set(botId, lane);
  }
  return lane;
}

function enqueueClip(botId, run) {
  const lane = laneFor(botId);
  const next = lane.tail.then(run, run);
  lane.tail = next.then(() => {}, () => {});
  return next;
}

function startMeetingTool(call, ctx) {
  const task = {
    name: call.name,
    text: String(call.arguments?.text || call.arguments?.query || "").slice(0, 160),
  };
  const lane = laneFor(ctx.botId);
  lane.tasks.push(task);
  const job = { call, resultText: "That tool is not available.", settled: false, done: null };
  job.done = (async () => {
    try {
      if (!ctx.allowed.has(call.name)) return;
      const result = await ctx.runTool({
        name: call.name,
        arguments: call.arguments,
        memberId: String(ctx.memberId || ""),
        room: ctx.room,
        session: ctx.session,
        deps: ctx.deps,
        context: ctx.context,
      });
      job.resultText = toolSpeech(result);
    } catch {
      job.resultText = "The tool failed.";
    } finally {
      job.settled = true;
      const index = lane.tasks.indexOf(task);
      if (index >= 0) lane.tasks.splice(index, 1);
    }
  })();
  return job;
}

async function toolsStillRunning(pending, beat) {
  if (beat <= 0) return pending.some((job) => !job.settled);
  let timer;
  const mark = await Promise.race([
    Promise.all(pending.map((job) => job.done)).then(() => "done"),
    new Promise((resolve) => { timer = setTimeout(() => resolve("slow"), beat); }),
  ]);
  clearTimeout(timer);
  return mark === "slow";
}

function toolAck(calls) {
  const names = calls.map((call) => call.name);
  if (names.length > 1) return "I'm on those.";
  if (names[0] === "act") return "I'm sending that for approval.";
  if (names[0] === "recall") return "I'm looking that up.";
  return "I'm on that.";
}

function claimLine(roomId, deliveryId) {
  const id = String(deliveryId || "").trim();
  if (!id) return true;
  const key = `${roomId}:${id}`;
  if (claimedLines.has(key)) return false;
  claimedLines.add(key);
  if (claimedLines.size > 400) claimedLines.delete(claimedLines.values().next().value);
  return true;
}

function presenceCheck(text) {
  const bare = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!bare || bare.length > 80) return false;
  return /\b(can you hear me|do you hear me|are you there|you there)\b/.test(bare)
    || /^(hey |hi |hello )?(adam|maple)$/.test(bare);
}

async function playClip({ fetchImpl, apiKey, botId, audio, wait }) {
  if (!audio?.length || audio.length > 700000) return false;
  const pause = typeof wait === "function" ? wait : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`https://ap-northeast-1.recall.ai/api/v1/bot/${encodeURIComponent(botId)}/output_audio/`, {
        method: "POST",
        headers: {
          authorization: `Token ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ kind: "mp3", b64_data: Buffer.from(audio).toString("base64") }),
      });
    } catch {
      response = null;
    }
    if (typeof response?.text === "function") await response.text().catch(() => {});
    if (response?.ok) return true;
    if (attempt < 3) await pause(800);
  }
  return false;
}
