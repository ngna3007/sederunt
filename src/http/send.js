export function send(res, status, type, body, extra = {}) {
  const headers = { "content-type": type, ...extra };
  if (type.startsWith("text/html") || type.startsWith("application/json")) headers["cache-control"] = "no-store";
  res.writeHead(status, headers);
  res.end(body);
}

export function redirect(res, location, extra = {}) {
  res.writeHead(302, { location, "cache-control": "no-store", ...extra });
  res.end();
}
