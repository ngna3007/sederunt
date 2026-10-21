import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createLinearClient } from "./linear/mcp.js";
import { loadLinearToken } from "./linear/token.js";
import { renderLanding } from "./landing.js";
import { renderPage } from "./page.js";
import { createSession } from "./session.js";
import { handleUtterance } from "./typed-path.js";

const port = Number(process.env.PORT || 8787);
const session = createSession();

let linearPromise;
function linear() {
  if (!linearPromise) {
    linearPromise = Promise.resolve(createLinearClient(loadLinearToken()));
  }
  return linearPromise;
}

const memory = process.env.COMPANY_MEMWAL_KEY
  ? {
      async remember(input) {
        if (input.account !== "company") {
          throw new Error("This process holds only the company delegate");
        }
        const { rememberCompany } = await import("./memory/company.js");
        return rememberCompany(input);
      },
    }
  : null;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      if (await sendMedia(res, url.pathname)) return;
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/clips/")) {
      if (await sendClip(req, res, url.pathname)) return;
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")) {
      const icon = await readFile(resolve("public/favicon.svg"));
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      res.end(icon);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/models/")) {
      const name = url.pathname.slice("/models/".length);
      if (!/^CEREBRIUM_[A-Za-z0-9_]+\.glb$/.test(name)) {
        send(res, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }
      const file = resolve("public/models", name);
      send(res, 200, "model/gltf-binary", await readFile(file));
      return;
    }
    if (req.method === "GET" && url.pathname === "/hold.js") {
      send(res, 200, "text/javascript; charset=utf-8", await readFile(new URL("./hold.js", import.meta.url), "utf8"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/prototype/hero") {
      send(res, 200, "text/html; charset=utf-8", await readFile(resolve("prototype/hero-drafts.html"), "utf8"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, "text/html; charset=utf-8", renderLanding());
      return;
    }
    if (req.method === "GET" && url.pathname === "/record") {
      send(res, 200, "text/html; charset=utf-8", renderPage(session));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/typed") {
      const { text, spokenYes, asForm } = await readRequest(req);
      const result = await handleUtterance(
        { text, session, spokenYes },
        { linear: await linear(), memory },
      );
      if (asForm) {
        res.writeHead(303, { location: "/record" });
        res.end();
        return;
      }
      send(res, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    send(res, 500, "text/plain; charset=utf-8", message);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sederunt typed path http://127.0.0.1:${port}`);
  console.log('POST /api/typed {"text":"..."}');
  console.log('A Linear create waits for a following request {"text":"yes"}');
});

function send(res, status, type, body) {
  const headers = { "content-type": type };
  if (type.startsWith("text/html")) headers["cache-control"] = "no-store";
  res.writeHead(status, headers);
  res.end(body);
}

const mediaRoot = resolve("public/media");
const mediaTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const clipRoot = resolve("public/clips");

async function sendMedia(res, pathname) {
  const name = pathname.slice("/media/".length);
  const type = mediaTypes[extname(name).toLowerCase()];
  if (!type || !/^[a-z0-9.-]+$/i.test(name)) return false;
  const file = resolve(mediaRoot, name);
  if (!file.startsWith(`${mediaRoot}/`)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=3600" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function sendClip(req, res, pathname) {
  const name = pathname.slice("/clips/".length);
  if (extname(name).toLowerCase() !== ".mp4" || !/^[a-z0-9.-]+$/i.test(name)) return false;
  const file = resolve(clipRoot, name);
  if (!file.startsWith(`${clipRoot}/`)) return false;
  let body;
  try {
    body = await readFile(file);
  } catch {
    return false;
  }
  const total = body.length;
  const headers = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { ...headers, "content-length": total });
    res.end(body);
    return true;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${total}` });
    res.end();
    return true;
  }
  const start = match[1] === "" ? 0 : Number(match[1]);
  const end = match[2] === "" ? total - 1 : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) {
    res.writeHead(416, { "content-range": `bytes */${total}` });
    res.end();
    return true;
  }
  const last = Math.min(end, total - 1);
  res.writeHead(206, {
    ...headers,
    "content-range": `bytes ${start}-${last}/${total}`,
    "content-length": last - start + 1,
  });
  res.end(body.subarray(start, last + 1));
  return true;
}

async function readRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) {
    const body = JSON.parse(raw || "{}");
    return { text: body.text ?? "", spokenYes: body.yes === true, asForm: false };
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return { text: params.get("text") ?? "", spokenYes: params.get("yes") === "true", asForm: true };
  }
  return { text: raw, spokenYes: false, asForm: false };
}
