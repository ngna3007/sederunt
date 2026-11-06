import assert from "node:assert/strict";
import test from "node:test";
import { renderConsolePage } from "../src/console-page.js";

test("the proof panel and Why panel show chain times in the viewer's zone, not raw ISO", () => {
  const page = renderConsolePage();
  assert.match(page, /function chainWhen\(iso\)/);
  assert.match(page, /\["Checkpoint time", chainWhen\(proof\.checkpointTime\)\]/);
  assert.match(page, /bits\.push\(chainWhen\(memory\.at\) \|\| memory\.at\)/);
  assert.equal(page.includes('["Checkpoint time", proof.checkpointTime'), false);
});
