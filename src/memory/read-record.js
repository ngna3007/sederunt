import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { redact } from "../domain/redact.js";
import { ledgerMemory } from "./ledger.js";
import { createSession } from "../session.js";
import { handleUtterance } from "../typed-path.js";

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function reply(fields) {
  return {
    status: fields.status ?? "recorded",
    kind: fields.kind ?? "answer",
    body: redact(fields.body ?? ""),
    issueId: null,
    allow: fields.allow ?? "read",
    preference: fields.preference ?? null,
    link: null,
    entered: true,
    decisionId: fields.decisionId ?? null,
    actionId: null,
    checkpoint: fields.checkpoint ?? null,
    objectLink: fields.objectLink ?? null,
  };
}

if (isDirectRun()) {
  const accountId = process.env.SEDERUNT_ACCOUNT ?? "";
  const delegateKey = process.env.SEDERUNT_DELEGATE ?? "";
  const memberId = process.env.SEDERUNT_MEMBER ?? "";
  const roomId = process.env.SEDERUNT_ROOM ?? "";
  const memory = accountId && delegateKey ? ledgerMemory({ accountId, delegateKey }) : null;
  try {
    const session = createSession();
    const result = await handleUtterance({
      text: process.env.SEDERUNT_TEXT || "what was decided",
      session,
      memberId,
      door: "mcp",
      intent: "recall",
      room: roomId ? { id: roomId, botPresent: true, memberIds: [] } : undefined,
    }, { memory });
    for (const event of session.events) process.stderr.write(`${JSON.stringify(event)}\n`);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "Request failed");
    process.stdout.write(JSON.stringify(reply({ body: message, allow: "read" })));
    process.exitCode = 1;
  }
}
