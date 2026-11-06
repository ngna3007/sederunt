import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

/**
 * The access token lives only for this request. The server does not keep it.
 *
 * @template T
 * @param {{ token?: string, origin?: string }} context
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithFormsContext(context, fn) {
  return storage.run(context, fn);
}

export function formsContext() {
  return storage.getStore() || {};
}
