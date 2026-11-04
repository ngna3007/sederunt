import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { GOOGLE_CALENDAR_MCP_URL, isCalendarMcpUrl } from "./builtin-calendar.js";
import { connectorError } from "./errors.js";

const LOOKUP_MS = 2000;

/**
 * Loopback HTTP is allowed only for the in-process fake MCP server.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function loopbackFakeAllowed(env = process.env) {
  const flag = String(env.SEDERUNT_MCP_FAKE ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return String(env.SEDERUNT_AUTH_FAKE || "").trim() === "1";
}

/**
 * @param {string} raw
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, lookup?: typeof dnsLookup }} [options]
 * @returns {Promise<URL>}
 */
export async function guardConnectorUrl(raw, options = {}) {
  if (options.allowCalendarPreset === true && isCalendarMcpUrl(raw)) {
    return new URL(GOOGLE_CALENDAR_MCP_URL);
  }
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw connectorError("invalid-url");
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw connectorError("invalid-url");
  }
  if (url.username || url.password) throw connectorError("invalid-url");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw connectorError("invalid-url");
  const host = hostnameOf(url);
  if (!host || host.length > 253) throw connectorError("invalid-url");
  if (host === "metadata.google.internal" || host.endsWith(".internal") || host.endsWith(".local")) {
    throw connectorError("blocked-url");
  }
  if (/^\d+$/.test(host)) throw connectorError("blocked-url");
  const fakeLoopback = loopbackFakeAllowed(options.env || process.env) && url.protocol === "http:" && isLoopbackHost(host);
  if (url.protocol === "http:" && !fakeLoopback) throw connectorError("invalid-url");
  if (fakeLoopback) return url;
  if (isBlockedAddress(host)) throw connectorError("blocked-url");
  if (isIP(host)) return url;
  if (looksLikeTrickHost(host)) throw connectorError("blocked-url");
  const addresses = await resolveHost(host, options.lookup || dnsLookup);
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
    throw connectorError("blocked-url");
  }
  return url;
}

function hostnameOf(url) {
  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function looksLikeTrickHost(host) {
  if (host.includes("%")) return true;
  const labels = host.split(".");
  if (labels.some((label) => label.length > 1 && label.startsWith("0") && /^\d+$/.test(label))) return true;
  return false;
}

/**
 * @param {string} host
 * @param {typeof dnsLookup} lookup
 */
async function resolveHost(host, lookup) {
  let timer;
  try {
    const answered = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(connectorError("blocked-url")), LOOKUP_MS);
      }),
    ]);
    const rows = Array.isArray(answered) ? answered : [answered];
    return rows.map((row) => String(row?.address || "")).filter(Boolean);
  } catch (error) {
    if (error?.code === "blocked-url") throw error;
    throw connectorError("blocked-url");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} address
 */
export function isBlockedAddress(address) {
  const raw = String(address || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!raw) return true;
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  if (raw.includes(":") || isIP(raw) === 6) return blockedV6(raw);
  if (isIP(raw) !== 4) return false;
  if (raw.split(".").some((part) => part.length > 1 && part.startsWith("0"))) return true;
  const parts = raw.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  const value = ((a << 24) | (b << 16) | (c << 8) | parts[3]) >>> 0;
  const inNet = (base, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base >>> 0 & mask);
  };
  if (inNet(0, 8)) return true;
  if (inNet(0x0a000000, 8)) return true;
  if (inNet(0x7f000000, 8)) return true;
  if (inNet(0xa9fe0000, 16)) return true;
  if (inNet(0xac100000, 12)) return true;
  if (inNet(0xc0a80000, 16)) return true;
  if (inNet(0x64400000, 10)) return true;
  if (inNet(0xc0000000, 24)) return true;
  if (inNet(0xc0000200, 24)) return true;
  if (inNet(0xc6120000, 15)) return true;
  if (inNet(0xc6336400, 24)) return true;
  if (inNet(0xcb007100, 24)) return true;
  if (a >= 224) return true;
  return false;
}

function blockedV6(raw) {
  const host = raw.split("%")[0];
  if (host === "::" || host === "::1") return true;
  const expanded = expandV6(host);
  if (!expanded) return true;
  const head = expanded[0];
  if ((head & 0xfe00) === 0xfc00) return true;
  if ((head & 0xffc0) === 0xfe80) return true;
  if ((head & 0xff00) === 0xff00) return true;
  if (expanded[0] === 0x2001 && expanded[1] === 0x0db8) return true;
  if (expanded.slice(0, 5).every((part) => part === 0) && expanded[5] === 0xffff) {
    const v4 = `${expanded[6] >> 8}.${expanded[6] & 0xff}.${expanded[7] >> 8}.${expanded[7] & 0xff}`;
    return isBlockedAddress(v4);
  }
  if (expanded.every((part) => part === 0)) return true;
  return false;
}

function expandV6(host) {
  if (!/^[0-9a-f:]+$/.test(host)) return null;
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").map((part) => parseInt(part, 16)) : [];
  const right = halves[1] ? halves[1].split(":").map((part) => parseInt(part, 16)) : [];
  if ([...left, ...right].some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
  const missing = 8 - (left.length + right.length);
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}
