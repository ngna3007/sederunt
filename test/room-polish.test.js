import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderConsolePage, speakerLabel } from "../src/console-page.js";

test("a bare member id reads as a display name", () => {
  assert.equal(speakerLabel("daniel"), "Daniel");
  assert.equal(speakerLabel("mina.tran"), "Mina Tran");
  assert.equal(speakerLabel("Rowan Lee"), "Rowan Lee");
  assert.equal(speakerLabel("0xabc"), "");
});

test("the room header hides an empty start and links the proof as a chip", async () => {
  const page = renderConsolePage();
  assert.match(page, /id="file-started-item" hidden/);
  assert.match(page, /<a id="file-proof" class="badge ok proof-chip" href="#proof-panel" hidden><\/a>/);
  assert.match(page, /classList\.add\("no-recording"\)/);
  const css = await readFile(new URL("../src/console.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /^(<<<<<<<|=======|>>>>>>>)/m);
  assert.match(css, /\.room-left\.no-recording \.player \{[\s\S]*?aspect-ratio: auto !important;/);
});
