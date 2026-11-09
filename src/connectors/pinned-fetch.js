import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { connectorError } from "./errors.js";
import { resolveConnectorDestination } from "./url-guard.js";

export function pinnedLookup(hostname, addresses) {
  const vetted = addresses.map((address) => ({ address, family: isIP(address) }));
  if (!vetted.length || vetted.some((row) => !row.family)) throw connectorError("blocked-url");
  return (host, options, callback) => {
    if (host.toLowerCase().replace(/\.$/, "") !== hostname.toLowerCase().replace(/\.$/, "")) {
      callback(connectorError("blocked-url"));
      return;
    }
    const family = typeof options === "number" ? options : options?.family;
    const choices = family ? vetted.filter((row) => row.family === family) : vetted;
    if (!choices.length) { callback(connectorError("blocked-url")); return; }
    if (options?.all) callback(null, choices);
    else callback(null, choices[0].address, choices[0].family);
  };
}

/** Each connection uses only this request's vetted addresses, with the URL hostname retained for TLS. */
export async function pinnedFetch(resource, init = {}, options = {}) {
  const request = new Request(resource, { ...init, duplex: "half" });
  const { url, addresses } = await resolveConnectorDestination(request.url, options);
  request.signal.throwIfAborted();
  return requestPinnedDestination(request, { url, addresses });
}

/** Internal transport boundary: destination must come from resolveConnectorDestination. */
export function requestPinnedDestination(request, { url, addresses }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = transport(url, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      agent: false,
      lookup: pinnedLookup(url.hostname.replace(/^\[|\]$/g, ""), addresses),
      signal: request.signal,
    }, (incoming) => {
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      const status = incoming.statusCode;
      const noBody = request.method === "HEAD" || [204, 205, 304].includes(status);
      let body = incoming;
      const encoding = headers.get("content-encoding");
      const decompress = encoding === "gzip" ? createGunzip : encoding === "deflate" ? createInflate : encoding === "br" ? createBrotliDecompress : null;
      if (!noBody && decompress) {
        body = decompress();
        pipeline(incoming, body).catch((error) => body.destroy(error));
        body.once("close", () => incoming.destroy());
        headers.delete("content-encoding");
        headers.delete("content-length");
      }
      if (noBody) incoming.resume();
      try {
        resolve(new Response(noBody ? null : Readable.toWeb(body), { status, statusText: incoming.statusMessage, headers }));
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });
    outgoing.once("error", reject);
    if (request.body) pipeline(Readable.fromWeb(request.body), outgoing).catch(reject);
    else outgoing.end();
  });
}
