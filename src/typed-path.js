import { authorize } from "./domain/allow.js";
import { itemStatus } from "./domain/status.js";
import { parseUtterance } from "./parse.js";
import { proposalIdFor } from "./session.js";

/**
 * Typed path. Allow is decided before any connector call.
 * `deps.linear` is the only Linear boundary. Tests pass a counter.
 *
 * @param {{ text: string, session: ReturnType<import("./session.js").createSession>, spokenYes?: boolean }} input
 * @param {{ linear?: { readOpenTripTickets(): Promise<unknown>, createIssue(input: { title: string }): Promise<{ identifier?: string, id?: string }> }, memory?: { remember(input: unknown): Promise<unknown> } }} deps
 */
export async function handleUtterance(input, deps = {}) {
  const session = input.session;
  const parsed = parseUtterance(input.text);

  if (parsed.type === "yes") {
    if (!session.pending) {
      return reply({
        status: "recorded",
        kind: "note",
        body: "yes\nrecorded\nThere is no proposed write.",
        issueId: null,
        allow: "missing-allow",
      });
    }
    return commitWrite(session, session.pending, deps);
  }

  if (parsed.type === "read") {
    const auth = authorize({
      action: "read",
      tool: parsed.tool,
      standingAllows: session.standingAllows,
      spokenYes: null,
    });
    const data = await deps.linear.readOpenTripTickets();
    const body = formatTripRead(data);
    session.items.push({
      kind: "answer",
      status: "recorded",
      text: body,
      issueId: null,
    });
    return reply({
      status: "recorded",
      kind: "answer",
      body,
      issueId: null,
      allow: auth.reason,
    });
  }

  if (parsed.type === "write") {
    const proposal = {
      proposalId: proposalIdFor(parsed.title),
      title: parsed.title,
      tool: parsed.tool,
    };
    session.pending = proposal;
    const yes = input.spokenYes
      ? { proposalId: proposal.proposalId, tool: proposal.tool }
      : null;
    const auth = authorize({
      action: "write",
      tool: proposal.tool,
      proposalId: proposal.proposalId,
      standingAllows: session.standingAllows,
      spokenYes: yes,
    });
    if (!auth.allowed) {
      session.items.push({
        kind: "ticket",
        status: "recorded",
        text: parsed.title,
        issueId: null,
      });
      return reply({
        status: "recorded",
        kind: "ticket",
        body: `${parsed.title}\nrecorded\nCreation is not allowed. Say yes to file this write only.`,
        issueId: null,
        allow: auth.reason,
      });
    }
    return commitWrite(session, proposal, deps);
  }

  const status = itemStatus({ kind: "note" }, null);
  if (deps.memory) {
    await deps.memory.remember({
      account: parsed.private ? "personal" : "company",
      text: parsed.text,
      kind: "note",
      private: parsed.private,
    });
  }
  session.items.push({
    kind: "note",
    status,
    text: parsed.text,
    issueId: null,
    private: parsed.private,
  });
  return reply({
    status,
    kind: "note",
    body: `${parsed.text}\n${status}`,
    issueId: null,
    allow: "read",
  });
}

async function commitWrite(session, proposal, deps) {
  if (session.spentYes.has(proposal.proposalId)) {
    return reply({
      status: "recorded",
      kind: "ticket",
      body: `${proposal.title}\nrecorded\nThat yes was already used.`,
      issueId: null,
      allow: "missing-allow",
    });
  }
  const auth = authorize({
    action: "write",
    tool: proposal.tool,
    proposalId: proposal.proposalId,
    standingAllows: session.standingAllows,
    spokenYes: { proposalId: proposal.proposalId, tool: proposal.tool },
  });
  if (!auth.allowed) {
    return reply({
      status: "recorded",
      kind: "ticket",
      body: `${proposal.title}\nrecorded\nCreation is not allowed. Say yes to file this write only.`,
      issueId: null,
      allow: auth.reason,
    });
  }

  session.spentYes.add(proposal.proposalId);
  if (session.pending?.proposalId === proposal.proposalId) session.pending = null;

  let created;
  try {
    created = await deps.linear.createIssue({ title: proposal.title });
  } catch {
    session.items.push({
      kind: "ticket",
      status: "recorded",
      text: proposal.title,
      issueId: null,
    });
    return reply({
      status: "recorded",
      kind: "ticket",
      body: `${proposal.title}\nrecorded\nThe edit did not happen.`,
      issueId: null,
      allow: auth.reason,
    });
  }

  const issueId = String(created?.identifier || created?.id || "").trim();
  const status = itemStatus({ kind: "ticket", edit: "create" }, issueId);
  if (status !== "filed") {
    session.items.push({
      kind: "ticket",
      status: "recorded",
      text: proposal.title,
      issueId: null,
    });
    return reply({
      status: "recorded",
      kind: "ticket",
      body: `${proposal.title}\nrecorded\nThe edit did not happen.`,
      issueId: null,
      allow: auth.reason,
    });
  }

  session.items.push({
    kind: "ticket",
    status,
    text: proposal.title,
    issueId,
  });
  if (deps.memory) {
    await deps.memory.remember({
      account: "company",
      text: `${proposal.title}\n${issueId}`,
      kind: "ticket",
      issueId,
    });
  }
  return reply({
    status,
    kind: "ticket",
    body: `${proposal.title}\nfiled\n${issueId}`,
    issueId,
    allow: auth.reason,
  });
}

export function formatTripRead(data) {
  const trip = data?.trip ?? data?.issues ?? [];
  const open = data?.open ?? [];
  const lines = ["What tickets are open for the trip?", "team ROW"];
  lines.push("Matching the trip:");
  if (trip.length === 0) lines.push("No open Linear issue matched the trip.");
  for (const issue of trip) lines.push(issueLine(issue));
  if (open.length > 0) {
    lines.push("Open issues read from team ROW:");
    for (const issue of open) lines.push(issueLine(issue));
  }
  lines.push("This read created nothing.");
  return lines.join("\n");
}

function issueLine(issue) {
  return [issue.identifier || issue.id, issue.title, issue.status || issue.state]
    .filter(Boolean)
    .join(" ");
}

function reply(fields) {
  return {
    status: fields.status,
    kind: fields.kind,
    body: fields.body,
    issueId: fields.issueId,
    allow: fields.allow,
  };
}
