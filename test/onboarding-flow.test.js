import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { openSession } from "../src/console-auth.js";
import { createIdentity } from "../src/identity/client.js";
import { createApp, defaultDeps } from "../src/server.js";
import { upcomingMeetings } from "../src/console-flow.js";
import { renderWelcomePage } from "../src/console-welcome.js";

const SECRET = "session-secret";
const WIDTHS = [1920, 1097, 768, 390];

function listen(app) {
  app.listen(0, "127.0.0.1");
  return once(app, "listening").then(() => app.address().port);
}

function call(port, method, path, { body, headers, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers: {
        ...(body ? { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) } : {}),
        ...(cookie ? { cookie } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location || "",
        cookie: res.headers["set-cookie"],
        cache: String(res.headers["cache-control"] || ""),
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieList(setCookie) {
  if (setCookie == null) return [];
  return Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)];
}

function absorb(jar, setCookie) {
  for (const item of cookieList(setCookie)) {
    const pair = item.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!value) delete jar[name];
    else jar[name] = value;
  }
  return jar;
}

function header(jar) {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
}

function sessionOf(jar) {
  return openSession(decodeURIComponent(jar.sederunt_session || ""), SECRET);
}

async function followProvider(port, jar, provider, next) {
  const start = await call(port, "GET", `/console/auth/${provider}?next=${encodeURIComponent(next)}`, { cookie: header(jar) });
  assert.equal(start.status, 302, start.raw);
  assert.match(start.location, new RegExp(`^/console/auth/fake/${provider}$`));
  absorb(jar, start.cookie);
  const consent = await call(port, "GET", start.location, { cookie: header(jar) });
  assert.equal(consent.status, 302, consent.raw);
  assert.match(consent.location, /^\/console\/auth\/callback\?code=/);
  absorb(jar, consent.cookie);
  const done = await call(port, "GET", consent.location, { cookie: header(jar) });
  assert.equal(done.status, 302, done.raw);
  absorb(jar, done.cookie);
  return done;
}

async function withServer(env, fn) {
  const identity = createIdentity({ ...env, SEDERUNT_AUTH_FAKE_GITHUB: "1" });
  // Use the fake's second account slot behind Google consent to test two
  // distinct people without enabling another member sign-in provider.
  let secondGoogleAccount = false;
  const issue = identity.issueConsentCode.bind(identity);
  const getUser = identity.getUser.bind(identity);
  identity.useSecondGoogleAccount = () => { secondGoogleAccount = true; };
  identity.issueConsentCode = (input) => issue({ ...input, provider: secondGoogleAccount && input.provider === "google" ? "github" : input.provider });
  identity.getUser = async (token) => {
    const user = await getUser(token);
    return { ...user, app_metadata: { ...user.app_metadata, provider: "google", providers: ["google"] } };
  };
  const app = createApp({ companyLoaded: true, env, identity });
  const port = await listen(app);
  try {
    await fn(port, identity);
  } finally {
    app.close();
  }
}

function assertNoSecrets(page, session) {
  assert.equal(page.raw.includes(session.userId), false);
  assert.equal(page.raw.includes(session.accessToken), false);
  assert.equal(page.raw.includes(session.refreshToken), false);
  assert.doesNotMatch(page.raw, /access_token|refresh_token|eyJ/);
}

test("fake auth onboarding stays on localhost", async (t) => {
  const outbound = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || input);
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      host = "";
    }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      outbound.push(raw);
      throw new Error(`blocked outbound fetch to ${host}`);
    }
    return realFetch(input, init);
  };

  try {
    await t.test("first sign-in creates a named workspace and walks the four steps", async () => {
      // Fake auth turns on the fake calendar; present it as not connected to walk the connect path.
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_CALENDAR_FAKE_CONNECTED: "0", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_MEMBER: "Mina" };
      await withServer(env, async (port, identity) => {
        const sign = await call(port, "GET", "/console/sign-in");
        assert.equal(sign.status, 200);
        assert.match(sign.raw, /class="auth-logo"/);
        assert.doesNotMatch(sign.raw, /auth-letter/);
        assert.doesNotMatch(sign.raw, />G</);
        assert.doesNotMatch(sign.raw, />Gh</);
        const github = await call(port, "GET", "/console/auth/github");
        assert.equal(github.status, 404);
        assert.equal(github.location, "");
        assert.doesNotMatch(sign.raw, /id="auth-github"|Continue with GitHub/);
        const directFakeGithub = await call(port, "GET", "/console/auth/fake/github");
        assert.equal(directFakeGithub.status, 404);

        const jar = {};
        const done = await followProvider(port, jar, "google", "/console");
        assert.equal(done.location, "/console");
        const welcome = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(welcome.status, 302);
        assert.equal(welcome.location, "/console/welcome");
        absorb(jar, welcome.cookie);

        const first = await call(port, "GET", "/console/welcome", { cookie: header(jar) });
        assert.equal(first.status, 200);
        assert.match(first.raw, /Step 1 of 4/);
        assert.match(first.raw, /role="progressbar"/);
        assert.match(first.raw, /Create your workspace/);
        // ada@example.com is a public-style domain, so the name falls back to the first name.
        assert.match(first.raw, /id="workspace-name"[^>]*value="Ada(&#39;|&#x27;|')s workspace"/);
        assert.match(first.raw, /class="sederunt-mark/);
        assert.doesNotMatch(first.raw, /Just me|My team|My company|Personal/);
        assert.doesNotMatch(first.raw, /id="ob-skip"/);

        const blank = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=" });
        assert.equal(blank.status, 400);
        assert.match(blank.raw, /id="ob-error"/);
        assert.match(blank.raw, /Enter a name, from 1 to 120 characters\./);
        assert.match(blank.raw, /aria-invalid="true"/);

        const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Analytical+Engines" });
        assert.equal(created.status, 302);
        assert.equal(created.location, "/console/welcome?step=calendar");
        absorb(jar, created.cookie);
        const ada = sessionOf(jar);
        assert.equal(ada.ok, true);
        assert.equal(ada.onboarded, true);
        const tenants = await identity.myTenants(ada.accessToken);
        const team = tenants.find((row) => row.name === "Analytical Engines");
        assert.equal(team.kind, "company");
        assert.equal(team.role, "owner");
        assert.equal(ada.tenantId, team.id);

        const renamePage = await call(port, "GET", "/console/welcome?step=workspace", { cookie: header(jar) });
        assert.equal(renamePage.status, 200);
        assert.match(renamePage.raw, /Your workspace/);
        assert.match(renamePage.raw, /value="Analytical Engines"/);
        assert.match(renamePage.raw, /name="action" value="rename"/);
        assert.doesNotMatch(renamePage.raw, /id="ob-skip"/);
        assert.doesNotMatch(renamePage.raw, /id="ob-joinable"/);
        const sameName = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=rename&name=Analytical+Engines" });
        assert.equal(sameName.status, 302);
        assert.equal(sameName.location, "/console/welcome?step=calendar");
        const renamed = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=rename&name=Engines" });
        assert.equal(renamed.status, 302);
        assert.equal(renamed.location, "/console/welcome?step=calendar");
        const engines = await identity.myTenants(ada.accessToken);
        assert.equal(engines.find((row) => row.id === team.id).name, "Engines");
        const restored = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=rename&name=Analytical+Engines" });
        assert.equal(restored.status, 302);
        assert.equal((await identity.myTenants(ada.accessToken)).find((row) => row.id === team.id).name, "Analytical Engines");

        const calendar = await call(port, "GET", "/console/welcome?step=calendar", { cookie: header(jar) });
        assert.equal(calendar.status, 200);
        assert.match(calendar.raw, /Step 2 of 4/);
        assert.match(calendar.raw, /id="calendar-google"/);
        assert.match(calendar.raw, /id="calendar-outlook"[\s\S]*Coming soon/);
        assert.match(calendar.raw, /id="calendar-status">Not connected/);
        // Calendar Connect submits to the real Google consent; no docs tab.
        assert.doesNotMatch(calendar.raw, /id="calendar-connect"[^>]*data-docs=/);
        assert.match(calendar.raw, /href="\/console\/welcome\?step=workspace"[^>]*id="ob-back"/);
        assert.doesNotMatch(calendar.raw, /id="auto-join"/);
        const askedCalendar = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=calendar&choice=connect" });
        assert.equal(askedCalendar.status, 302);
        assert.equal(askedCalendar.location, "/console/auth/google?intent=calendar&next=%2Fconsole%2Fwelcome%3Fstep%3Dcalendar");
        const laterCalendar = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=calendar&choice=later" });
        assert.equal(laterCalendar.location, "/console/welcome?step=chat");

        const chat = await call(port, "GET", "/console/welcome?step=chat", { cookie: header(jar) });
        assert.equal(chat.status, 200);
        assert.match(chat.raw, /Step 3 of 4/);
        assert.match(chat.raw, /Connect Slack/);
        assert.match(chat.raw, /One allow adds the Sederunt bot/);
        assert.match(chat.raw, /Continuing…/);
        assert.match(chat.raw, /Opening Slack…/);
        assert.match(chat.raw, /sederunt-slack-wait/);
        assert.doesNotMatch(chat.raw, /Where should Sederunt post\?/);
        assert.doesNotMatch(chat.raw, /invite @Sederunt into a channel/);
        const declined = await call(port, "GET", "/console/welcome?step=chat&slack=declined", { cookie: header(jar) });
        assert.match(declined.raw, /Slack setup was cancelled/);
        for (const id of ["chat-slack", "chat-teams", "chat-gchat", "chat-discord", "chat-email"]) assert.match(chat.raw, new RegExp(`id="${id}"`));
        assert.match(chat.raw, /Coming soon/);
        assert.match(chat.raw, /id="ob-skip"[^>]*>Not now</);
        assert.match(chat.raw, /href="\/console\/welcome\?step=calendar"[^>]*id="ob-back"/);
        assert.doesNotMatch(chat.raw, /docs\.slack\.dev/);
        assert.doesNotMatch(chat.raw, /id="slack-connect"[^>]*data-docs=/);
        const laterChat = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=chat&choice=later" });
        assert.equal(laterChat.location, "/console/welcome?step=team");

        const step = await call(port, "GET", "/console/welcome?step=team", { cookie: header(jar) });
        assert.equal(step.status, 200);
        assert.match(step.raw, /Step 4 of 4/);
        assert.match(step.raw, /id="invite-add-row"/);
        assert.match(step.raw, /id="invite-role"[\s\S]*Member[\s\S]*Admin/);
        assert.doesNotMatch(step.raw, /Viewer/);
        assert.match(step.raw, /No one on the list yet/);
        assert.match(step.raw, /Or share this link/);
        assert.match(step.raw, /href="\/console\/welcome\?step=chat"[^>]*id="ob-back"/);
        assert.match(step.raw, /id="invite-link"[^>]*>http:\/\/[^<]+\/console\/join\/[A-Za-z0-9_-]{16,}<\/textarea>/);
        assert.doesNotMatch(step.raw, /id="domain-join"/);
        assert.match(step.raw, /I'll do this later/);
        assert.match(step.raw, /id="invite-send"[^>]*>Finish</);

        const self = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=invite&emails=ada%40example.com&roles=member" });
        assert.equal(self.status, 400);
        assert.match(self.raw, /Remove your own address/);
        const bad = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=invite&emails=not-an-email&roles=member" });
        assert.equal(bad.status, 400);
        assert.match(bad.raw, /id="invite-field-error"/);

        const sent = await call(port, "POST", "/console/welcome", {
          cookie: header(jar),
          body: "action=invite&emails=grace%40example.com&roles=member&emails=charles%40example.com&roles=admin&emails=GRACE%40example.com&roles=admin",
        });
        assert.equal(sent.status, 200);
        assert.match(sent.raw, /2 invites ready/);
        assert.match(sent.raw, /doesn't email invites yet/);
        assert.match(sent.raw, /grace@<wbr>example.com[\s\S]*Member/);
        assert.match(sent.raw, /charles@<wbr>example.com[\s\S]*Admin/);
        const tokens = [...sent.raw.matchAll(/\/console\/invite\/([a-f0-9]{20,})/g)].map((match) => match[1]);
        assert.equal(new Set(tokens).size, 2);
        assert.match(sent.raw, /id="ob-done">Go to Home</);

        const home = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(home.status, 200);
        assert.match(home.raw, /id="chip-name">Analytical Engines</);
        assert.match(home.raw, /id="chip-hint">Owner</);
        assert.match(home.raw, /Create workspace/);
        assert.doesNotMatch(home.raw, /Create a space|Team or company|>Personal<|Team · |Company · /);
        assert.match(home.raw, /id="home-checklist" data-tenant="[^"]+"/);
        assert.match(home.raw, /Connect your calendar/);
        assert.match(home.raw, /Choose where Sederunt posts/);
        assert.match(home.raw, /id="checklist-team"[^>]*>[\s\S]*?Team invited/);
        assert.match(home.raw, /id="checklist-add-meeting"/);
        assert.match(home.raw, /1 of 4 done/);
        assert.match(home.raw, /id="home-connect-tools">Connect tools</);
        assert.match(home.raw, /id="people-invite"/);
        assert.match(home.raw, /id="invite-dialog"/);
        assert.match(home.raw, /id="checklist-invite"/);
        assert.doesNotMatch(home.raw, /\/console\/welcome\?step=team(?:&amp;|&)mode=manage/);
        assert.match(home.raw, /id="members-card"/);
        assert.match(home.raw, /<input type="hidden" name="from" value="switcher">/);
        assert.doesNotMatch(home.raw, /id="space-kind"/);
        assertNoSecrets(home, ada);

        const account = await call(port, "GET", "/console/account", { cookie: header(jar) });
        assert.equal(account.status, 200);
        assert.match(account.raw, /id="account-page-name"[^>]*>Ada Lovelace</);
        assert.match(account.raw, /id="account-detail-email">ada@example.com</);
        assert.match(account.raw, /id="account-detail-provider">Signed in with Google</);
        assert.match(account.raw, /id="account-detail-workspace">Analytical Engines</);
        assert.match(account.raw, /id="account-detail-role">Owner</);
        assert.match(account.raw, /id="account-page-avatar"[^>]*>AL</);
        assert.match(account.raw, /data-member=""/);
        assertNoSecrets(account, ada);
        const back = await call(port, "GET", "/console/welcome", { cookie: header(jar) });
        assert.equal(back.status, 302);
        assert.equal(back.location, "/console");
      });
    });

    await t.test("an invite link and a domain join both add a Member", async () => {
      const env = {
        SEDERUNT_AUTH_FAKE: "1",
        SEDERUNT_AUTH_FAKE_GITHUB: "1",
        SEDERUNT_AUTH_FAKE_EMAIL: "rowan@northwind.io",
        SEDERUNT_AUTH_FAKE_NAME: "Rowan Pierce",
        SEDERUNT_SESSION_SECRET: SECRET,
      };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const first = await call(port, "GET", "/console/welcome", { cookie: header(jar) });
        assert.match(first.raw, /id="workspace-name"[^>]*value="Northwind"/);
        const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Northwind" });
        absorb(jar, created.cookie);
        const rowan = sessionOf(jar);
        const team = (await identity.myTenants(rowan.accessToken)).find((row) => row.name === "Northwind");

        const step = await call(port, "GET", "/console/welcome?step=team", { cookie: header(jar) });
        assert.match(step.raw, /id="domain-join"/);
        assert.match(step.raw, /Anyone with an @northwind\.io email can join/);
        const link = step.raw.match(/\/console\/join\/([A-Za-z0-9_-]{16,})/)[1];
        const skipped = await call(port, "POST", "/console/welcome", {
          cookie: header(jar),
          body: "action=skip&domain_present=1&domain_join=on",
        });
        assert.equal(skipped.status, 302);
        assert.equal(skipped.location, "/console");
        const stats = await identity.workspaceStats(rowan.accessToken, team.id);
        assert.equal(stats.allowedDomain, "northwind.io");

        const manage = await call(port, "GET", "/console/welcome?step=team&mode=manage", { cookie: header(jar) });
        assert.equal(manage.status, 200);
        assert.match(manage.raw, /Invite people/);
        assert.match(manage.raw, /Back to People/);
        assert.match(manage.raw, /id="domain-join"[^>]*checked/);
        assert.match(manage.raw, /id="invite-send"[^>]*>Done</);
        assert.doesNotMatch(manage.raw, /Step 4 of 4/);

        const anon = await call(port, "GET", `/console/join/${link}`);
        assert.equal(anon.status, 302);
        assert.match(anon.location, /^\/console\/sign-in\?next=/);
        const graceJar = {};
        identity.useSecondGoogleAccount();
        await followProvider(port, graceJar, "google", `/console/join/${link}`);
        const joined = await call(port, "POST", `/console/join/${link}`, { cookie: header(graceJar) });
        assert.equal(joined.status, 302);
        assert.equal(joined.location, "/console");
        absorb(graceJar, joined.cookie);
        const grace = sessionOf(graceJar);
        assert.equal(grace.provider, "google");
        assert.equal(grace.tenantId, team.id);
        const graceHome = await call(port, "GET", "/console/account", { cookie: header(graceJar) });
        assert.equal(graceHome.status, 200);
        assert.match(graceHome.raw, /id="chip-name">Northwind</);
        assert.match(graceHome.raw, /id="chip-hint">Member</);
        assert.match(graceHome.raw, /id="account-detail-role">Member</);
        assert.doesNotMatch(graceHome.raw, /id="people-invite"/);
        assertNoSecrets(graceHome, grace);
        const membership = await identity.myTenants(grace.accessToken);
        assert.equal(membership.find((row) => row.id === team.id).role, "member");
        const bogus = await call(port, "GET", "/console/join/short", { cookie: header(graceJar) });
        assert.notEqual(bogus.status, 500);
      });
    });

    await t.test("an emailed invite is accepted as its role, and switcher creation lands on invites", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_AUTH_FAKE_GITHUB: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Analytical+Engines" });
        absorb(jar, created.cookie);
        const sent = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=invite&emails=grace%40example.com&roles=admin" });
        assert.match(sent.raw, /1 invite ready/);
        const token = sent.raw.match(/\/console\/invite\/([a-f0-9]{20,})/)[1];

        const second = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&from=switcher&name=Side+Project" });
        assert.equal(second.status, 302);
        assert.equal(second.location, "/console?invite=1");
        absorb(jar, second.cookie);
        const ada = sessionOf(jar);
        const tenants = await identity.myTenants(ada.accessToken);
        const side = tenants.find((row) => row.name === "Side Project");
        const first = tenants.find((row) => row.name === "Analytical Engines");
        assert.equal(ada.tenantId, side.id);
        const listed = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.match(listed.raw, /id="chip-name">Side Project</);
        assert.match(listed.raw, new RegExp(`name="tenant" value="${first.id}"`));
        assert.match(listed.raw, new RegExp(`name="tenant" value="${side.id}"`));
        const switched = await call(port, "POST", "/console/space", { cookie: header(jar), body: `tenant=${encodeURIComponent(first.id)}` });
        assert.equal(switched.status, 302);
        absorb(jar, switched.cookie);
        assert.equal(sessionOf(jar).tenantId, first.id);

        const graceJar = {};
        identity.useSecondGoogleAccount();
        await followProvider(port, graceJar, "google", `/console/invite/${token}`);
        const invite = await call(port, "GET", `/console/invite/${token}`, { cookie: header(graceJar) });
        assert.equal(invite.status, 200);
        assert.match(invite.raw, /id="accept-invite"/);
        const accepted = await call(port, "POST", `/console/invite/${token}`, { cookie: header(graceJar) });
        assert.equal(accepted.status, 302);
        absorb(graceJar, accepted.cookie);
        const grace = sessionOf(graceJar);
        assert.equal(grace.provider, "google");
        assert.equal(grace.tenantId, first.id);
        const page = await call(port, "GET", "/console", { cookie: header(graceJar) });
        assert.equal(page.status, 200);
        assert.match(page.raw, /id="chip-hint">Admin</);
        assert.match(page.raw, /id="people-invite"/);
      });
    });

    await t.test("fake tools connect on the calendar and chat steps and fill the checklist", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_TOOLS_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Engines" });
        absorb(jar, created.cookie);
        const connect = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=calendar&choice=connect" });
        assert.equal(connect.location, "/console/welcome?step=calendar");
        const calendar = await call(port, "GET", connect.location, { cookie: header(jar) });
        assert.match(calendar.raw, /id="calendar-status">[\s\S]*?Connected/);
        assert.match(calendar.raw, /id="calendar-upcoming"/);
        assert.match(calendar.raw, /Send Sederunt to my meetings automatically/);
        assert.match(calendar.raw, /id="auto-join"[^>]*checked/);
        // Pretend meetings carry a clock time, not just a day.
        assert.match(calendar.raw, /class="ob-when">(Today|Tomorrow)<\/span><span class="ob-time">\d{1,2}:\d{2}\s?[AP]M<\/span>/);
        const off = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=calendar&choice=continue" });
        assert.equal(off.location, "/console/welcome?step=chat");
        const again = await call(port, "GET", "/console/welcome?step=calendar", { cookie: header(jar) });
        assert.doesNotMatch(again.raw, /id="auto-join"[^>]*checked/);
        await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=chat&choice=connect" });
        const chat = await call(port, "GET", "/console/welcome?step=chat", { cookie: header(jar) });
        assert.match(chat.raw, /id="slack-status">[\s\S]*?Connected/);
        const home = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.match(home.raw, /Calendar connected/);
        assert.match(home.raw, /Slack connected/);
        assert.match(home.raw, /2 of 4 done/);
        // Everything Home asks for is connected, so its "Connect tools" link steps aside.
        assert.match(home.raw, /id="home-connect-tools" hidden>/);
      });
    });

    await t.test("tool asks persist Later and Never without leaving the page", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const ready = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Engines" });
        absorb(jar, ready.cookie);
        const postPref = (body) => call(port, "POST", "/console/tool-prefs", {
          cookie: header(jar),
          body,
          headers: { "content-type": "application/json" },
        });
        const linear = await postPref(JSON.stringify({ tool: "linear", choice: "later" }));
        assert.equal(linear.status, 200);
        assert.equal(JSON.parse(linear.raw).prefs.linear, "later");
        const slackLater = await postPref(JSON.stringify({ tool: "slack", choice: "later" }));
        assert.equal(slackLater.status, 200);
        const afterLater = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.match(afterLater.raw, /"linear":"later"/);
        assert.match(afterLater.raw, /"slack":"later"/);
        assert.match(afterLater.raw, /id="tool-ask-calendar"/);
        assert.match(afterLater.raw, /id="tool-ask-slack"/);
        assert.match(afterLater.raw, /id="tool-ask-linear"/);
        assert.match(afterLater.raw, /id="file-ticket"/);
        assert.match(afterLater.raw, /Connect now/);
        assert.match(afterLater.raw, /Later/);
        assert.match(afterLater.raw, /Never/);
        const slackNever = await postPref(JSON.stringify({ tool: "slack", choice: "never" }));
        assert.equal(slackNever.status, 200);
        assert.equal(JSON.parse(slackNever.raw).prefs.slack, "never");
        assert.equal(JSON.parse(slackNever.raw).prefs.linear, "later");
        const afterNever = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.match(afterNever.raw, /"slack":"never"/);
        assert.match(afterNever.raw, /"linear":"later"/);
        const user = await identity.getUser(sessionOf(jar).accessToken);
        assert.equal(user.user_metadata.sederunt_tool_prefs.slack, "never");
        assert.equal(user.user_metadata.sederunt_tool_prefs.linear, "later");
        const refused = await postPref(JSON.stringify({ tool: "calendar", choice: "never" }));
        assert.equal(refused.status, 400);
        assert.match(refused.raw, /<!DOCTYPE html>/);
        assert.match(refused.raw, /That choice is not available\./);
        assert.doesNotMatch(refused.raw, /"ok"\s*:/);
        assertNoSecrets(refused, sessionOf(jar));
      });
    });

    assert.deepEqual(outbound, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

async function browserPath(chromium) {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(Boolean);
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next binary.
    }
  }
  try {
    const bundled = chromium.executablePath();
    await access(bundled);
    return bundled;
  } catch {
    return "";
  }
}

test("welcome shows the Slack bot as connected without a post channel", async () => {
  async function chatPage(label) {
    const env = {
      SEDERUNT_AUTH_FAKE: "1",
      SEDERUNT_SESSION_SECRET: SECRET,
      SEDERUNT_MEMBER: "Mina",
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_SIGNING_SECRET: "test-signing",
      SLACK_DEFAULT_CHANNEL: "C0DEMO",
    };
    const identity = createIdentity(env);
    const deps = defaultDeps({ env });
    deps.slack = {
      async channelLabel() { return label; },
      async authTest() { return { ok: true, teamId: "T0DEMO", teamName: "Demo" }; },
    };
    const app = createApp({ companyLoaded: true, env, identity, deps });
    const port = await listen(app);
    try {
      const jar = {};
      await followProvider(port, jar, "google", "/console");
      const welcome = await call(port, "GET", "/console", { cookie: header(jar) });
      assert.equal(welcome.status, 302);
      absorb(jar, welcome.cookie);
      const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Channel+Check" });
      assert.equal(created.status, 302);
      absorb(jar, created.cookie);
      // Honest Connected status requires verified ownership claim (not env doors alone).
      const connected = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=chat&choice=connect" });
      assert.equal(connected.status, 302);
      absorb(jar, connected.cookie);
      return await call(port, "GET", "/console/welcome?step=chat&slack=connected", { cookie: header(jar) });
    } finally {
      app.close();
    }
  }
  const named = await chatPage("sederunt-demo");
  assert.equal(named.status, 200);
  assert.match(named.raw, /id="slack-status">[\s\S]*?Connected/);
  assert.match(named.raw, /Slack is connected/);
  assert.doesNotMatch(named.raw, /id="ob-notice"/);
  assert.match(named.raw, /Bot connected/);
  assert.match(named.raw, /Add @Sederunt to a channel in Slack when you want it there/);
  assert.doesNotMatch(named.raw, /Posts to #|Where should Sederunt post|#C0DEMO|#sederunt-demo/);
  const blank = await chatPage("");
  assert.equal(blank.status, 200);
  assert.match(blank.raw, /id="slack-status">[\s\S]*?Connected/);
  assert.match(blank.raw, /Bot connected/);
  assert.doesNotMatch(blank.raw, /#C0DEMO|Posts to #/);
});

test("a second workspace with the same name is refused", async () => {
  await withServer({
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    SEDERUNT_MEMBER: "Mina",
  }, async (port) => {
    const jar = {};
    await followProvider(port, jar, "google", "/console");
    const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Northline" });
    assert.equal(created.status, 302);
    absorb(jar, created.cookie);
    const again = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=northline" });
    assert.equal(again.status, 400);
    assert.match(again.raw, /You already have a workspace with this name/);
    const home = await call(port, "GET", "/console", { cookie: header(jar) });
    assert.equal((home.raw.match(/role="menuitemradio"/g) || []).length, 1);
  });
});

test("onboarding screens fit at desktop and phone widths", { timeout: 180000 }, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return;
  }
  const executablePath = await browserPath(chromium);
  if (!executablePath) {
    t.skip("no browser binary found");
    return;
  }
  const env = {
    SEDERUNT_AUTH_FAKE: "1",
    SEDERUNT_AUTH_FAKE_GITHUB: "1",
    SEDERUNT_SESSION_SECRET: SECRET,
    SEDERUNT_MEMBER: "Mina",
  };
  const identity = createIdentity(env);
  const app = createApp({ companyLoaded: true, env, identity });
  const port = await listen(app);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  t.after(async () => {
    await browser.close();
    app.close();
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const outbound = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    const local = !host || host === "127.0.0.1" || host === "localhost" || host === "::1" || url.startsWith("data:") || url.startsWith("blob:");
    if (!local) {
      outbound.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const origin = `http://127.0.0.1:${port}`;

  async function fit(label, selectors) {
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const report = await page.evaluate((wanted) => {
      const doc = document.documentElement;
      const clipped = [];
      const outside = [];
      for (const selector of wanted) {
        for (const node of document.querySelectorAll(selector)) {
          if (node.closest("[hidden]")) continue;
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const text = (node.textContent || "").replace(/\s+/g, " ").trim();
          const rect = node.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) {
            if (text) clipped.push(`${selector} has no box`);
            continue;
          }
          if (rect.left < -1 || rect.right > window.innerWidth + 1) outside.push(text.slice(0, 48) || selector);
          const hidesX = style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis";
          if (text && hidesX && node.scrollWidth > node.clientWidth + 1) clipped.push(text.slice(0, 48));
          const hidesY = style.overflowY === "hidden" || style.overflowY === "clip";
          if (text && hidesY && node.scrollHeight > node.clientHeight + 1) clipped.push(`y:${text.slice(0, 48)}`);
        }
      }
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        clipped,
        outside,
      };
    }, selectors);
    assert.equal(report.overflow, false, `${label} overflows`);
    assert.deepEqual(report.clipped, [], `${label} clips ${JSON.stringify(report.clipped)}`);
    assert.deepEqual(report.outside, [], `${label} sits outside ${JSON.stringify(report.outside)}`);
  }

  const signSelectors = [".auth-card h1", "#auth-google span", ".auth-mark"];
  const stepSelectors = ["#ob-title", ".ob-sub", ".ob-count", ".ob-row-title", ".ob-row-meta", ".ob-soon", "#ob-continue", "#ob-skip", "#workspace-name", "#ob-bot-name", "#ob-bot-hint"];
  const teamSelectors = [...stepSelectors, "#invite-email", "#invite-role", "#invite-add", "#invite-send", ".ob-person-email", "#invite-link", "#copy-invite-link"];
  const homeSelectors = ["#checklist-title", "#checklist-count", ".check-title", ".check-go", "#checklist-dismiss"];
  const menuSelectors = ["#chip-name", "#chip-hint", "#workspace-menu .ws-copy span", "#create-workspace .ws-copy span"];
  const accountSelectors = [
    "#account-page-name",
    "#account-page-role",
    "#account-detail-email",
    "#account-detail-provider",
    "#account-detail-workspace",
    "#account-detail-role",
    "#account-edit",
    "#account-signout",
    "#bot-card",
    "#bot-name",
    "#bot-preview",
    "#bot-add-phrase",
    ".bot-phrase-row",
  ];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/sign-in`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#auth-google");
    const heights = await page.evaluate(() => ({
      google: document.getElementById("auth-google").getBoundingClientRect().height,
      github: document.getElementById("auth-github"),
      marks: document.querySelectorAll("svg.auth-logo").length,
      letters: document.querySelectorAll(".auth-letter").length,
    }));
    const min = width <= 768 ? 44 : 40;
    assert.ok(heights.google >= min, `Google button is ${heights.google}px at ${width}`);
    assert.equal(heights.github, null);
    assert.equal(heights.marks, 1);
    assert.equal(heights.letters, 0);
    await fit(`sign-in ${width}`, signSelectors);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click("#auth-google");
  await page.waitForSelector("#workspace-name", { timeout: 20000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/welcome`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#workspace-name");
    await fit(`welcome workspace ${width}`, stepSelectors);
  }
  await page.fill("#workspace-name", "Analytical Engines");
  await page.click("#ob-continue");
  await page.waitForSelector("#calendar-google", { timeout: 20000 });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/welcome?step=calendar`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#calendar-google");
    await fit(`welcome calendar ${width}`, stepSelectors);
    await page.goto(`${origin}/console/welcome?step=chat`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#chat-slack");
    await fit(`welcome chat ${width}`, stepSelectors);
    await page.goto(`${origin}/console/welcome?step=team`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#invite-email");
    await fit(`welcome team ${width}`, teamSelectors);
  }
  await page.fill("#invite-email", "grace@example.com, charles.babbage-difference-engine@example.com");
  await page.click("#invite-add");
  await page.waitForFunction(() => document.querySelectorAll("#invitee-list .ob-person").length === 2);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await fit(`welcome team added ${width}`, teamSelectors);
  }
  await page.click("#invite-send");
  await page.waitForSelector("#ob-done", { timeout: 20000 });
  await page.click("#ob-done");
  await page.waitForSelector("#chip-name", { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById("chip-name").textContent.trim() === "Analytical Engines");

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const loading = document.getElementById("loading");
      const name = document.getElementById("chip-name");
      return name && name.textContent.trim() === "Analytical Engines" && (!loading || loading.hidden);
    }, { timeout: 20000 });
    await page.waitForSelector("#home-checklist");
    await fit(`home checklist ${width}`, homeSelectors);
    if (width <= 1100) {
      await page.click("#rail-toggle");
      await page.waitForSelector("body.nav-open");
    }
    await page.click("#workspace-chip");
    await page.waitForSelector("#workspace-menu:not([hidden])");
    await fit(`switcher ${width}`, menuSelectors);
    const menuBox = await page.evaluate(() => {
      const menu = document.getElementById("workspace-menu");
      const rect = menu.getBoundingClientRect();
      return { right: rect.right, bottom: rect.bottom, width: rect.width, text: menu.textContent };
    });
    assert.ok(menuBox.right <= width + 1, `switcher menu past the right edge at ${width}`);
    assert.ok(menuBox.width > 0 && menuBox.width <= width, `switcher menu width at ${width}`);
    assert.match(menuBox.text, /Create workspace/);
    assert.doesNotMatch(menuBox.text, /Personal|Company|Team or/);

    await page.goto(`${origin}/console/account`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#account-page:not([hidden]) #account-page-name", { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById("account-page-name").textContent.trim() === "Ada Lovelace");
    const profile = await page.evaluate(() => ({
      name: document.getElementById("account-page-name").textContent.trim(),
      email: document.getElementById("account-detail-email").textContent.trim(),
      provider: document.getElementById("account-detail-provider").textContent.trim(),
      space: document.getElementById("account-detail-workspace").textContent.trim(),
      role: document.getElementById("account-detail-role").textContent.trim(),
    }));
    assert.equal(profile.name, "Ada Lovelace");
    assert.equal(profile.email, "ada@example.com");
    assert.equal(profile.provider, "Signed in with Google");
    assert.equal(profile.space, "Analytical Engines");
    assert.equal(profile.role, "Owner");
    await fit(`account ${width}`, accountSelectors);
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
});

test("invite from Home stays in a dialog", async () => {
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
  await withServer(env, async (port) => {
    const jar = {};
    await followProvider(port, jar, "google", "/console");
    const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Northwind" });
    absorb(jar, created.cookie);
    const people = await call(port, "GET", "/console/people", { cookie: header(jar) });
    assert.equal(people.status, 200);
    assert.match(people.raw, /<button[^>]*id="people-invite"[^>]*data-invite/);
    assert.match(people.raw, /function openInvite/);
    assert.doesNotMatch(people.raw, /\/console\/welcome\?step=team(?:&amp;|&)mode=manage/);
    const sheet = await call(port, "GET", "/api/console/invites", { cookie: header(jar), headers: { accept: "application/json" } });
    assert.equal(sheet.status, 200, sheet.raw);
    const opened = JSON.parse(sheet.raw);
    assert.equal(opened.ok, true);
    assert.equal(opened.workspaceName, "Northwind");
    assert.match(opened.link, /\/console\/join\/[A-Za-z0-9_-]{16,}/);
    const sent = await call(port, "POST", "/api/console/invites", {
      cookie: header(jar),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["grace@example.com"], roles: ["admin"] }),
    });
    assert.equal(sent.status, 200, sent.raw);
    const made = JSON.parse(sent.raw);
    assert.equal(made.ok, true);
    assert.equal(made.invites[0].email, "grace@example.com");
    assert.equal(made.invites[0].role, "admin");
    assert.match(made.invites[0].href, /\/console\/invite\//);
    const self = await call(port, "POST", "/api/console/invites", {
      cookie: header(jar),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: ["ada@example.com"], roles: ["member"] }),
    });
    assert.equal(self.status, 400);
    assert.match(self.raw, /Remove your own address/);
  });
});

test("a console page reads the workspace list once", async () => {
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
  const identity = createIdentity({ ...env, SEDERUNT_AUTH_FAKE_GITHUB: "1" });
  const original = identity.myTenants.bind(identity);
  let calls = 0;
  identity.myTenants = async (token) => {
    calls += 1;
    return original(token);
  };
  const app = createApp({ companyLoaded: true, env, identity });
  const port = await listen(app);
  try {
    const jar = {};
    await followProvider(port, jar, "google", "/console");
    const created = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=create&name=Northwind" });
    absorb(jar, created.cookie);
    calls = 0;
    const home = await call(port, "GET", "/console", { cookie: header(jar) });
    assert.equal(home.status, 200, home.raw.slice(0, 300));
    assert.equal(calls, 1);
    calls = 0;
    const people = await call(port, "GET", "/console/people", { cookie: header(jar) });
    assert.equal(people.status, 200);
    assert.equal(calls, 1);
    const style = await call(port, "GET", "/console.css");
    assert.equal(style.status, 200);
    assert.match(style.cache, /public, max-age=3600/);
    const again = await call(port, "GET", "/console.css");
    assert.equal(again.raw, style.raw);
  } finally {
    app.close();
  }
});

test("upcoming meetings show start times when the calendar lists them", async () => {
  const now = Date.now();
  const iso = (minutes) => new Date(now + minutes * 60_000).toISOString();
  const env = { CALENDAR_TIME_ZONE: "UTC" };
  const listed = {
    async listUpcoming() {
      return [
        { id: "later", title: "Board readout", start: iso(240), end: iso(300) },
        { id: "past", title: "Standup", start: iso(-120), end: iso(-90) },
        { id: "soon", title: "Launch review", start: iso(30), end: iso(60) },
      ];
    },
    async readDay() { throw new Error("listUpcoming should be used"); },
  };
  const read = await upcomingMeetings({ env, calendar: listed }, false);
  assert.equal(read.unavailable, false);
  assert.deepEqual(read.rows.map((row) => row.title), ["Launch review", "Board readout"]);
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso(30)));
  assert.equal(read.rows[0].time, clock);
  assert.match(read.rows[0].when, /^(Today|Tomorrow)$/);

  const titlesOnly = { async readDay() { return { events: ["Design crit"], unavailable: false }; } };
  const old = await upcomingMeetings({ env, calendar: titlesOnly }, false);
  assert.equal(old.rows[0].title, "Design crit");
  assert.equal(old.rows[0].time, "");

  const fake = await upcomingMeetings({ env, calendar: null }, true);
  assert.equal(fake.rows.length, 3);
  fake.rows.forEach((row) => assert.match(row.time, /^\d{1,2}:\d{2}\s?[AP]M$/));
});

test("the fake calendar's seeded meetings come through with their start times", async () => {
  const { createFakeCalendarAdapter } = await import("../src/calendar/fake.js");
  const env = { SEDERUNT_AUTH_FAKE: "1", CALENDAR_TIME_ZONE: "Asia/Ho_Chi_Minh" };
  const calendar = createFakeCalendarAdapter(env, { timeZone: "Asia/Ho_Chi_Minh" });
  const read = await upcomingMeetings({ env, calendar }, false);
  const sync = read.rows.find((row) => row.title === "Customer sync");
  assert.ok(sync, "tomorrow's seeded meeting is listed");
  assert.equal(sync.when, "Tomorrow");
  assert.match(sync.time, /^10:00\s?AM$/);
});

test("Connect Slack opens the install page in a new tab and does not open Slack docs", () => {
  const install = renderWelcomePage({ step: "chat", slackInstall: true });
  assert.match(install, /id="slack-connect"[^>]*formtarget="_blank"/);
  assert.doesNotMatch(install, /docs\.slack\.dev/);
  const plain = renderWelcomePage({ step: "chat" });
  assert.doesNotMatch(plain, /id="slack-connect"[^>]*formtarget=/);
  assert.doesNotMatch(plain, /docs\.slack\.dev/);
});
