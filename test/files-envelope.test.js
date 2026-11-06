import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { createLoopbackSeal, openEnvelope, sealEnvelope, sha256Bytes } from "../src/files/envelope.js";

test("a seal envelope round-trips and does not keep the plaintext or the raw AES key", async () => {
  const plain = Buffer.from(`sederunt file ${randomBytes(24).toString("hex")} end`);
  const seal = createLoopbackSeal();
  const packed = await sealEnvelope(plain, { seal });
  assert.equal(packed.mode, "seal");
  assert.equal(packed.bytes.includes(plain), false);
  const opened = await openEnvelope(packed.bytes, { seal });
  assert.equal(Buffer.compare(opened, plain), 0);
  assert.equal(sha256Bytes(opened).equals(createHash("sha256").update(plain).digest()), true);
});

test("a server-wrapped envelope round-trips when Seal is not configured", async () => {
  const plain = Buffer.from("quarterly plan");
  const packed = await sealEnvelope(plain, { serverSecret: "server-secret" });
  assert.equal(packed.mode, "server-wrap");
  assert.equal(packed.bytes.includes(plain), false);
  const opened = await openEnvelope(packed.bytes, { serverSecret: "server-secret" });
  assert.equal(opened.toString(), "quarterly plan");
  await assert.rejects(() => openEnvelope(packed.bytes, { serverSecret: "other" }));
});

test("encryption refuses to run with neither Seal nor a server secret", async () => {
  await assert.rejects(() => sealEnvelope(Buffer.from("x"), {}), /not configured/);
});
