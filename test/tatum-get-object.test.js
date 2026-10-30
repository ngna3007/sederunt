import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createTatumReader } from "../src/tatum/get-object.js";

const OBJECT_ID = "0x4c6ea9e8c622c9777966063fb8b04266f7963795017461625916d4c3b8fb058d";
const BLOB_ID = "YhkR9vHVSXI1vjAINsKqd_vpouxWyorW5MqacAW3d3k";

test("no key records the id and does not open the gateway", async () => {
  let opened = false;
  const reader = createTatumReader({}, {
    async exchange() {
      opened = true;
      return { grpcStatus: "0", body: Buffer.alloc(0) };
    },
    async locate() {
      opened = true;
      return { objectId: OBJECT_ID, checkpoint: 1 };
    },
  });
  await assert.rejects(() => reader.getObject(BLOB_ID), /Tatum read failed/);
  assert.equal(opened, false);
  assert.deepEqual(reader.calls, [BLOB_ID]);
});

test("GetObject is one native gRPC frame and the object page shows its version", async () => {
  const seen = [];
  const reader = createTatumReader({ TATUM_API_KEY: "tatum-key-wiresecret" }, {
    async exchange(call) {
      seen.push(call);
      assert.equal(call.path, "/sui.rpc.v2.LedgerService/GetObject");
      assert.equal(call.headers["content-type"], "application/grpc");
      assert.equal(call.headers["x-api-key"], "tatum-key-wiresecret");
      assert.equal(call.body[0], 0);
      assert.equal(call.body.readUInt32BE(1), call.body.length - 5);
      assert.ok(call.body.includes(Buffer.from(OBJECT_ID)));
      for (const path of ["object_id", "version", "digest", "object_type"]) {
        assert.ok(call.body.includes(Buffer.from(path)));
      }
      assert.throws(() => JSON.parse(call.body.toString("utf8")));
      return { grpcStatus: "0", httpStatus: "200", body: objectFrame() };
    },
  });
  const object = await reader.getObject(OBJECT_ID);
  assert.equal(seen.length, 1);
  assert.equal(object.objectId, OBJECT_ID);
  assert.equal(object.version, 1062018188);
  assert.equal(object.objectType, "pkg::blob::Blob");
  assert.equal(object.digest, "GfKGew");
  assert.equal(object.text, "");
  assert.equal(object.checkpoint, null);
  assert.equal(JSON.stringify(object).includes("tatum-key-wiresecret"), false);

  const failed = createTatumReader({ TATUM_API_KEY: "tatum-key-wiresecret" }, {
    async exchange() {
      return { grpcStatus: "13", httpStatus: "200", body: Buffer.alloc(0) };
    },
  });
  await assert.rejects(() => failed.getObject(OBJECT_ID), (error) => {
    assert.equal(error.message, "Tatum read failed");
    assert.equal(String(error.message).includes("tatum-key-wiresecret"), false);
    return true;
  });

  const limited = createTatumReader({ TATUM_API_KEY: "tatum-key-wiresecret" }, {
    async exchange() {
      return { grpcStatus: "8", httpStatus: "200", rateLimited: true, body: Buffer.alloc(0) };
    },
  });
  await assert.rejects(() => limited.getObject(OBJECT_ID), (error) => error.code === "rate-limit");

  const app = createApp({
    deps: {
      tatum: {
        async getObject() {
          return { text: "", checkpoint: 338404208, objectId: OBJECT_ID, version: 1062018188 };
        },
      },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const opened = await get(app.address().port, `/object/${OBJECT_ID}`);
    assert.equal(opened.status, 200);
    assert.match(opened.raw, /checkpoint 338404208/);
    assert.match(opened.raw, /version 1062018188/);
    assert.doesNotMatch(opened.raw, /unknown/);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a blob id is read as its certified object and keeps that checkpoint", async () => {
  const calls = [];
  const reader = createTatumReader({ TATUM_API_KEY: "tatum-key-wiresecret" }, {
    async locate(blobId) {
      assert.equal(blobId, BLOB_ID);
      return { objectId: OBJECT_ID, checkpoint: 338404208 };
    },
    async exchange(call) {
      calls.push(call.body);
      return { grpcStatus: "0", body: objectFrame() };
    },
  });
  const object = await reader.getObject(BLOB_ID);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(Buffer.from(OBJECT_ID)));
  assert.equal(calls[0].includes(Buffer.from(BLOB_ID)), false);
  assert.equal(object.objectId, OBJECT_ID);
  assert.equal(object.checkpoint, 338404208);
  assert.equal(object.text, "");
});

test("a blob id with no certified object does not call the gateway", async () => {
  let opened = false;
  const reader = createTatumReader({ TATUM_API_KEY: "tatum-key-wiresecret" }, {
    async locate() {
      return { objectId: null, checkpoint: null };
    },
    async exchange() {
      opened = true;
      return { grpcStatus: "0", body: objectFrame() };
    },
  });
  await assert.rejects(() => reader.getObject(BLOB_ID), /Tatum read failed/);
  assert.equal(opened, false);
  assert.deepEqual(reader.calls, [BLOB_ID]);
});

function objectFrame() {
  const object = Buffer.concat([
    fieldString(2, OBJECT_ID),
    fieldVarint(3, 1062018188),
    fieldString(4, "GfKGew"),
    fieldString(6, "pkg::blob::Blob"),
  ]);
  const message = fieldBytes(1, object);
  const frame = Buffer.alloc(5 + message.length);
  frame.writeUInt32BE(message.length, 1);
  message.copy(frame, 5);
  return frame;
}

function fieldString(field, value) {
  return fieldBytes(field, Buffer.from(value));
}

function fieldBytes(field, bytes) {
  return Buffer.concat([Buffer.from([(field << 3) | 2, bytes.length]), bytes]);
}

function fieldVarint(field, value) {
  const bytes = [];
  let rest = value;
  do {
    const next = rest & 0x7f;
    rest = Math.floor(rest / 128);
    bytes.push(rest === 0 ? next : next | 0x80);
  } while (rest > 0);
  return Buffer.concat([Buffer.from([(field << 3) | 0]), Buffer.from(bytes)]);
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}
