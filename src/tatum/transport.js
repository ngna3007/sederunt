import http2 from "node:http2";
import { Deferred, RpcError, UnaryCall, mergeRpcOptions } from "@protobuf-ts/runtime-rpc";
import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";

export const TATUM_GATEWAY = "https://sui-mainnet-grpc.gateway.tatum.io:443";

const CACHED_METHODS = new Set(["GetCheckpoint", "GetTransaction"]);

/**
 * Native unary gRPC over HTTP/2. Tatum's gateway answers application/grpc.
 * The default Sui transport speaks grpc-web, which this gateway rejects.
 * `exchange` is injectable so tests never open a socket. The key is a header
 * and is removed from any error text.
 *
 * @param {{ baseUrl?: string, apiKey?: string, exchange?: Function, timeoutMs?: number, retries?: number, rps?: number, now?: () => number, sleep?: (ms: number) => Promise<void>, random?: () => number, log?: Array<{ method: string, ms: number, outcome: string }> }} [options]
 */
export function createNativeGrpcTransport(options = {}) {
  const baseUrl = options.baseUrl || TATUM_GATEWAY;
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : "";
  const exchange = options.exchange ?? exchangeHttp2;
  const timeoutMs = positive(options.timeoutMs, 8000);
  const retries = nonNegative(options.retries, 3);
  const rps = positive(options.rps, 3);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const log = options.log ?? [];
  const cache = new Map();
  // One throttle per gateway and rate for the whole process, so separate
  // clients (proof reader, Seal) share the free-plan budget. Injected clocks
  // in tests get their own throttle.
  const acquire = options.now || options.sleep
    ? createThrottle({ rps, now, sleep })
    : sharedThrottle(baseUrl, rps, now, sleep);
  const defaults = {
    baseUrl,
    timeout: timeoutMs,
    meta: apiKey ? { "x-api-key": apiKey } : {},
  };

  function redact(value) {
    const text = value == null ? "" : String(value);
    if (!apiKey || !text.includes(apiKey)) return text;
    return text.split(apiKey).join("[redacted]");
  }

  return {
    log,
    mergeOptions(callOptions) {
      return mergeRpcOptions(defaults, callOptions);
    },
    unary(method, input, callOptions) {
      const opt = callOptions ?? {};
      const defHeader = new Deferred();
      const defMessage = new Deferred();
      const defStatus = new Deferred();
      const defTrailer = new Deferred();
      const fail = (error) => {
        const rpc = error instanceof RpcError ? error : rpcError(method, "INTERNAL", redact(error?.message || "Tatum read failed"));
        rpc.message = redact(rpc.message);
        defHeader.rejectPending(rpc);
        defMessage.rejectPending(rpc);
        defStatus.rejectPending(rpc);
        defTrailer.rejectPending(rpc);
      };
      const succeed = (result) => {
        defHeader.resolve(result.headers);
        defMessage.resolve(result.message);
        defStatus.resolve(result.status);
        defTrailer.resolve(result.trailers);
      };
      void (async () => {
        let cacheKey = "";
        try {
          cacheKey = `${method.name}:${Buffer.from(method.I.toBinary(input, opt.binaryOptions)).toString("base64")}`;
        } catch (error) {
          fail(error);
          return;
        }
        if (CACHED_METHODS.has(method.name) && cache.has(cacheKey)) {
          log.push({ method: method.name, ms: 0, outcome: "cached" });
          succeed(cache.get(cacheKey));
          return;
        }
        const attempts = retries;
        let last = null;
        for (let attempt = 0; attempt <= attempts; attempt += 1) {
          if (attempt > 0) await sleep(backoffMs(attempt - 1, random));
          await acquire();
          const started = now();
          try {
            const result = await once({
              method,
              input,
              opt,
              baseUrl,
              exchange,
              timeoutMs: positive(opt.timeout, timeoutMs),
              redact,
            });
            log.push({ method: method.name, ms: Math.max(0, now() - started), outcome: "ok" });
            if (CACHED_METHODS.has(method.name)) cache.set(cacheKey, result);
            succeed(result);
            return;
          } catch (error) {
            last = error instanceof RpcError ? error : rpcError(method, "UNAVAILABLE", redact(error?.message || "Tatum read failed"));
            last.message = redact(last.message);
            const retryable = isRetryable(last) && attempt < attempts;
            log.push({
              method: method.name,
              ms: Math.max(0, now() - started),
              outcome: retryable ? "retry" : "error",
            });
            if (!retryable) break;
          }
        }
        fail(last);
      })();
      return new UnaryCall(method, opt.meta ?? {}, input, defHeader.promise, defMessage.promise, defStatus.promise, defTrailer.promise);
    },
    serverStreaming(method) {
      throw unimplemented(method);
    },
    clientStreaming(method) {
      throw unimplemented(method);
    },
    duplex(method) {
      throw unimplemented(method);
    },
  };
}

export function frameMessage(message) {
  const bytes = Buffer.isBuffer(message) ? message : Buffer.from(message);
  const frame = Buffer.alloc(5 + bytes.length);
  frame.writeUInt32BE(bytes.length, 1);
  bytes.copy(frame, 5);
  return frame;
}

export function exchangeHttp2(request) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = http2.connect(request.url);
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (request.signal) request.signal.removeEventListener("abort", onAbort);
      try {
        client.close();
      } catch {
        // The session may already be gone.
      }
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => {
      const error = new Error("Tatum read failed");
      error.code = "DEADLINE_EXCEEDED";
      finish(error);
    };
    if (request.signal) {
      if (request.signal.aborted) {
        onAbort();
        return;
      }
      request.signal.addEventListener("abort", onAbort, { once: true });
    }
    client.on("error", (error) => finish(error));
    const req = client.request({
      ":method": "POST",
      ":path": request.path,
      ...request.headers,
    });
    const chunks = [];
    let grpcStatus = "";
    let grpcMessage = "";
    let httpStatus = "";
    const take = (headers) => {
      if (headers[":status"] != null) httpStatus = String(headers[":status"]);
      if (headers["grpc-status"] != null) grpcStatus = String(headers["grpc-status"]);
      if (headers["grpc-message"] != null) grpcMessage = String(headers["grpc-message"]);
    };
    req.on("response", take);
    req.on("trailers", take);
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", (error) => finish(error));
    req.on("end", () => finish(null, {
      httpStatus,
      grpcStatus,
      grpcMessage,
      body: Buffer.concat(chunks),
    }));
    req.end(request.body);
  });
}

async function once({ method, input, opt, baseUrl, exchange, timeoutMs, redact }) {
  const signal = AbortSignal.timeout(timeoutMs);
  const bytes = method.I.toBinary(input, opt.binaryOptions);
  const body = frameMessage(bytes);
  const url = String(opt.baseUrl || baseUrl);
  const path = `/${method.service.typeName}/${method.name}`;
  const headers = grpcHeaders(opt.meta);
  let reply;
  let timer;
  try {
    reply = await Promise.race([
      exchange({ url, path, headers, body, signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Tatum read failed");
          error.code = "DEADLINE_EXCEEDED";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error?.code === "DEADLINE_EXCEEDED" || error?.name === "TimeoutError" || signal.aborted) {
      throw rpcError(method, "DEADLINE_EXCEEDED", redact("Tatum read failed"));
    }
    throw rpcError(method, "UNAVAILABLE", redact(error instanceof Error ? error.message : "Tatum read failed"));
  } finally {
    if (timer) clearTimeout(timer);
  }
  const httpStatus = Number(reply?.httpStatus || 0);
  const grpcStatus = reply?.grpcStatus == null || reply.grpcStatus === "" ? "" : String(reply.grpcStatus);
  const detail = redact(decodeMessage(reply?.grpcMessage) || "Tatum read failed");
  if (httpStatus === 429 || reply?.rateLimited || grpcStatus === "8") {
    throw rpcError(method, "RESOURCE_EXHAUSTED", detail);
  }
  if (grpcStatus === "14") throw rpcError(method, "UNAVAILABLE", detail);
  const statusNumber = grpcStatus === "" ? 0 : Number(grpcStatus);
  if (!Number.isInteger(statusNumber) || statusNumber !== 0) {
    const name = typeof GrpcStatusCode[statusNumber] === "string" ? GrpcStatusCode[statusNumber] : "UNKNOWN";
    throw rpcError(method, name, detail);
  }
  let message;
  try {
    message = method.O.fromBinary(unframe(reply?.body), opt.binaryOptions);
  } catch (error) {
    throw rpcError(method, "INTERNAL", redact(error instanceof Error ? error.message : "Tatum read failed"));
  }
  return {
    headers: {},
    message,
    status: { code: "OK", detail: "OK" },
    trailers: {},
  };
}

function unframe(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? []);
  if (buffer.length < 5 || buffer[0] !== 0) {
    const error = new Error("Tatum read failed");
    error.code = "INTERNAL";
    throw error;
  }
  const length = buffer.readUInt32BE(1);
  if (buffer.length < 5 + length) {
    const error = new Error("Tatum read failed");
    error.code = "INTERNAL";
    throw error;
  }
  return buffer.subarray(5, 5 + length);
}

function grpcHeaders(meta) {
  const headers = {
    "content-type": "application/grpc",
    te: "trailers",
    "grpc-accept-encoding": "identity",
    accept: "application/grpc",
  };
  for (const [name, value] of Object.entries(meta ?? {})) {
    if (value == null) continue;
    const lower = String(name).toLowerCase();
    if (lower === "content-type" || lower === "te" || lower === "accept" || lower.startsWith(":")) continue;
    headers[lower] = Array.isArray(value) ? value.map(String).join(",") : String(value);
  }
  return headers;
}

function rpcError(method, code, message) {
  const error = new RpcError(message || code, code, {});
  error.methodName = method?.name;
  error.serviceName = method?.service?.typeName;
  return error;
}

function unimplemented(method) {
  return rpcError(method, "UNIMPLEMENTED", "streaming is not used");
}

export function isRetryable(error) {
  const code = error?.code;
  return code === "RESOURCE_EXHAUSTED" || code === "UNAVAILABLE";
}

function backoffMs(failedAttempt, random) {
  const base = Math.min(2000, 200 * (2 ** failedAttempt));
  const jitter = Math.floor(Number(random()) * (base / 2));
  return base + (Number.isFinite(jitter) ? jitter : 0);
}

const SHARED_THROTTLES = new Map();

function sharedThrottle(baseUrl, rps, now, sleep) {
  const key = `${baseUrl}|${rps}`;
  if (!SHARED_THROTTLES.has(key)) SHARED_THROTTLES.set(key, createThrottle({ rps, now, sleep }));
  return SHARED_THROTTLES.get(key);
}

function createThrottle({ rps, now, sleep }) {
  const gap = 1000 / rps;
  let nextAt = 0;
  let tail = Promise.resolve();
  return function acquire() {
    const turn = tail.then(async () => {
      const start = now();
      const wait = Math.max(0, nextAt - start);
      nextAt = Math.max(nextAt, start) + gap;
      if (wait > 0) await sleep(wait);
    });
    tail = turn.then(() => {}, () => {});
    return turn;
  };
}

function decodeMessage(value) {
  const text = value == null ? "" : String(value);
  if (!text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegative(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
