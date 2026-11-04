import assert from "node:assert/strict";
import test from "node:test";
import { GrpcTypes, GrpcWebFetchTransport, SuiGrpcClient } from "@mysten/sui/grpc";
import { createTatumClient } from "../src/tatum/client.js";
import { createTatumReader } from "../src/tatum/get-object.js";
import { frameMessage } from "../src/tatum/transport.js";

const OBJECT_ID = "0x4c6ea9e8c622c9777966063fb8b04266f7963795017461625916d4c3b8fb058d";
const KEY = "tatum-key-wiresecret";

test("the default Sui transport speaks grpc-web and the Tatum transport speaks native grpc", async () => {
  let webType = "";
  const web = new SuiGrpcClient({
    network: "mainnet",
    baseUrl: "https://example.invalid",
    fetch: async (_url, init) => {
      webType = init.headers?.get?.("content-type") || "";
      return new Response(null, { status: 415, statusText: "unsupported" });
    },
  });
  await assert.rejects(() => Promise.resolve(web.ledgerService.getObject({ objectId: OBJECT_ID })));
  assert.match(webType, /grpc-web/);

  const seen = [];
  const native = createTatumClient({
    apiKey: KEY,
    retries: 0,
    exchange: async (call) => {
      seen.push(call);
      return { grpcStatus: "13", httpStatus: "200", body: Buffer.alloc(0) };
    },
  });
  await assert.rejects(() => native.getObject(OBJECT_ID));
  assert.equal(seen[0].headers["content-type"], "application/grpc");
  assert.equal(seen[0].headers["content-type"].includes("grpc-web"), false);
  assert.equal(seen.length, 1);
  assert.ok(GrpcWebFetchTransport);
});

test("calls are spaced by the shared throttle", async () => {
  const waits = [];
  let clock = 0;
  const client = createTatumClient({
    apiKey: KEY,
    rps: 3,
    retries: 0,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    exchange: async () => ({ grpcStatus: "0", httpStatus: "200", body: objectFrame() }),
  });
  await Promise.all([client.getObject(OBJECT_ID), client.getObject(OBJECT_ID)]);
  assert.equal(waits.length, 1);
  assert.ok(Math.abs(waits[0] - (1000 / 3)) < 1);
  assert.equal(client.wireCalls(), 2);
});

test("a resource-exhausted call backs off and then succeeds", async () => {
  const waits = [];
  let tries = 0;
  let clock = 0;
  const client = createTatumClient({
    apiKey: KEY,
    rps: 1000,
    retries: 2,
    random: () => 0,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    exchange: async () => {
      tries += 1;
      if (tries < 3) return { grpcStatus: "8", httpStatus: "200", body: Buffer.alloc(0) };
      return { grpcStatus: "0", httpStatus: "200", body: objectFrame() };
    },
  });
  const object = await client.getObject(OBJECT_ID);
  assert.equal(object.objectId, OBJECT_ID);
  assert.deepEqual(waits, [200, 400]);
  assert.equal(tries, 3);
  assert.equal(client.log.filter((entry) => entry.outcome === "retry").length, 2);
  assert.equal(client.wireCalls(), 3);
});

test("retries exhausted surface as a rate limit and a missing key never calls", async () => {
  let opened = false;
  const limited = createTatumReader({ TATUM_API_KEY: KEY }, {
    retries: 1,
    rps: 1000,
    random: () => 0,
    now: () => 0,
    sleep: async () => {},
    exchange: async () => {
      opened = true;
      return { httpStatus: "429", grpcStatus: "", body: Buffer.alloc(0) };
    },
  });
  await assert.rejects(() => limited.getObject(OBJECT_ID), (error) => error.code === "rate-limit");
  assert.equal(opened, true);
  assert.equal(limited.log.filter((entry) => entry.outcome === "error").length, 1);

  opened = false;
  const bare = createTatumClient({ env: {} });
  await assert.rejects(() => bare.getObject(OBJECT_ID), /Tatum key not set/);
  assert.equal(opened, false);
  assert.equal(bare.log.length, 0);
  assert.equal(bare.sui, null);
});

test("the key is removed from errors and never written to the log", async () => {
  const client = createTatumClient({
    apiKey: KEY,
    retries: 0,
    rps: 1000,
    exchange: async () => {
      throw new Error(`nope ${KEY}`);
    },
  });
  await assert.rejects(() => client.getObject(OBJECT_ID), (error) => {
    assert.equal(String(error.message).includes(KEY), false);
    assert.match(error.message, /\[redacted\]/);
    return true;
  });
  assert.equal(JSON.stringify(client.log).includes(KEY), false);

  const reader = createTatumReader({ TATUM_API_KEY: KEY }, {
    retries: 0,
    rps: 1000,
    exchange: async () => {
      throw new Error(`nope ${KEY}`);
    },
  });
  await assert.rejects(() => reader.getObject(OBJECT_ID), (error) => {
    assert.equal(error.message, "Tatum read failed");
    assert.equal(String(error.message).includes(KEY), false);
    return true;
  });
  assert.equal(JSON.stringify(reader.log).includes(KEY), false);
});

test("checkpoint and transaction reads are cached and are not a second wire call", async () => {
  let wires = 0;
  const client = createTatumClient({
    apiKey: KEY,
    retries: 0,
    rps: 1000,
    exchange: async (call) => {
      wires += 1;
      if (call.path.endsWith("/GetServiceInfo")) return { grpcStatus: "0", body: serviceFrame(10) };
      if (call.path.endsWith("/GetCheckpoint")) return { grpcStatus: "0", body: checkpointFrame(10) };
      return { grpcStatus: "13", body: Buffer.alloc(0) };
    },
  });
  const first = await client.refreshChain();
  const second = await client.refreshChain();
  assert.equal(first.checkpoint, 10);
  assert.equal(second.checkpoint, 10);
  assert.equal(wires, 3);
  assert.equal(client.log.filter((entry) => entry.outcome === "cached").length, 1);
  assert.equal(client.wireCalls(), 3);
});

function objectFrame() {
  return frameMessage(GrpcTypes.GetObjectResponse.toBinary({
    object: {
      objectId: OBJECT_ID,
      version: 4n,
      digest: "GfKGew",
      objectType: "pkg::blob::Blob",
    },
  }));
}

function serviceFrame(height) {
  return frameMessage(GrpcTypes.GetServiceInfoResponse.toBinary({
    checkpointHeight: BigInt(height),
    timestamp: { seconds: 1700000000n, nanos: 0 },
  }));
}

function checkpointFrame(height) {
  return frameMessage(GrpcTypes.GetCheckpointResponse.toBinary({
    checkpoint: {
      sequenceNumber: BigInt(height),
      transactions: [],
      summary: {
        timestamp: { seconds: 1700000001n, nanos: 0 },
        commitments: [],
      },
    },
  }));
}
