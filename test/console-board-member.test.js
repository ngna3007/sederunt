import assert from "node:assert/strict";
import test from "node:test";
import { consoleBoardMember } from "../src/server.js";

test("an oauth company board is read as the configured member", () => {
  const env = { SEDERUNT_MEMBER: "mina" };
  const oauth = { kind: "oauth", memberId: "user-ada" };
  assert.equal(consoleBoardMember(oauth, env, "company", "henry"), "mina");
  assert.equal(consoleBoardMember(oauth, env, "", "henry"), "mina");
  assert.equal(consoleBoardMember(oauth, env, "personal", "henry"), "user-ada");
  assert.equal(consoleBoardMember({ memberId: "mina" }, env, "company", "henry"), "mina");
  assert.equal(consoleBoardMember(null, env, "company", "henry"), "henry");
  assert.equal(consoleBoardMember(oauth, {}, "company", ""), "user-ada");
});
