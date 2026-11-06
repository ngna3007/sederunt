import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarAdapter } from "../src/calendar/mcp.js";
import { upcomingMeetings } from "../src/console-flow.js";

const ZONE = "Asia/Ho_Chi_Minh";

test("person grant token powers listUpcoming without env calendar tokens", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), auth: String(init.headers?.Authorization || init.headers?.authorization || "") });
    if (String(url).includes("oauth2.googleapis.com")) {
      return {
        ok: true,
        status: 200,
        async json() { return { access_token: "ya29.from-refresh", expires_in: 3600 }; },
        async text() { return JSON.stringify({ access_token: "ya29.from-refresh", expires_in: 3600 }); },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({
                events: [{
                  id: "evt-1",
                  summary: "Northline standup",
                  start: { dateTime: "2099-01-02T03:00:00+07:00" },
                  end: { dateTime: "2099-01-02T03:30:00+07:00" },
                }],
              }),
            }],
          },
        });
      },
    };
  };

  let forced = 0;
  const adapter = createCalendarAdapter({
    CALENDAR_TIME_ZONE: ZONE,
    // No CALENDAR_MCP_TOKEN / CALENDAR_OAUTH_REFRESH_TOKEN — person grant only.
  }, {
    fetch: fetchImpl,
    accessToken: async ({ force } = {}) => {
      if (force) forced += 1;
      return "ya29.person-grant";
    },
  });

  const listed = await adapter.listUpcoming();
  assert.equal(Array.isArray(listed), true);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "Northline standup");
  assert.equal(calls.some((c) => c.auth.includes("ya29.person-grant")), true);
  assert.equal(forced, 0);
});

test("welcome upcomingMeetings reports unavailable when person token cannot read", async () => {
  const adapter = createCalendarAdapter({
    CALENDAR_TIME_ZONE: ZONE,
  }, {
    fetch: async () => ({ ok: false, status: 500, async text() { return "nope"; } }),
    accessToken: async () => "ya29.broken",
  });
  // listUpcoming throws CalendarError / network → upcomingMeetings catches → readDay path or unavailable
  const result = await upcomingMeetings({ env: { CALENDAR_TIME_ZONE: ZONE }, calendar: {
    async listUpcoming() { throw Object.assign(new Error("boom"), { status: 500 }); },
    async readDay() { return { day: "friday", events: [], unavailable: true }; },
  } }, false);
  assert.equal(result.unavailable, true);
  assert.equal(result.rows.length, 0);
});
