import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DECISION_COLUMNS, PEOPLE_COLUMNS, ROOM_COLUMNS, renderConsolePage } from "../src/console-page.js";
import { renderSignInPage } from "../src/console-sign-in.js";

test("each table header has one cell for every row cell", () => {
  const html = renderConsolePage({ signedIn: true });
  const rooms = html.slice(html.indexOf('class="explorer-head"'), html.indexOf('id="room-empty"'));
  assert.equal(rooms.match(/<span/g).length, ROOM_COLUMNS.length);
  assert.equal(ROOM_COLUMNS.length, 5);
  const decisions = html.slice(html.indexOf("decision-head"), html.indexOf('id="record-list"'));
  assert.equal(decisions.match(/<span/g).length, DECISION_COLUMNS.length);
  const source = readFileSync(new URL("../src/console-page.js", import.meta.url), "utf8");
  assert.equal(source.match(/card\.append\(roomCol, where, heard, status, view\)/)[0].split(",").length, ROOM_COLUMNS.length);
  assert.equal(source.match(/row\.append\(name, roomsCell, decisions, heard, view\)/)[0].split(",").length, PEOPLE_COLUMNS.length);
  assert.equal(source.match(/card\.append\(main, roomCell, badge, view\)/)[0].split(",").length, DECISION_COLUMNS.length);
  const css = readFileSync(new URL("../src/console.css", import.meta.url), "utf8");
  assert.match(css, /#rooms \.explorer-head,\n#rooms a\.room,\n#rooms button\.room:not\(\.decision-row\) \{\n  grid-template-columns: var\(--table-rooms\);/);
  assert.match(css, /\.people-head,\n\.people-row \{\n  grid-template-columns: var\(--table-people\);/);
});

test("sign-in tells the reader where the passphrase comes from", () => {
  const page = renderSignInPage({ configured: true, memberSet: true });
  assert.match(page, /Ask your workspace admin for the console passphrase/);
});
