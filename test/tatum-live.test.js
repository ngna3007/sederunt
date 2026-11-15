import assert from "node:assert/strict";
import test from "node:test";
import { createTatumClient } from "../src/tatum/client.js";

/** Live mainnet reads stay off unless the operator opts in with a real key. */
export function tatumLiveEnabled(env = process.env) {
  const key = typeof env.TATUM_API_KEY === "string" ? env.TATUM_API_KEY.trim() : "";
  return key.length > 0 && env.TATUM_LIVE === "1";
}

test("Tatum live mainnet read is skipped unless TATUM_LIVE=1 and TATUM_API_KEY are set", async (t) => {
  if (!tatumLiveEnabled()) {
    t.skip("TATUM_LIVE=1 and TATUM_API_KEY are required; a skip is not a live pass");
    return;
  }
  const key = process.env.TATUM_API_KEY.trim();
  const client = createTatumClient({ apiKey: key, timeoutMs: 8000, retries: 1, rps: 1 });
  const started = Date.now();
  const info = await client.getServiceInfo();
  assert.equal(Number.isInteger(info.checkpoint) && info.checkpoint > 0, true);
  assert.equal(JSON.stringify(client.log).includes(key), false);
  assert.equal(String(info.checkpoint).includes(key), false);
  t.diagnostic(`checkpoint ${info.checkpoint} in ${Date.now() - started}ms`);
});

test("the live guard is false when the key or the opt-in flag is absent", () => {
  assert.equal(tatumLiveEnabled({}), false);
  assert.equal(tatumLiveEnabled({ TATUM_API_KEY: "present" }), false);
  assert.equal(tatumLiveEnabled({ TATUM_LIVE: "1" }), false);
  assert.equal(tatumLiveEnabled({ TATUM_LIVE: "1", TATUM_API_KEY: "present" }), true);
});
