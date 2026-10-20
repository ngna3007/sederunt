import assert from "node:assert/strict";
import test from "node:test";
import { renderPage } from "../src/page.js";

test("the screen shows the note, the allow, and the Linear id, and hides account material", () => {
  const html = renderPage({
    pending: null,
    items: [
      {
        kind: "note",
        status: "recorded",
        text: "Da Nang offsite in March",
        issueId: null,
        accountId: "0xcc676d194cedb54debdd54b426d803aade415299a3637132825f8563ae5ddd33",
        key: "should-not-render",
      },
      {
        kind: "ticket",
        status: "filed",
        text: "File the venue ticket hall",
        issueId: "ROW-44",
      },
    ],
  });
  assert.match(html, /Da Nang offsite in March/);
  assert.match(html, /recorded/);
  assert.match(html, /Allow is off/);
  assert.match(html, /ROW-44/);
  assert.match(html, /Note, question, or ticket/);
  assert.match(html, /<button class="filled" type="submit">Record<\/button>/);
  assert.ok(html.indexOf("Da Nang offsite in March") < html.indexOf("File the venue ticket hall"));
  assert.ok(html.indexOf("File the venue ticket hall") < html.indexOf("Note, question, or ticket"));
  assert.doesNotMatch(html, /0xcc676d/);
  assert.doesNotMatch(html, /should-not-render/);
  assert.doesNotMatch(html, /Allow this write/);
  assert.doesNotMatch(html, /No notes yet/);
});

test("an empty record names the field and says no notes yet", () => {
  const html = renderPage({ pending: null, items: [] });
  assert.match(html, /Allow is off/);
  assert.match(html, /No notes yet/);
  assert.match(html, /Note, question, or ticket/);
  assert.match(html, /<button class="filled" type="submit">Record<\/button>/);
  assert.ok(html.indexOf("No notes yet") < html.indexOf("Note, question, or ticket"));
  assert.doesNotMatch(html, /File venue ticket/);
});

test("a proposed write shows its own allow button and still hides account material", () => {
  const html = renderPage({
    pending: { title: "File the venue ticket hall", tool: "linear.create_issue" },
    items: [
      {
        kind: "ticket",
        status: "recorded",
        text: "File the venue ticket hall",
        issueId: null,
        accountId: "0xcc676d194cedb54debdd54b426d803aade415299a3637132825f8563ae5ddd33",
        key: "should-not-render",
      },
    ],
  });
  assert.match(html, /Allow is off/);
  assert.match(html, /File the venue ticket hall/);
  assert.match(html, /Yes files this write only/);
  assert.match(html, /<button class="filled" type="submit">File venue ticket<\/button>/);
  assert.match(html, /<button class="plain" type="submit">Record<\/button>/);
  assert.match(html, /name="text" value="yes"/);
  assert.ok(html.indexOf("Yes files this write only") < html.indexOf('id="items"'));
  assert.doesNotMatch(html, /<dt>Linear<\/dt>/);
  assert.doesNotMatch(html, /0xcc676d/);
  assert.doesNotMatch(html, /should-not-render/);
});

test("a Linear answer lists each issue once and says the read created nothing", () => {
  const html = renderPage({
    pending: null,
    items: [
      {
        kind: "answer",
        status: "recorded",
        text: [
          "What tickets are open for the trip?",
          "team ROW",
          "Matching the trip:",
          "ROW-8 Typed Linear read Done",
          "Open issues read from team ROW:",
          "ROW-8 Typed Linear read Done",
          "ROW-20 File the venue ticket Backlog",
          "This read created nothing.",
        ].join("\n"),
        issueId: null,
      },
    ],
  });
  assert.match(html, /This read created nothing/);
  assert.match(html, /team ROW/);
  assert.match(html, /What tickets are open for the trip/);
  assert.equal((html.match(/ROW-8/g) || []).length, 2);
  assert.match(html, /ROW-20/);
  assert.match(html, /<dt>Status<\/dt><dd>recorded<\/dd>/);
  assert.doesNotMatch(html, /<details>/);
  assert.doesNotMatch(html, /<dt>Linear<\/dt>/);
});
