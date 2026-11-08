# Requirements: Sederunt

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-11-09
**Notation:** rfc2119
**ID prefix:** SED

## Problem

A group decides something in a meeting or a channel. Later, someone who was there asks what was decided, from the agent they already use. The answer has to be the decision that was heard, and a requested change in another tool has to follow that person's setting for the tool.

## Why Now

Walrus Memory stores an encrypted sentence that outlives the chat. Walrus Console stores the file the sentence names. Tatum reads the Sui object that anchors the sentence. The meeting platforms and the agent clients already exist. Sederunt is the gate between them.

## Success Criteria

| Metric | Target | Measurement Method |
|---|---|---|
| A person who was in the room receives the decision sentence | The sentence matches the stored decision | Ask through the meeting door and through the MCP door |
| A person who was not in the room receives no sentence | The refusal contains no decision text | Ask with a member id absent from that decision |
| One delivered request produces one connector call | A repeat of the same delivery does not call again | Deliver the same utterance twice |
| An action is filed only with a connector id | No id, the action stays open | Fail the connector call and read the action |
| The public site contains no account id, key, or token | Zero matches in the landing HTML | Landing test |

## User Needs and Scenarios

### Hear the room

The bot joins a meeting or a channel and stays quiet until someone addresses it.

**Scenario:** Noah asks who can take the client call. Mina says she can, and asks Noah to send the notes. The bot is in the room, so that decision can be stored.

### Answer later

A person who was in that room asks what happened. A person who was not there does not receive the sentence.

**Scenario:** Noah asks what happened on the client call and receives the short summary. Henry asks the same question and is told to ask someone who was there.

### Act in a tool the group already uses

A member asks for one change in a connected tool. The tool's preference decides whether Sederunt waits or performs the request.

**Scenario:** The Linear tool is set to ask. Noah asks to assign a task to Rowan. Sederunt states that one assignment and waits. With the tool set to do, the same explicit request is sent once.

### Keep the file where it already lives

A decision may name a file. The sentence comes back. The bytes stay in Walrus Console.

**Scenario:** The notes were stored as a file. A later question returns the decision, and the file is still in its private folder.

## Acceptance Criteria

### Hear the room

- **SED-1.1** The system MUST treat a meeting and a channel as one kind of room.
- **SED-1.2** The system MUST store a decision only when its bot was in that room.
- **SED-1.3** The system MUST store, with the decision, the member ids present while the bot was there.
- **SED-1.4** The system MUST stay silent until a person addresses it.

### Keep the decision

- **SED-2.1** The system MUST store the decision sentence in Walrus Memory.
- **SED-2.2** The system MUST keep company decisions and personal decisions in two MemWal accounts.
- **SED-2.3** The system MUST stamp a decision with the Sui checkpoint at which it became knowable.
- **SED-2.4** The system MUST keep a replaced decision visible.
- **SED-2.5** When two decisions contradict each other, the system MUST keep both visible.

### Answer the invited

- **SED-3.1** The system MUST identify a member by the platform id from the room.
- **SED-3.2** The system MUST return a decision sentence only to a member id stored with that decision.
- **SED-3.3** The system MUST refuse a caller who presents no member id.
- **SED-3.4** The meeting door, the channel door, and the MCP door MUST use the same invite check.
- **SED-3.5** Member web access MUST use Google sign-in only. Signed platform requests and configured local MCP identities MUST continue to work without a separate web login. No member wallet connection is required.

### Act on a request

- **SED-4.1** The system MUST store each write tool's preference, ask or do, with the account.
- **SED-4.2** A write tool with no stored preference MUST behave as do (Run automatically). An explicit ask preference MUST continue to pause a write until that specific action is authorized.
- **SED-4.3** When the preference is ask, the system MUST state the one action and wait.
- **SED-4.4** When the preference is do, the system MUST perform an explicit request without a pending confirmation.
- **SED-4.5** The system MUST stop an action while a fact it needs is missing.
- **SED-4.6** The system MUST mark an action filed or updated only after the connector returns an id.
- **SED-4.7** The system MUST make one connector call for one delivered request.
- **SED-4.8** A read MUST ignore the write preference.
- **SED-4.9** A connector call that returns no id MUST leave the action available to send.

### Reliable access and recovery

- **SED-8.1** Room, board, proof, semantic recall and generated output MUST continue to enforce the stored invitation and current tenant boundary; a shared configured member MUST NOT grant another web user attendance.
- **SED-8.2** A deleted decision MUST remain hidden after retry, replay and restart. The system MUST NOT report completed deletion without durable acceptance.
- **SED-8.3** Ask history, streams and model context MUST be scoped to the authenticated user, tenant and personal/company selection. Rejected requests MUST NOT consume quota.
- **SED-8.4** File visibility and pending operations MUST survive process changes and remain consistent across application instances. Current session and membership checks MUST continue to protect downloads.
- **SED-8.5** Custom connector connections MUST use validated public destinations, including the actual socket connection and every redirect.

### Meeting follow-ups

- **SED-9.1** Meeting completion MUST create a durable outcome and recoverable delivery work. Repeated callbacks MUST NOT create duplicate completed actions.
- **SED-9.2** Explicit authorized requests MUST continue to follow the selected preference and missing-fact rules. AI-inferred proposals MUST require the verified requester's approval before execution; completed requests MUST NOT be proposed as new writes.
- **SED-9.3** The requester MUST be able to Approve, Edit or Skip a proposal in Slack. Authorization MUST cover the exact argument version and tenant, and every write MUST continue through the common allow gate.
- **SED-9.4** Concurrent or repeated approvals MUST NOT knowingly execute a completed write again. An unknown provider outcome MUST be reconciled before retrying a non-idempotent write.
- **SED-9.5** Minutes MUST reach only permitted recipients, using one channel destination or attendee DMs. Private meeting minutes MUST NOT be posted to a channel. Unmatched people MUST be reported as not reached, without claiming email delivery.
- **SED-9.6** Follow-up state and delivery receipts MUST survive restart. Failure and pending states MUST have a clear recovery action.

### Prove the object

- **SED-5.1** The system MUST read the decision's Sui object through Tatum.
- **SED-5.2** When the recalled sentence and the object disagree, the system MUST follow the object.
- **SED-5.3** When the Tatum read fails, the system MUST report the status unknown.
- **SED-5.4** A proof MUST include the checkpoint sequence and the write preference in effect for that action.

### Name a file

- **SED-6.1** The system MUST store a file in a private Walrus Console folder.
- **SED-6.2** The decision sentence MUST name the file.
- **SED-6.3** A recall MUST return the decision sentence.
- **SED-6.4** A recall MUST leave the file bytes in Walrus Console.

### Protect the account

- **SED-7.1** The system MUST keep the owner key off the server.
- **SED-7.2** A member-facing answer MUST omit keys.
- **SED-7.3** A member-facing answer MUST omit tokens.
- **SED-7.4** A member-facing answer MUST omit account ids.
- **SED-7.5** The log MUST omit keys, tokens, and account ids.
- **SED-7.6** The system MUST NOT spend SUI, WAL, or USDC from a member.

## Scope

### In Scope

- One Node process and one gate for every door.
- Company account and personal account.
- Meeting bot, channel room, and local MCP client.
- Write preference per tool.
- Tatum proof of the object.
- A private Console file named by the decision.
- The public landing page.

### Out of Scope

- Non-Google member web sign-in, member passwords, zkLogin and wallet connection.
- A product page at `/record`.
- A second semantic memory source of truth. Durable access, job and execution metadata may use the existing application database.
- Sponsored-transaction infrastructure. Memory's public relayer and Console already pay for their own writes.
- Slack huddles. The meeting door covers Zoom, Google Meet, Teams, and Webex.
- Spending, a wallet flow, the Tatum Data API, and the Tatum Storage API.

## Risks and Assumptions

### Risks

| Risk | Likelihood | Impact | Why It Exists | Mitigation |
|---|---|---|---|---|
| The public relayer sees plaintext | high | high | That is how the managed relayer encrypts and embeds | Say so. Keep the owner key off the server. A self-hosted relayer is a later deployment of the same gate |
| A memory blob expires | medium | high | The public relayer pays the write. The delegate has no renew scope | Record the expiry epoch when the relayer returns it. Console files renew on their own |
| Anyone holding the delegate key can decrypt the account | medium | high | Delegate access is account-wide | Members never receive the key. They reach the gate |

### Assumptions

- Recall reports a stable participant id for the length of a meeting. A display name is not that id.
- The same human in two meetings may have two member ids. Only verified provider evidence may link those ids to a signed-in person.
- The operator registers Sederunt's delegate key on Walrus Memory, using the zkLogin that product already has.

## Constraints

- One ESM Node package and server process. Runtime dependencies are declared in `package.json`.
- The landing does not post, does not load a MemWal key, and does not render an account id.
- The product name is Sederunt.

## Related Documents

### Downstream Design

- [System](../design/system.md) — process, doors, and gate
- [Entities](../design/entities.md) — records and invariants
- [Access](../design/access.md) — who may hear a sentence
- [Record](../design/record.md) — Memory, Console, and the Tatum proof
- [Actions](../design/actions.md) — write preference and connectors
- [Workspace](../design/workspace.md) — the operator workspace
- [Rooms](../design/rooms.md) — bringing the bot into a room

## Links

- Design: [docs/design/system.md](../design/system.md)
- Decisions: [docs/decisions/](../decisions/)
