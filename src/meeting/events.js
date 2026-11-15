/**
 * One transcript event for this bot.
 * The webhook id is the event, so a retry matches and the final after a partial does not.
 * With no webhook id, the delivery id is the event. With neither, the speaker and the utterance start stand in.
 *
 * @param {string} botId
 * @param {{ deliveryId?: string, memberId?: string, speakerName?: string, utteranceId?: string } | null | undefined} delivery
 * @param {string} [webhookId]
 */
export function meetingEventKey(botId, delivery, webhookId = "") {
  const bot = String(botId || "").trim();
  if (!bot || bot === "meeting") return "";
  const eventId = String(webhookId || "").trim() || String(delivery?.deliveryId || "").trim();
  if (eventId) return `${bot}:${eventId}`;
  const speaker = String(delivery?.memberId || "").trim() || String(delivery?.speakerName || "").trim().toLowerCase();
  const start = String(delivery?.utteranceId || "").trim();
  if (!speaker && !start) return "";
  return `${bot}:${speaker}:${start}`;
}

/** True the first time this session sees the event. A second copy on this instance is false. */
export function claimMeetingEventLocal(session, eventKey) {
  const key = String(eventKey || "").trim();
  if (!session || !key) return true;
  if (!(session.meetingHeard instanceof Set)) session.meetingHeard = new Set();
  if (session.meetingHeard.has(key)) return false;
  session.meetingHeard.add(key);
  return true;
}

/**
 * Cross-instance claim. Upstash SET NX for ten minutes.
 * No Redis, a failed request, or a thrown client still returns true so one instance can record.
 * A null NX result means another instance already took the event.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} eventKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function claimMeetingEvent(env, eventKey, fetchImpl = fetch) {
  const key = String(eventKey || "").trim();
  if (!key) return true;
  const url = String(env?.UPSTASH_REDIS_REST_URL || env?.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env?.UPSTASH_REDIS_REST_TOKEN || env?.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return true;
  try {
    const response = await (fetchImpl || fetch)(`${url}/set/${encodeURIComponent(`sederunt:voice:heard:${key}`)}/1?NX=true&EX=600`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response?.ok) return true;
    const body = typeof response.json === "function" ? await response.json().catch(() => null) : null;
    if (body && Object.prototype.hasOwnProperty.call(body, "result") && body.result == null) return false;
    return true;
  } catch {
    return true;
  }
}

/** Drop a claim this instance did not finish, so a retry can record. */
export function releaseMeetingEventLocal(session, eventKey) {
  const key = String(eventKey || "").trim();
  if (!session || !key || !(session.meetingHeard instanceof Set)) return;
  session.meetingHeard.delete(key);
}

/**
 * Drop the cross-instance claim. A missing Redis, or a failed delete, leaves the claim in place.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} eventKey
 * @param {typeof fetch} [fetchImpl]
 */
export async function releaseMeetingEvent(env, eventKey, fetchImpl = fetch) {
  const key = String(eventKey || "").trim();
  if (!key) return;
  const url = String(env?.UPSTASH_REDIS_REST_URL || env?.KV_REST_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env?.UPSTASH_REDIS_REST_TOKEN || env?.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return;
  try {
    await (fetchImpl || fetch)(`${url}/del/${encodeURIComponent(`sederunt:voice:heard:${key}`)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // The claim stays until it expires. A retry stays quiet until then.
  }
}
