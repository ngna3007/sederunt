import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { renderLanding } from "../landing.js";
import { send } from "./send.js";

let consoleCss = "";

export async function consoleStyles() {
  if (!consoleCss) consoleCss = await readFile(new URL("../console.css", import.meta.url), "utf8");
  return consoleCss;
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

/**
 * Public files, fonts, landing, hold.js, console.css.
 * @returns {Promise<boolean>} true when the request was answered
 */
export async function handleStaticRoutes(req, res, url) {
  if (req.method !== "GET") return false;
  const path = url.pathname;
  if (path.startsWith("/media/")) {
    if (await sendMedia(res, path)) return true;
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return true;
  }
  if (path.startsWith("/clips/")) {
    if (await sendClip(req, res, path)) return true;
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return true;
  }
  if (path === "/favicon.ico" || path === "/favicon.svg") {
    const icon = await readFile(resolve("public/favicon.svg"));
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    res.end(icon);
    return true;
  }
  if (path.startsWith("/models/")) {
    const name = path.slice("/models/".length);
    if (!/^CEREBRIUM_[A-Za-z0-9_]+\.glb$/.test(name)) {
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return true;
    }
    const file = resolve("public/models", name);
    send(res, 200, "model/gltf-binary", await readFile(file));
    return true;
  }
  if (path === "/hold.js") {
    send(res, 200, "text/javascript; charset=utf-8", await readFile(new URL("../hold.js", import.meta.url), "utf8"));
    return true;
  }
  if (path === "/") {
    send(res, 200, "text/html; charset=utf-8", renderLanding());
    return true;
  }
  if (path === "/console.css") {
    send(res, 200, "text/css; charset=utf-8", await consoleStyles(), { "cache-control": "public, max-age=3600" });
    return true;
  }
  const consoleScripts = {
    "/console/activity.js": "src/activity-feed.js",
    "/console/activity-feed.js": "src/activity-feed.js",
    "/console/room-match.js": "src/room-match.js",
    "/console/bot-identity.js": "src/bot/identity.js",
    "/console/bot-card.js": "src/console/bot-card.js",
  };
  if (consoleScripts[path]) {
    send(res, 200, "text/javascript; charset=utf-8", await readFile(resolve(consoleScripts[path])));
    return true;
  }
  if (path === "/fonts/Geist-Variable.woff2" || path === "/fonts/GeistMono-Variable.woff2") {
    const file = path.endsWith("GeistMono-Variable.woff2")
      ? "geist-mono/GeistMono-Variable.woff2"
      : "geist-sans/Geist-Variable.woff2";
    const fontDir = resolve(dirname(createRequire(import.meta.url).resolve("geist/font")), "fonts");
    const bytes = await readFile(resolve(fontDir, file));
    res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=86400" });
    res.end(bytes);
    return true;
  }
  return false;
}
