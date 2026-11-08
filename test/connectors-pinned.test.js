import assert from "node:assert/strict";
import dns from "node:dns";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { once } from "node:events";
import { createServer } from "node:http";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";
import test from "node:test";
import { pinnedFetch, pinnedLookup, requestPinnedDestination } from "../src/connectors/pinned-fetch.js";
import { loopbackFakeAllowed, resolveConnectorDestination } from "../src/connectors/url-guard.js";
import { testConnection } from "../src/connectors/client.js";

const env = { SEDERUNT_MCP_FAKE: "1" };
async function server(t, handler) {
  const app = createServer(handler);
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => new Promise((resolve) => { app.closeAllConnections(); app.close(resolve); }));
  return `http://localhost:${app.address().port}`;
}

test("the real socket uses the checked DNS answer without resolving the hostname again", async (t) => {
  let seenHost = "";
  const url = await server(t, (req, res) => { seenHost = req.headers.host; res.end("pinned socket"); });
  let resolutions = 0;
  const lookup = async () => [{ address: ++resolutions === 1 ? "127.0.0.1" : "127.0.0.2" }];
  const socketDns = t.mock.method(dns, "lookup", () => { throw new Error("unexpected second DNS lookup"); });
  const response = await pinnedFetch(url, {}, { env, lookup });
  assert.equal(await response.text(), "pinned socket");
  assert.equal(resolutions, 1);
  assert.equal(socketDns.mock.callCount(), 0);
  assert.equal(seenHost, new URL(url).host, "the original hostname survives the pinned connection");
});

test("production ignores fake auth and fake MCP flags and never opens a loopback socket", async (t) => {
  let connected = 0;
  const url = await server(t, (_req, res) => { connected++; res.end("private"); });
  for (const production of [{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }]) {
    const settings = { ...env, SEDERUNT_AUTH_FAKE: "1", ...production };
    assert.equal(loopbackFakeAllowed(settings), false);
    await assert.rejects(pinnedFetch(url, {}, { env: settings }), (error) => error.code === "invalid-url");
  }
  assert.equal(connected, 0);
});

test("a changed or mixed public/private DNS response is rejected before a socket opens", async (t) => {
  let connections = 0;
  const url = await server(t, (_req, res) => { connections++; res.end(); });
  const hostname = `https://connector.example:${new URL(url).port}/mcp`;
  let resolutions = 0;
  const lookup = async () => [{ address: ++resolutions === 1 ? "1.2.3.4" : "127.0.0.1" }];
  const result = await testConnection({ url: hostname, lookup, env: {}, timeoutMs: 500 });
  assert.equal(result.code, "blocked-url");
  assert.equal(resolutions, 2, "the final check rejects changed DNS; the socket never resolves again");
  for (const addresses of [["1.2.3.4", "::ffff:127.0.0.1"], ["1.2.3.4", "bad-address"], ["2001:4860:4860::8888", "fe80::1"], ["64:ff9b::7f00:1"], ["::7f00:1"], ["2002:7f00:1::"]]) {
    await assert.rejects(resolveConnectorDestination(hostname, { env: {}, lookup: async () => addresses.map(address => ({ address })) }), (error) => error.code === "blocked-url");
  }
  assert.equal(connections, 0);
});

test("pin callbacks honor family and refuse other hostnames rather than doing DNS fallback", async () => {
  const lookup = pinnedLookup("connector.example", ["1.2.3.4", "2001:4860:4860::8888"]);
  const call = (host, options) => new Promise((resolve, reject) => lookup(host, options, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(await call("connector.example", { all: true }), { address: [{ address: "1.2.3.4", family: 4 }, { address: "2001:4860:4860::8888", family: 6 }], family: undefined });
  assert.deepEqual(await call("connector.example", 4), { address: "1.2.3.4", family: 4 });
  assert.deepEqual(await call("connector.example", { family: 6 }), { address: "2001:4860:4860::8888", family: 6 });
  await assert.rejects(call("metadata.google.internal", {}), (error) => error.code === "blocked-url");
  const ipv4 = pinnedLookup("connector.example", ["1.2.3.4"]);
  await assert.rejects(new Promise((resolve, reject) => ipv4("connector.example", { family: 6 }, error => error ? reject(error) : resolve())), error => error.code === "blocked-url");
  assert.throws(() => pinnedLookup("connector.example", ["garbage"]), error => error.code === "blocked-url");
});

test("pinned responses stream, abort and decompress without buffering the entire body", async (t) => {
  const url = await server(t, (req, res) => {
    if (req.url === "/gzip") { res.writeHead(200, { "content-encoding": "gzip" }); res.end(gzipSync("decoded")); return; }
    if (req.url === "/empty") { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: first\n\n");
  });
  const controller = new AbortController();
  const response = await pinnedFetch(url + "/events", { signal: controller.signal }, { env });
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: first/);
  controller.abort();
  await assert.rejects(reader.read());
  const gzip = await pinnedFetch(url + "/gzip", {}, { env });
  assert.equal(gzip.headers.has("content-encoding"), false);
  assert.equal(await gzip.text(), "decoded");
  const empty = await pinnedFetch(url + "/empty", {}, { env });
  assert.equal(empty.status, 204);
  assert.equal(empty.body, null);
  const aborted = AbortSignal.abort();
  await assert.rejects(pinnedFetch(url, { signal: aborted }, { env }), error => error.name === "AbortError");
});


test("pinning retains TLS SNI and rejects a trusted certificate for a different hostname", async (t) => {
  await mkdir(".local/tmp", { recursive: true });
  const directory = await mkdtemp(".local/tmp/connector-tls-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", directory + "/key.pem", "-out", directory + "/cert.pem", "-days", "1", "-subj", "/CN=connector.example", "-addext", "subjectAltName=DNS:connector.example"], { stdio: "ignore" });
  const key = await readFile(directory + "/key.pem");
  const cert = await readFile(directory + "/cert.pem");
  const names = [];
  const app = createHttpsServer({ key, cert }, (_req, res) => res.end("verified"));
  app.on("secureConnection", socket => names.push(socket.servername));
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  const roots = getCACertificates();
  setDefaultCACertificates([...roots, cert.toString()]);
  t.after(() => setDefaultCACertificates(roots));
  const connect = async (hostname) => {
    const url = new URL(`https://${hostname}:${app.address().port}/`);
    const response = await requestPinnedDestination(new Request(url), { url, addresses: ["127.0.0.1"] });
    assert.equal(await response.text(), "verified");
    return response.status;
  };
  assert.equal(await connect("connector.example"), 200);
  assert.deepEqual(names, ["connector.example"]);
  await assert.rejects(connect("another.example"), error => error.code === "ERR_TLS_CERT_ALTNAME_INVALID");
});

test("same-origin redirects retain custom auth and cross-origin redirects never forward it", async (t) => {
  let stolen = 0;
  const capture = await server(t, (_req, res) => { stolen++; res.end(); });
  const headers = [];
  const origin = await server(t, (req, res) => {
    headers.push([req.url, req.headers["x-connector-key"]]);
    if (req.url === "/start") { res.writeHead(307, { location: "/escape" }); res.end(); }
    else { res.writeHead(307, { location: capture + "/capture" }); res.end(); }
  });
  const result = await testConnection({ url: origin + "/start", auth: { token: "fixture-secret", headerName: "X-Connector-Key" }, env, timeoutMs: 1000 });
  assert.equal(result.code, "blocked-url");
  assert.deepEqual(headers, [["/start", "fixture-secret"], ["/escape", "fixture-secret"]]);
  assert.equal(stolen, 0);
});


test("body uploads, compression variants and response construction failures clean up correctly", async (t) => {
  const url = await server(t, async (req, res) => {
    if (req.url === "/invalid") { res.writeHead(700); res.end("invalid response"); return; }
    if (req.url === "/deflate" || req.url === "/br" || req.url === "/broken") {
      const coding = req.url === "/deflate" ? "deflate" : req.url === "/br" ? "br" : "gzip";
      res.writeHead(200, { "content-encoding": coding });
      res.end(req.url === "/broken" ? Buffer.from("not gzip") : coding === "br" ? brotliCompressSync("compressed") : deflateSync("compressed"));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.end(Buffer.concat(chunks));
  });
  const posted = await pinnedFetch(url, { method: "POST", body: "request bytes" }, { env });
  assert.equal(await posted.text(), "request bytes");
  for (const coding of ["deflate", "br"]) {
    const response = await pinnedFetch(url + "/" + coding, {}, { env });
    assert.equal(await response.text(), "compressed");
  }
  const broken = await pinnedFetch(url + "/broken", {}, { env });
  await assert.rejects(broken.text());
  await assert.rejects(pinnedFetch(url + "/invalid", {}, { env }), RangeError);
  const head = await pinnedFetch(url, { method: "HEAD" }, { env });
  assert.equal(head.body, null);
});
