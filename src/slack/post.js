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
    async postMessage({ channel, text, thread } = {}) {
      if (!token || !channel || !text) {
        const error = new Error("unsupported");
        error.reason = "unsupported";
        throw error;
      }
      const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ channel, text, thread_ts: thread || undefined }),
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
  };
}

async function messagePermalink(fetchImpl, token, channel, ts) {
  try {
    const response = await fetchImpl("https://slack.com/api/chat.getPermalink", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ channel, message_ts: ts }),
    });
    if (!response.ok) return "";
    const body = await response.json();
    return body?.ok === true && typeof body.permalink === "string" ? body.permalink : "";
  } catch {
    return "";
  }
}

function archiveUrl(channel, ts) {
  const id = String(channel || "").trim();
  const stamp = String(ts || "").trim();
  if (!id || !stamp) return "";
  return `https://slack.com/archives/${id}/p${stamp.replace(".", "")}`;
}
