import http2 from "node:http2";
import { locateMemory } from "../memory/locate.js";

const GATEWAY = "https://sui-mainnet-grpc.gateway.tatum.io";
const GET_OBJECT_PATH = "/sui.rpc.v2.LedgerService/GetObject";
const READ_PATHS = ["object_id", "version", "digest", "object_type"];
const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;

/**
 * LedgerService/GetObject as native gRPC. This gateway answers application/grpc
 * and rejects both JSON and grpc-web. No key means no call. A failed read throws,
 * which the gate renders as unknown. There is no public-fullnode fallback.
 * A Walrus blob id is resolved to its certified object first. The checkpoint is
 * that certifying transaction's sequence. Blob objects do not carry the sentence,
 * so text stays empty and the screen keeps the stored sentence.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ exchange?: typeof exchangeGrpc, locate?: typeof locateMemory }} [options]
 */
export function createTatumReader(env = process.env, options = {}) {
  const calls = [];
  const exchange = options.exchange ?? exchangeGrpc;
  const locate = options.locate ?? locateMemory;
  return {
    calls,
    async getObject(id) {
      calls.push(id);
      const key = env.TATUM_API_KEY;
      if (!key) throw new Error("Tatum read failed");
      const target = await resolveObject(id, locate);
      let reply;
      try {
        reply = await exchange({
          url: GATEWAY,
          path: GET_OBJECT_PATH,
          headers: {
            "content-type": "application/grpc",
            "te": "trailers",
            "grpc-accept-encoding": "identity",
            "x-api-key": key,
          },
          body: frameMessage(encodeGetObjectRequest(target.objectId)),
        });
      } catch {
        throw new Error("Tatum read failed");
      }
      if (reply?.rateLimited) throw rateLimited();
      if (String(reply?.grpcStatus) !== "0") {
        const error = new Error("Tatum read failed");
        error.code = "grpc";
        throw error;
      }
      const decoded = decodeGetObjectFrame(reply.body);
      if (!decoded.objectId || decoded.objectId.toLowerCase() !== target.objectId.toLowerCase()) {
        throw new Error("Tatum read failed");
      }
      return {
        text: "",
        checkpoint: target.checkpoint,
        objectId: decoded.objectId,
        objectType: decoded.objectType,
        version: decoded.version,
        digest: decoded.digest,
      };
    },
  };
}

async function resolveObject(id, locate) {
  if (OBJECT_ID.test(id)) return { objectId: id, checkpoint: null };
  let found;
  try {
    found = await locate(id);
  } catch {
    throw new Error("Tatum read failed");
  }
  if (!found?.objectId || !OBJECT_ID.test(found.objectId)) {
    const error = new Error("Tatum read failed");
    error.code = "not-certified";
    throw error;
  }
  return {
    objectId: found.objectId,
    checkpoint: Number.isInteger(found.checkpoint) ? found.checkpoint : null,
  };
}

function rateLimited() {
  const error = new Error("Tatum read failed");
  error.code = "rate-limit";
  return error;
}

/**
 * @param {{ url: string, path: string, headers: Record<string, string>, body: Buffer }} request
 */
function exchangeGrpc(request) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(request.url);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Tatum read failed")), 20000);
    client.on("error", () => finish(new Error("Tatum read failed")));
    const req = client.request({
      ":method": "POST",
      ":path": request.path,
      ...request.headers,
    });
    const chunks = [];
    let grpcStatus = null;
    let httpStatus = "";
    req.on("response", (headers) => {
      httpStatus = String(headers[":status"] ?? "");
      if (headers["grpc-status"] != null) grpcStatus = String(headers["grpc-status"]);
    });
    req.on("trailers", (headers) => {
      if (headers["grpc-status"] != null) grpcStatus = String(headers["grpc-status"]);
    });
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", () => finish(new Error("Tatum read failed")));
    req.on("end", () => {
      const rateLimited = httpStatus === "429" || grpcStatus === "8";
      finish(null, {
        grpcStatus,
        httpStatus,
        rateLimited,
        body: Buffer.concat(chunks),
      });
    });
    req.end(request.body);
  });
}

function frameMessage(message) {
  const frame = Buffer.alloc(5 + message.length);
  frame.writeUInt32BE(message.length, 1);
  message.copy(frame, 5);
  return frame;
}

function encodeGetObjectRequest(objectId) {
  const mask = Buffer.concat(READ_PATHS.map((path) => encodeString(1, path)));
  return Buffer.concat([encodeString(1, objectId), encodeBytes(3, mask)]);
}

function encodeString(field, value) {
  return encodeBytes(field, Buffer.from(value, "utf8"));
}

function encodeBytes(field, bytes) {
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(bytes.length), bytes]);
}

function encodeVarint(value) {
  const bytes = [];
  let rest = value;
  do {
    const next = rest & 0x7f;
    rest = Math.floor(rest / 128);
    bytes.push(rest === 0 ? next : next | 0x80);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function decodeGetObjectFrame(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? []);
  if (buffer.length < 5 || buffer[0] !== 0) throw new Error("Tatum read failed");
  const length = buffer.readUInt32BE(1);
  if (buffer.length !== 5 + length) throw new Error("Tatum read failed");
  const top = readFields(buffer.subarray(5));
  const objectField = top.find((field) => field.number === 1 && field.wire === 2);
  if (!objectField) throw new Error("Tatum read failed");
  const fields = readFields(objectField.bytes);
  const text = (number) => {
    const field = fields.find((item) => item.number === number && item.wire === 2);
    return field ? field.bytes.toString("utf8") : "";
  };
  const version = fields.find((item) => item.number === 3 && item.wire === 0);
  return {
    objectId: text(2) || null,
    version: version ? version.value : null,
    digest: text(4) || null,
    objectType: text(6) || null,
  };
}

function readFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const number = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 0) {
      const value = readVarint(buffer, offset);
      offset = value.offset;
      fields.push({ number, wire, value: value.value });
    } else if (wire === 2) {
      const length = readVarint(buffer, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > buffer.length) throw new Error("Tatum read failed");
      fields.push({ number, wire, bytes: buffer.subarray(offset, end) });
      offset = end;
    } else if (wire === 5) {
      offset += 4;
    } else if (wire === 1) {
      offset += 8;
    } else {
      throw new Error("Tatum read failed");
    }
    if (offset > buffer.length) throw new Error("Tatum read failed");
  }
  return fields;
}

function readVarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  while (offset < buffer.length && shift <= 28) {
    const byte = buffer[offset];
    offset += 1;
    value += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error("Tatum read failed");
}
