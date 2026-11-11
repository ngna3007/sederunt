const toolRows = [];
const stageRows = [];
const turnRows = [];
const socketRows = [];

/**
 * One tool outcome. The row is the name, the latency, and the outcome.
 * Arguments and room text are not stored.
 *
 * @param {string} name
 * @param {{ ms?: number, outcome?: string }} [fields]
 */
export function noteToolMetric(name, fields = {}) {
  const row = {
    tool: String(name || "").slice(0, 80),
    ms: Math.max(0, Math.round(Number(fields.ms) || 0)),
    outcome: String(fields.outcome || "ok").slice(0, 24),
  };
  toolRows.push(row);
  if (toolRows.length > 200) toolRows.shift();
  return row;
}

/**
 * One stage latency. The name is a stage, not a sentence.
 *
 * @param {string} stage
 * @param {number} ms
 */
export function noteStageMetric(stage, ms) {
  const row = {
    stage: String(stage || "").slice(0, 40),
    ms: Math.max(0, Math.round(Number(ms) || 0)),
  };
  stageRows.push(row);
  if (stageRows.length > 200) stageRows.shift();
  return row;
}

function latency(value, origin) {
  if (typeof value !== "number" || !Number.isFinite(value) || typeof origin !== "number") return null;
  return Math.max(0, Math.round(value - origin));
}

/** One turn, as milliseconds after the endpoint. The row has no sentence and no speaker. */
export function noteTurnLog(clock) {
  const origin = typeof clock?.endpoint === "number" ? clock.endpoint : 0;
  const row = {
    endpoint: 0,
    firstToken: latency(clock?.firstToken, origin),
    firstByte: latency(clock?.firstByte, origin),
    playback: latency(clock?.playback, origin),
  };
  turnRows.push(row);
  if (turnRows.length > 200) turnRows.shift();
  console.info(JSON.stringify({ meeting: "turn", ...row }));
  return row;
}

/** Shape of one socket message. Speaker names and word text are not stored. */
export function noteSocketShape(shape) {
  const row = {
    event: String(shape?.event || "").slice(0, 60),
    words: Math.max(0, Math.round(Number(shape?.words) || 0)),
    final: shape?.final === true,
    keys: Array.isArray(shape?.keys) ? shape.keys.map((key) => String(key).slice(0, 40)).slice(0, 8) : [],
  };
  socketRows.push(row);
  if (socketRows.length > 200) socketRows.shift();
  console.info(JSON.stringify({ meeting: "socket", ...row }));
  return row;
}

export function meetingMetrics() {
  return {
    tools: toolRows.map((row) => ({ ...row })),
    stages: stageRows.map((row) => ({ ...row })),
    turns: turnRows.map((row) => ({ ...row })),
    sockets: socketRows.map((row) => ({ ...row, keys: [...row.keys] })),
  };
}

export function resetMeetingMetrics() {
  toolRows.length = 0;
  stageRows.length = 0;
  turnRows.length = 0;
  socketRows.length = 0;
}
