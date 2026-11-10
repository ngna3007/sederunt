const toolRows = [];
const stageRows = [];

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

export function meetingMetrics() {
  return {
    tools: toolRows.map((row) => ({ ...row })),
    stages: stageRows.map((row) => ({ ...row })),
  };
}

export function resetMeetingMetrics() {
  toolRows.length = 0;
  stageRows.length = 0;
}
