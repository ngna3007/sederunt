/**
 * Slack Web API for a retried post. `fetchImpl` is injected so a test can
 * stand in for the network. A non-OK HTTP status is a failure. The permalink
 * comes from chat.getPermalink, and the archive URL is the fallback.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export function createSlackClient(env = {}, fetchImpl = globalThis.fetch) {
  const token = typeof env.SLACK_BOT_TOKEN === "string" ? env.SLACK_BOT_TOKEN.trim() : "";
  return {
    fetch: fetchImpl,
    async postMessage({ channel, text, thread, username } = {}) {
      if (!token || !channel || !text) {
        const error = new Error("unsupported");
        error.reason = "unsupported";
        throw error;
      }
      const speaker = typeof username === "string" ? username.trim() : "";
      const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channel,
          text,
          thread_ts: thread || undefined,
          ...(speaker ? { username: speaker } : {}),
        }),
      });
      if (!response.ok) {
        const error = new Error(`Slack chat.postMessage failed with HTTP ${response.status}`);
        error.reason = "failed";
        throw error;
      }
      const body = await response.json();
      if (body?.ok === true && body.channel && body.ts) {
        body.permalink = await messagePermalink(fetchImpl, token, body.channel, body.ts) || archiveUrl(body.channel, body.ts);
      }
      return body;
    },
    async resolveChannel(name) {
      return resolveChannelName(fetchImpl, token, env, name);
    },
    /**
     * A channel id becomes its Slack name. A name is returned as given.
     * A lookup that fails returns "" so the page never shows a raw id.
     */
    async channelLabel(id) {
      const raw = String(id || "").trim().replace(/^#/, "");
      if (!raw) return "";
      if (!CHANNEL_ID.test(raw)) return raw;
      if (!token) return "";
      try {
        const channels = await listChannels(fetchImpl, token);
        const hit = channels.find((item) => item?.id === raw);
        return String(hit?.name || "").replace(/^#/, "").trim();
      } catch {
        return "";
      }
    },
  };
}

async function messagePermalink(fetchImpl, token, channel, ts) {
  try {
    const params = new URLSearchParams({ channel, message_ts: ts });
    const response = await fetchImpl(`https://slack.com/api/chat.getPermalink?${params}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return "";
    const body = await response.json();
    return body?.ok === true && typeof body.permalink === "string" ? body.permalink : "";
  } catch {
    return "";
  }
}

const CHANNEL_ID = /^[CDGW][A-Z0-9]{2,}$/;

async function resolveChannelName(fetchImpl, token, env, name) {
  const raw = String(name || "").trim();
  if (CHANNEL_ID.test(raw)) return raw;
  const fallback = String(env.SLACK_DEFAULT_CHANNEL || "").trim();
  const fallbackId = CHANNEL_ID.test(fallback) ? fallback : "";
  const wanted = raw.replace(/^#/, "").toLowerCase();
  if (!wanted || !token) return fallbackId;
  try {
    const channels = await listChannels(fetchImpl, token);
    const hit = channels.find((item) => String(item?.name || "").toLowerCase() === wanted);
    if (hit && CHANNEL_ID.test(hit.id)) return hit.id;
  } catch {
    return "";
  }
  return "";
}

async function listChannels(fetchImpl, token) {
  const found = [];
  let cursor = "";
  for (let page = 0; page < 8; page += 1) {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      limit: "200",
      exclude_archived: "true",
    });
    if (cursor) params.set("cursor", cursor);
    const response = await fetchImpl(`https://slack.com/api/conversations.list?${params}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) break;
    const body = await response.json();
    if (body?.ok !== true || !Array.isArray(body.channels)) break;
    found.push(...body.channels);
    cursor = String(body.response_metadata?.next_cursor || "");
    if (!cursor) break;
  }
  return found;
}

function archiveUrl(channel, ts) {
  const id = String(channel || "").trim();
  const stamp = String(ts || "").trim();
  if (!id || !stamp) return "";
  return `https://slack.com/archives/${id}/p${stamp.replace(".", "")}`;
}
