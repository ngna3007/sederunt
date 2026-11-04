import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { openSession } from "../src/console-auth.js";
import { createIdentity } from "../src/identity/client.js";
import { createApp } from "../src/server.js";

const SECRET = "session-secret";
const WIDTHS = [1920, 1097, 768, 390];
const GITHUB_NOTICE = /GitHub sign-in isn't turned on yet\. Use Google or ask your admin\./;

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
  const identity = createIdentity(env);
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
    await t.test("first sign-in opens welcome and Just me lands in Personal", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_MEMBER: "Mina" };
      await withServer(env, async (port) => {
        const sign = await call(port, "GET", "/console/sign-in");
        assert.equal(sign.status, 200);
        assert.match(sign.raw, /class="auth-logo"/);
        assert.doesNotMatch(sign.raw, /auth-letter/);
        assert.doesNotMatch(sign.raw, />G</);
        assert.doesNotMatch(sign.raw, />Gh</);
        const github = await call(port, "GET", "/console/auth/github");
        assert.equal(github.status, 200);
        assert.equal(github.location, "");
        assert.match(github.raw, GITHUB_NOTICE);

        const jar = {};
        const done = await followProvider(port, jar, "google", "/console");
        assert.equal(done.location, "/console");
        const welcome = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(welcome.status, 302);
        assert.equal(welcome.location, "/console/welcome");
        absorb(jar, welcome.cookie);
        const choices = await call(port, "GET", "/console/welcome", { cookie: header(jar) });
        assert.equal(choices.status, 200);
        assert.match(choices.raw, /role="radiogroup"/);
        assert.match(choices.raw, /id="choice-personal"/);
        assert.match(choices.raw, /Just me/);
        assert.match(choices.raw, /id="choice-team"/);
        assert.match(choices.raw, /My team/);
        assert.match(choices.raw, /id="choice-company"/);
        assert.match(choices.raw, /My company/);
        assert.match(choices.raw, /id="skip-onboarding"/);
        assert.match(choices.raw, /Skip for now/);

        const home = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "kind=personal" });
        assert.equal(home.status, 302);
        assert.equal(home.location, "/console");
        absorb(jar, home.cookie);
        const session = sessionOf(jar);
        assert.equal(session.ok, true);
        assert.equal(session.provider, "google");
        assert.equal(session.onboarded, true);
        const page = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(page.status, 200);
        assert.match(page.raw, /id="chip-name">Personal</);
        assert.match(page.raw, /Personal · Owner/);
        const account = await call(port, "GET", "/console/account", { cookie: header(jar) });
        assert.equal(account.status, 200);
        assert.match(account.raw, /id="account-page-name"[^>]*>Ada Lovelace</);
        assert.match(account.raw, /id="account-detail-email">ada@example.com</);
        assert.match(account.raw, /id="account-detail-provider">Signed in with Google</);
        assert.match(account.raw, /id="account-detail-workspace">Personal</);
        assert.match(account.raw, /id="account-detail-role">Owner</);
        assert.match(account.raw, /id="account-page-avatar"[^>]*>AL</);
        assert.match(account.raw, /data-member=""/);
        assertNoSecrets(account, session);
        assertNoSecrets(page, session);
        const stayed = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(stayed.status, 200);
        assert.equal(stayed.location, "");
      });
    });

    await t.test("skip finishes onboarding in the Personal space", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const skipped = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "action=skip" });
        assert.equal(skipped.status, 302);
        assert.equal(skipped.location, "/console");
        absorb(jar, skipped.cookie);
        const session = sessionOf(jar);
        assert.equal(session.onboarded, true);
        const tenants = await identity.myTenants(session.accessToken);
        const personal = tenants.find((row) => row.kind === "personal");
        assert.equal(session.tenantId, personal.id);
        const home = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(home.status, 200);
        assert.match(home.raw, /id="chip-name">Personal</);
        assert.doesNotMatch(home.raw, /How will you use Sederunt/);
      });
    });

    await t.test("a team with two invites can be switched to and accepted", async () => {
      const env = {
        SEDERUNT_AUTH_FAKE: "1",
        SEDERUNT_AUTH_FAKE_GITHUB: "1",
        SEDERUNT_SESSION_SECRET: SECRET,
      };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const invalid = await call(port, "POST", "/console/welcome", {
          cookie: header(jar),
          body: "action=create&kind=team&name=&emails=not-an-email",
        });
        assert.equal(invalid.status, 400);
        assert.match(invalid.raw, /<!DOCTYPE html>/);
        assert.match(invalid.raw, /id="space-error"/);
        assert.match(invalid.raw, /Enter a name, from 1 to 120 characters\./);
        assert.doesNotMatch(invalid.raw, /"error"\s*:/);

        const emails = encodeURIComponent("grace@example.com\ncharles@example.com");
        const created = await call(port, "POST", "/console/welcome", {
          cookie: header(jar),
          body: `action=create&kind=team&name=Analytical+Engines&emails=${emails}`,
        });
        assert.equal(created.status, 200);
        assert.match(created.raw, /Analytical Engines is ready/);
        assert.match(created.raw, /does not send email yet/);
        assert.match(created.raw, /grace@example.com/);
        assert.match(created.raw, /charles@example.com/);
        const tokens = [...created.raw.matchAll(/\/console\/invite\/([a-f0-9]{20,})/g)].map((match) => match[1]);
        assert.equal(new Set(tokens).size, 2);
        absorb(jar, created.cookie);
        const ada = sessionOf(jar);
        assert.equal(ada.onboarded, true);
        const tenants = await identity.myTenants(ada.accessToken);
        const team = tenants.find((row) => row.name === "Analytical Engines");
        const personal = tenants.find((row) => row.kind === "personal");
        assert.equal(team.kind, "team");
        assert.equal(team.role, "owner");
        assert.equal(ada.tenantId, team.id);

        const listed = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(listed.status, 200);
        assert.match(listed.raw, /id="chip-name">Analytical Engines</);
        assert.match(listed.raw, /Team · Owner/);
        assert.match(listed.raw, />Personal</);
        assert.match(listed.raw, /Create a space/);
        assert.match(listed.raw, new RegExp(`name="tenant" value="${personal.id}"`));
        assert.match(listed.raw, new RegExp(`name="tenant" value="${team.id}"`));
        assertNoSecrets(listed, ada);

        const switched = await call(port, "POST", "/console/space", {
          cookie: header(jar),
          body: `tenant=${encodeURIComponent(personal.id)}`,
        });
        assert.equal(switched.status, 302);
        assert.equal(switched.location, "/console");
        absorb(jar, switched.cookie);
        assert.equal(sessionOf(jar).tenantId, personal.id);
        const personalHome = await call(port, "GET", "/console", { cookie: header(jar) });
        assert.equal(personalHome.status, 200);
        assert.match(personalHome.raw, /id="chip-name">Personal</);
        assert.match(personalHome.raw, new RegExp(`data-tenant="${personal.id}"[^>]*aria-checked="true"`));

        const anon = await call(port, "GET", `/console/invite/${tokens[0]}`);
        assert.equal(anon.status, 302);
        assert.match(anon.location, new RegExp(`/console/sign-in\\?next=${encodeURIComponent(`/console/invite/${tokens[0]}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

        const graceJar = {};
        const graceIn = await followProvider(port, graceJar, "github", `/console/invite/${tokens[0]}`);
        assert.equal(graceIn.location, `/console/invite/${tokens[0]}`);
        const invite = await call(port, "GET", `/console/invite/${tokens[0]}`, { cookie: header(graceJar) });
        assert.equal(invite.status, 200);
        assert.match(invite.raw, /id="accept-invite"/);
        const accepted = await call(port, "POST", `/console/invite/${tokens[0]}`, { cookie: header(graceJar) });
        assert.equal(accepted.status, 302);
        assert.equal(accepted.location, "/console");
        absorb(graceJar, accepted.cookie);
        const grace = sessionOf(graceJar);
        assert.equal(grace.tenantId, team.id);
        assert.equal(grace.provider, "github");
        const joined = await call(port, "GET", "/console/account", { cookie: header(graceJar) });
        assert.equal(joined.status, 200);
        assert.match(joined.raw, /id="chip-name">Analytical Engines</);
        assert.match(joined.raw, /Team · Member/);
        assert.match(joined.raw, /id="account-page-name"[^>]*>Grace Hopper</);
        assert.match(joined.raw, /id="account-detail-email">grace@example.com</);
        assert.match(joined.raw, /Signed in with GitHub/);
        assert.match(joined.raw, /id="account-detail-role">Member</);
        assertNoSecrets(joined, grace);
        const membership = await identity.myTenants(grace.accessToken);
        assert.equal(membership.find((row) => row.id === team.id).role, "member");
      });
    });

    await t.test("tool asks persist Later and Never without leaving the page", async () => {
      const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET };
      await withServer(env, async (port, identity) => {
        const jar = {};
        await followProvider(port, jar, "google", "/console");
        const ready = await call(port, "POST", "/console/welcome", { cookie: header(jar), body: "kind=personal" });
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
  const env = { SEDERUNT_AUTH_FAKE: "1", SEDERUNT_SESSION_SECRET: SECRET, SEDERUNT_MEMBER: "Mina" };
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

  const signSelectors = [".auth-card h1", "#auth-google span", "#auth-github span", ".auth-mark"];
  const choiceSelectors = ["#welcome-title", ".page-lede", ".choice-title", ".choice-copy", "#skip-onboarding"];
  const nameSelectors = ["#welcome-title", ".page-lede", "#space-form label", "#space-name", "#space-emails", "#space-domain", "#space-submit", "#skip-onboarding"];
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
  ];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/sign-in`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#auth-google");
    const heights = await page.evaluate(() => ({
      google: document.getElementById("auth-google").getBoundingClientRect().height,
      github: document.getElementById("auth-github").getBoundingClientRect().height,
      marks: document.querySelectorAll("svg.auth-logo").length,
      letters: document.querySelectorAll(".auth-letter").length,
    }));
    const min = width <= 768 ? 44 : 40;
    assert.ok(heights.google >= min, `Google button is ${heights.google}px at ${width}`);
    assert.ok(heights.github >= min, `GitHub button is ${heights.github}px at ${width}`);
    assert.equal(heights.marks, 2);
    assert.equal(heights.letters, 0);
    await fit(`sign-in ${width}`, signSelectors);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click("#auth-google");
  await page.waitForSelector("#choice-personal", { timeout: 20000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console/welcome`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#choice-company");
    await fit(`welcome choice ${width}`, choiceSelectors);
    await page.goto(`${origin}/console/welcome?kind=team`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#space-name");
    await fit(`welcome team ${width}`, nameSelectors);
    await page.goto(`${origin}/console/welcome?kind=company`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#space-domain");
    await fit(`welcome company ${width}`, nameSelectors);
  }

  await page.click("#skip-onboarding");
  await page.waitForSelector("#chip-name", { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById("chip-name").textContent.trim() === "Personal");

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/console`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const loading = document.getElementById("loading");
      const name = document.getElementById("chip-name");
      return name && name.textContent.trim() === "Personal" && (!loading || loading.hidden);
    }, { timeout: 20000 });
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
      return { right: rect.right, bottom: rect.bottom, width: rect.width };
    });
    assert.ok(menuBox.right <= width + 1, `switcher menu past the right edge at ${width}`);
    assert.ok(menuBox.width > 0 && menuBox.width <= width, `switcher menu width at ${width}`);

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
    assert.equal(profile.space, "Personal");
    assert.equal(profile.role, "Owner");
    await fit(`account ${width}`, accountSelectors);
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
});
