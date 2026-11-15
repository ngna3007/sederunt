/**
 * Run named route handlers in order. A handler returns true when it answered
 * the request. Later handlers are skipped.
 *
 * @param {Array<[string, (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL) => Promise<boolean>|boolean]>} routes
 */
export async function dispatch(routes, req, res, url) {
  for (const [, handle] of routes) {
    if (await handle(req, res, url)) return true;
  }
  return false;
}
