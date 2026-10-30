import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { appendConnectorCall, ledgerMemory } from "./memory/ledger.js";
import { dispatchMcp } from "./mcp.js";
import { createSession } from "./session.js";
import { defaultDeps } from "./server.js";
import { rebuildCompanyIndex } from "./typed-path.js";

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return Buffer.concat([
    Buffer.from(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`),
    Buffer.from(json),
  ]);
}

export function serveMcpStdio({ input, output, session, deps }) {
  const ready = rebuildCompanyIndex(session, deps);
  let buffer = Buffer.alloc(0);
  let pending = 0;
  let ended = false;
  const finish = () => {
    if (ended && pending === 0 && output === process.stdout) process.exit(0);
  };
  const take = async (message) => {
    await ready;
    if (message?.id == null) return;
    let response;
    try {
      const result = await dispatchMcp(message, session, deps);
      response = result
        ? { jsonrpc: "2.0", id: message.id, result }
        : { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method" } };
    } catch {
      response = { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "request failed" } };
    }
    await new Promise((resolve) => output.write(encodeMessage(response), resolve));
  };
  input.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = Buffer.alloc(0);
        return;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      pending += 1;
      Promise.resolve(take(message))
        .catch(() => {})
        .finally(() => {
          pending -= 1;
          finish();
        });
    }
  });
  input.on("end", () => {
    ended = true;
    finish();
  });
}

if (isDirectRun()) {
  const accountId = process.env.SEDERUNT_ACCOUNT ?? "";
  const delegateKey = process.env.SEDERUNT_DELEGATE ?? "";
  const memory = accountId && delegateKey ? ledgerMemory({ accountId, delegateKey }) : null;
  const base = defaultDeps({ memory });
  const deps = {
    ...base,
    linear: {
      async readOpenTripTickets() {
        await appendConnectorCall(accountId, "read");
        return base.linear.readOpenTripTickets();
      },
      async createIssue(input) {
        await appendConnectorCall(accountId, "create");
        return base.linear.createIssue(input);
      },
    },
  };
  serveMcpStdio({
    input: process.stdin,
    output: process.stdout,
    session: createSession(),
    deps,
  });
}
