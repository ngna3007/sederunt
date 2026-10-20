# Precedent — primary-source angles

Checked 19 Oct 2026. Quotes are short lines from the page that owns the claim. "Published" dates are the dates search indexes or the page itself showed. Pages fetched without a visible date are marked fetched 19 Oct 2026. If a page was not opened, the item says unverified.

The product under study is a proposal. Nothing below is a claim that Precedent exists.

## 1. Name conflicts

The word is already a product name in legal research, deal review, agent underwriting, and decision memory. No search hit was a GitHub organization at `github.com/precedent`. Incorporation of any of these was not checked.

Closest live uses:

| Name | What it is | Company? | Source |
| --- | --- | --- | --- |
| `@useprecedent/precedent` 1.1.0 | CLI, GitHub Action, and skill. Finds `AGENTS.md`, Cursor rules, `CLAUDE.md`, and similar files and reports which statement should win. "A clean report means the files have a documented winner, not that the agent obeyed it." | Package published by `useprecedent`. Company status unverified. | https://www.npmjs.com/package/@useprecedent/precedent — published 15 Oct 2026 |
| `cero753/precedent` | "Decision memory and guardrails for AI agents that run marketing campaigns." Structured decisions, policy grading, bitemporal facts, deletion certificates, human approvals. 1 star. | No. A repo. | https://github.com/cero753/precedent — read 19 Oct 2026 |
| Devpost "Precedent" (h6sr1k) | "institutional-memory agent" in Slack. Human confirms. Warns when a thread reopens a settled question. Tracks commitments. MCP for Claude and Cursor. | Hackathon entry, not a company page. | https://devpost.com/software/precedent-h6sr1k — published 12 Jul 2026 |
| Devpost "Precedent" (y2fczw) | "Decision Memory for Slack." `/precedent` and `/check-precedent`. Tells the user what was decided, why, what happened after, and whether it was reversed. | Separate hackathon entry. | https://devpost.com/software/precedent-y2fczw — published 10 Jul 2026 |
| PrecedentAI | Product Hunt: "AI Powered Legal Research." Case search for lawyers. | Listed as a product. Incorporation unverified. | https://www.producthunt.com/products/precedentai — launch 9 Feb 2024; page live 2026 |
| ThePrecedent | Product Hunt, 3 Mar 2025: "AI based legal research startup" for India. Semantic case retrieval and memo drafting. | Calls itself a startup. | https://www.producthunt.com/products/theprecedent/launches/theprecedent |
| getprecedent.ai | "The Executive Assistant That Earns Your Trust." Private beta. Email, calendar, and memory. Graduated autonomy. | Product site. Incorporation unverified. | https://getprecedent.ai/ — fetched 19 Oct 2026 |
| getprecedent.com | Deal-review briefs in Slack. A third-party page says the site, read 11 Oct 2026, lists $3,500/mo up to about 20 approval deals, plus a deal-history and redline product. | Priced commercial site, per that secondary page. The vendor page was not opened here. | https://www.techbloat.com/software/precedent/ — published 17 Oct 2026, citing getprecedent.com |
| `AustinChris1/Precedent` and precedentfun.vercel.app | "A memory-native underwriter for agent-to-agent commerce" on Virtuals ACP, Sibyl Memory, and Base. Sibyl Labs Hackathon 2026. | Hackathon team, not a company filing. | https://github.com/AustinChris1/Precedent — README current as of a 24 Aug 2026 census in the file; https://precedentfun.vercel.app/ |
| `VatanCarlos-hub/Precedent-for-Hackathon` | "a court for AI agents on GenLayer." Rulings become searchable case law. Live frontend cited in the README. | Hackathon repo. | https://github.com/VatanCarlos-hub/Precedent-for-Hackathon |
| `oladipsinigami/Precedent` | "AI Trading Desk" / research workbench for tokenized stocks. Human decides. Bitget hackathon doc. | Hackathon repo. | https://github.com/oladipsinigami/Precedent/blob/main/PRODUCT-OVERVIEW.md |

No Product Hunt listing was found for an org-memory product titled exactly "Precedent." PrecedentAI and ThePrecedent are the Product Hunt hits. Palace Memory (14 Jun 2026) and Make0 Brain (10 Oct 2026) are nearby agent-memory launches under other names: https://www.producthunt.com/products/palace-memory and https://www.producthunt.com/products/make0-brain.

## 2. Who already does this job

Columns: stores / survives the tool / human confirms before it is kept / an owner resolves a contradiction (not newest-wins) / a later outcome grades the decision.

Checked against a first-party page or the project's own README unless marked otherwise.

| Product | Stores | Survives the tool | Human confirm | Owner resolves clash | Outcome grades it |
| --- | --- | --- | --- | --- | --- |
| Mem0 | Extracted facts, scoped by user, agent, app, run. "If a user says, 'I moved from Austin to Seattle,' Mem0 can store the new fact without silently rewriting the old one." Dream, always on, "marks the older memory as superseded" when a newer fact contradicts it. Superseded rows stay searchable unless `latest_only=true`. | Yes, in Mem0's store, not in the chat vendor. | No. Extraction is automatic. App can `update` or `delete`. | No. Supersede is automatic. Not an owner choice of Keep A / Keep B / write new. | No source on the Dream or how-it-works pages. |
| Letta | Memory blocks in the agent prompt. Letta Code / Letta Agent also projects them to a git-backed MemFS. Shared blocks: `memory_rethink` is "No (last-writer-wins)." | Tied to the Letta server, or to local git if the backend is local. Not described as portable across Claude, Cursor, and Codex. | No. "The agent decides when and how to update its memory." Blocks can be set read-only. | No. Last writer wins on a full rewrite. | Not in the memory pages opened. |
| Devpost Precedent (Slack, Jul 2026) | Decision title, rationale, rejected alternatives, Slack permalink, commitments. | In that app's registry, not claimed to survive Slack. | Yes. "nothing is logged without a human in the loop." | It "interjects before the argument restarts." The owner-picks-Keep-A-or-B rule is not in the description. The other Devpost entry reports whether a decision "was later reversed." | "Tracks follow-through" and nudges owners. Not a grade from PR/CI. |
| `cero753/precedent` | Stated reason, evidence, outcome, and causal conclusion, kept apart. Bitemporal metrics. | In its own store. README does not say it survives the agent runtime. | "allowlisted approvals over Slack or email" and "only humans message creators." | Not described as Keep A / Keep B / write new. | "grading policies across many decisions instead of single noisy ones." |
| `@useprecedent/precedent` | Nothing. It reports which instruction file should win. | n/a | n/a | Reports a documented winner among files. "not that the agent obeyed it." | No. |
| Walrus Memory examples | Chatbot, Noter, and Researcher store chat, notes, and a knowledge base as memories. Codebase-memory example stores code chunks, conventions, and "an architectural decision." | Yes, if the blobs remain on Walrus and someone can still decrypt. See section 3 for the restore limit. | Not in the example pages. MCP auto-save is off until the user answers a prompt, then saves without being asked. | No clash rule in the examples. | No. |
| Carry | "what memory was used, what was blocked, and whether the agent was authorized." Answer Receipts, including refusals. | Receipts and blobs on Walrus; policy on Sui. | Access is an onchain policy, not a confirm-this-decision card. | Not a decision-clash product. A receipt that claims a revoked area "is rejected by consensus." | No outcome grade of a decision. |
| Tatum Agent Pact | Encrypted agreement text on Walrus, hash and signatures on Sui. "Human approval is optional." | Yes, on Walrus and Sui. The marketing line is "No agreement data on our servers." | Optional approver wallets. | Not a clash between two past decisions. | No. |
| Unwritten | Household spend decisions and derived rules, append-only on Walrus mainnet. "No LLM in the learning path." | Author says the blobs are the record. Same author wrote on 15 Oct 2026 "Walrus Memory has no delete," which the 16 Oct docs complicate (section 3). | Not described as a confirm card. It compares a written rule with later behavior. | It flags "the rule you think you have is not the rule you actually follow." Not Keep A / Keep B. | It scores stated rules against later events. Not PR/CI/Linear. |
| Claude Code, Codex, Cursor, ChatGPT | Section 4. Local instruction files and local memory notes. | No. Machine-local or home-directory files. | Claude auto memory is written by Claude. Codex memories are generated from threads. | Claude "may pick one arbitrarily." | No. |

Not opened on a first-party page in this pass, so confirm / owner-clash / outcome-grade are unverified for: Zep, Graphiti, Hindsight, Supermemory, Cognee, Dust, Glean, Notion AI, Guru, Tettra, Almanac, Slab, Coda, Linear, Atlassian Rovo, Amazon Q, Sourcegraph Cody, Continue.dev, and ChatGPT's consumer memory settings. Mem0's own older marketing line "resolving contradictions" (https://mem0.ai/blog/introducing-mem0, 9 Sep 2024) is superseded as a mechanism by the Dream page: the system marks the old fact superseded. That is newest-fact-wins, which the proposal says it will not do.

ADRs were not re-read from a 2026 vendor. The usual artifact is a file in git (status, context, decision, consequences). No page opened here shows an ADR tool that grades the decision from CI or forces a named owner to pick Keep A, Keep B, or a new record.

No page opened here shows one product that does all of these together: a human confirm with an explicit confidence, an owner choice of Keep A / Keep B / write a new one that is not newest-wins, a later grade taken from PR/CI/Linear, and a cited chain that still resolves after the agent tool is gone. The July 2026 Slack "Precedent" entries already do human confirm plus conflict warning. `cero753/precedent` already grades policies. Carry already attaches a verifiable receipt to a memory-based answer. Those are partial overlaps, not the whole loop.

## 3. Walrus / MemWal claims

Docs: https://docs.wal.app/walrus-memory and https://github.com/MystenLabs/MemWal (`dev` docs linked from the pages).

**Namespace is not a security boundary.** Cookbook, index date 12 Oct 2026, https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant :

> "A namespace serves as a data-organization boundary, not a security boundary between users. The delegate key can read and write every namespace under the account."

Ownership and permissions, index date 16 Oct 2026, https://docs.wal.app/walrus-memory/contract/ownership-and-permissions :

> "Delegate authorization is account-wide. A namespace changes the Seal identity, but it does not stop another delegate on the same account from requesting that key."

OpenClaw, https://docs.wal.app/walrus-memory/openclaw/how-it-works (index date 5 Oct 2026): "Namespaces organize data; they are not an onchain authorization boundary."

**One MemWal account per Sui address.** Same ownership page: "Each Sui address can only create one MemWalAccount (enforced by the AccountRegistry)." Contract overview, fetched 19 Oct 2026, https://docs.wal.app/walrus-memory/contract/overview : error 3 `EAccountAlreadyExists`, "Address already has an account." `create_account(registry, clock)` is "one per address."

**Delegates can remember, recall, analyze, restore, and decrypt. They cannot manage keys.** Ownership page: delegates can store (`remember`, `analyze`), recall, restore, and decrypt through `seal_approve`. They cannot add or remove delegate keys, deactivate or reactivate, or transfer ownership. Delegate-key page, fetched 19 Oct 2026, https://docs.wal.app/walrus-memory/contract/delegate-key-management : "Only the account owner can add or remove delegate keys." Cap is 20 keys.

**Any delegate on an account can request any namespace.** Quoted above. The cookbook's multi-tenant pattern is one operator account, one delegate key, and a namespace per wallet, with isolation only if the server picks the namespace after it checks the wallet signature.

**Removing a delegate key stops future relayer use. It does not revoke content already decrypted.** Delegate-key page: "Removing a delegate key prevents future relayer access from that key." Ownership page on the rotation counter: withdrawing access "bumps the counter, which changes the identity, which yields a key the removed delegate cannot fetch." Then: "Rotation is forward-only: memories already written under an older counter stay readable with the older key. Retracting those requires re-encryption." Deactivating the account "denies" Seal decryption for every key until reactivation. That is account-wide, not a per-person revoke, and it does not erase a key the delegate already fetched.

**Seal: who decrypts, and can the relayer or a hosted plugin read plaintext.** `seal_approve` allows the account owner or a registered delegate, and only if the account is active. The key id must end with `BCS(owner_address) ‖ BCS(access_counter_version)`. The SDK "puts a namespace there," but that does not restrict other delegates.

Trust model, fetched 19 Oct 2026, https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model : the managed relayer sees "Plaintext memory content" because it embeds and encrypts, and "Decrypted content on recall." "This means the relayer operator can see your data in transit." The managed relayer is "You trust Walrus Foundation." Only `MemWalManual` "never sees your plaintext." A hosted plugin or MCP server that calls the managed relayer is on the plaintext path. MCP overview, index date 16 Oct 2026, https://docs.wal.app/walrus-memory/mcp/overview : the plugin talks to Walrus Memory tools; it is not the manual client.

**Restore re-indexes blobs after the app is gone.** Relayer API, index date 14 Oct 2026, https://docs.wal.app/walrus-memory/relayer/api-reference : `POST /api/restore` "Queries onchain blobs by owner and namespace, downloads from Walrus, decrypts, re-embeds, and re-indexes only the entries missing from the index." `limit` defaults to 10, newest blobs first. Returning-user guide, index date 16 Oct 2026: "Restore has no pagination cursor, so repeating a call at the same limit re-inspects the same newest blobs and returns nothing new." Verifiable-memory page, index date 16 Oct 2026: the index "is a cache. If it is lost, restore rebuilds it." So "delete the server and restore on another agent" is true for blobs the new delegate can still decrypt, and false as an unbounded one-call rebuild.

**Permanent deletion vs `POST /api/forget`.** Both exist in the docs, and they do not describe the same operation.

- `POST /api/forget`, same API page (14 Oct 2026): "Delete every vector index row for one namespace. The Walrus blobs persist, so a later POST /api/restore call can re-index them."
- Delete old memories, index date 16 Oct 2026, https://docs.wal.app/walrus-memory/guides/delete-old-memories : "Deleting a memory is permanent and you cannot undo it." Dashboard states include Stored, In progress, and Deleted.
- Security Delete API, https://docs.wal.app/walrus-memory/api/security-delete , fetched 19 Oct 2026: "permanently deletes legacy Walrus Blob objects that were tracked in Walrus Memory's old-V1 database." It "never deletes vector_entries directly." Routes return 404 `FEATURE_DISABLED` unless `ENABLE_MEMORY_DELETION` and `ENABLE_SECURITY_DELETE` are both on. The programmatic guide's index date is 25 Sep 2026 and describes the same sponsored-transaction flow without the word "legacy" in its opening line. The API page does use "legacy" and "old-V1."
- MCP overview, 16 Oct 2026: "Saved memories are permanent, Walrus is immutable storage" and "a stored secret cannot be deleted."

Whether the dashboard button deletes current (non-V1) blobs, or only the legacy tracked set, is not settled by these pages. `POST /api/forget` is not permanent deletion.

**No org, team, role, or "replaced by" field.** Contract overview lists `MemWalAccount` as `owner`, `delegate_keys`, `created_at`, `active`, `admin_quarantined`. `DelegateKey` is `public_key`, `sui_address`, `label`, `created_at`. No org, team, role, or replacement field. This is the docs table, not a fresh read of `account.move`. The ownership page describes `access_counter_version` and that field is not in the overview table. That mismatch was not resolved against the Move source.

A Sui registry of members, roles, and area owners would be a different contract. MemWal does not provide it. "Alice's agent can read eng but is refused on finance" is true only if those are different MemWal accounts and Alice's key is not a delegate on the finance account. Two namespaces on one account do not do that.

## 4. Claude Code, Cursor, Codex

**Claude Code.** https://code.claude.com/docs/en/memory — fetched 19 Oct 2026.

Per machine:

> "Auto memory is machine-local. All worktrees and subdirectories within the same git repository share one auto memory directory. Files are not shared across machines or cloud environments."

Path given on the same page: `~/.claude/projects/<project>/memory/`.

Contradicting instructions:

> "if two instructions contradict each other, Claude may pick one arbitrarily."

The troubleshooting section repeats: "If two files give different guidance for the same behavior, Claude may pick one arbitrarily." User rules and project rules: "if a user rule and a project rule conflict, Claude may follow either one." CLAUDE.md "is context, not enforced configuration."

**Codex.** https://developers.openai.com/codex/memories — search extract dated 5 Jul 2026. A direct fetch on 19 Oct 2026 redirected and did not return the article body, so the sentences below are from that extract, not a full re-read.

> "Memories are off by default."

> "Codex stores memories under your Codex home directory. By default, that's `~/.codex`."

> "The main memory files live under `~/.codex/memories/`."

The extract does not say memories are shared across machines. It does not state a rule for contradicting memories. Chronicle, https://developers.openai.com/codex/memories/chronicle (extract dated 8 Jul 2026): generated memories are "unencrypted markdown files" stored locally under `$CODEX_HOME/memories_extensions/chronicle/`. An official contradiction rule for Codex memories was not found.

**Cursor.** The old Memories feature is not in current product docs as a memory store. A Cursor staff reply on the official forum, 25 Nov 2025, https://forum.cursor.com/t/are-my-memories-gone/144057 : "The Memories feature was intentionally removed starting from version 2.1.x." Export path was into Rules (`.mdc`). Current rules-vs-memories behavior against contradicting rules was not found on docs.cursor.com.

Cursor BDK memory, https://cursor.com/docs/bdk/reference/memory , fetched via search 19 Oct 2026: one shared journal, "Records from every session and every user land in the same journal." "A session on a server you run yourself can't reach the journal." The hook text says to treat records "as untrusted history." That is not an owner resolving a contradiction. It is also not the IDE memories feature that was removed.

## 5. Tatum Sui gRPC

Page: https://docs.tatum.io/reference/rpc-sui — fetched 19 Oct 2026. gRPC base URL on that page: `https://sui-mainnet-grpc.gateway.tatum.io`. The method list includes:

- `sui.rpc.v2.LedgerService/GetObject`
- `sui.rpc.v2.LedgerService/BatchGetObjects`
- `sui.rpc.v2.StateService/ListDynamicFields`
- `sui.rpc.v2.SubscriptionService/SubscribeCheckpoints`

Guide: https://docs.tatum.io/reference/sui-grpc — index date 22 Jul 2026. It lists `LedgerService` for "checkpoints, transactions, and objects," `StateService` for balances and owned objects, and `SubscriptionService` to "Stream live checkpoint updates." The sample constructs `SubscriptionService` at `sui-mainnet-grpc.gateway.tatum.io:443` and calls `SubscribeCheckpoints`. Changelog https://docs.tatum.io/changelog/sui-grpc-available-tatum (page dated 22 Apr 2026, index date 3 Sep 2026): "Live checkpoint streaming: Sui gRPC also supports real-time checkpoint subscription streaming through SubscriptionService."

A developer can read a custom object by id through `LedgerService/GetObject`. Dynamic fields are listed through `StateService/ListDynamicFields`. A method named `GetDynamicField` was not in the method list captured on the RPC page. JSON-RPC on the same page still lists `suix_getDynamicFieldObject`, and Tatum's own notice says JSON-RPC was to be decommissioned after July 2026 (https://docs.tatum.io/changelog/sui-json-rpc-migration-notice). Do not plan on that JSON-RPC method.

There is no Tatum product named "live Sui feed" on these pages. The mechanism is Sui's gRPC `SubscriptionService.SubscribeCheckpoints`, and Tatum's gateway exposes that method. Checkpoint streaming is not a filter for one object's dynamic fields. Reading "the decision's current status" is `GetObject` (or a field list) on an object the app created. Tatum does not define a decision-status API.

## 6. Sui timestamps

A transaction timestamp can be a non-backdatable record of when the transaction was included. It cannot, by itself, prove the prediction was formed before the outcome. That "before" is an application rule about when the transaction was submitted.

Official model:

- Checkpoint time, https://docs.sui.io/references/sui-api/sui-graphql/beta/reference/types/objects/checkpoint : "The timestamp at which the checkpoint is agreed to have happened according to consensus. Transactions that access time in this checkpoint will observe this timestamp." Checkpoints are certified by a quorum and commit to the previous checkpoint digest (https://docs.sui.io/develop/sui-architecture — Checkpoint Verification, retrieved via Sui docs on 19 Oct 2026). A certified checkpoint's timestamp is not a field the user writes, and a later transaction cannot rewrite an earlier checkpoint.
- `Clock` at `0x6`, https://docs.sui.io/sui-stack/on-chain-primitives/access-time : `timestamp_ms` is set by a system transaction on each consensus commit. Transactions must take `&Clock`, not a mutable clock. "Successful calls to `sui::clock::timestamp_ms` in the same transaction always produce the same result." Across transactions the value does not decrease. Commits are about every quarter second, so two transactions can share a timestamp. Test-only functions can set the clock. Production entry functions cannot take `Clock` by value or `&mut`.
- `ConsensusCommitPrologueTransaction.commitTimestamp` is "Unix timestamp from consensus" (Sui GraphQL reference, same retrieval).
- `TxContext.epoch_timestamp_ms` is the epoch start, roughly 24 hours, and is embedded in the transaction. It is a coarse stamp, not a prediction time.
- A `u64` the user puts in their own object is not a stamp. The chain records that they wrote those bytes. It does not vouch for the number.

Trust line: inclusion time is consensus time of the checkpoint that contains the transaction. It stops someone rewriting history to an earlier inclusion. It does not stop them waiting until the result is known and then submitting. Monotonic, not strongly unique per transaction.

## 7. Recall.ai pricing

$0.50 per recording hour is still the Pay As You Go price on the pricing page indexed 7 Oct 2026: https://www.recall.ai/pricing — "Usage-based pricing for the Meeting Bot API and the Desktop Recording SDK" and "$0.50/hr of recording." First 5 hours free. "Recall.ai prorates billing to the second." A 30-minute meeting is given as $0.25.

First-party blog, 10 Mar 2026, updated 14 Sep 2026, https://www.recall.ai/blog/new-recall-ai-pricing-for-2026 : the Pay As You Go rate "dropped" from $0.70 to $0.50, and built-in transcription is "$0.15 per recording hour." No monthly platform fee in that post.

Stale contradiction: https://docs.recall.ai/docs/bot-usage still says "Bots are billed at $.70 per hour of usage on our pay-as-you-go plan." The pricing page and the 2026 blog are the later price. The docs page was not updated to match. Variant add-ons on that docs page (`web_4_core`, `web_gpu`) are extra on top of the base rate.

What the bot records. The product is a bot that joins the meeting. Platforms named on secondary roundups of their pricing page include Zoom, Google Meet, Teams, Webex, GoTo Meeting, and Slack Huddles. Bot-usage doc: usage runs from `joining_call` until `done` or `fatal`, and "Does bot usage include the time the bot was in the waiting room? Yes." The bot is in the call as a participant and its product is the recording. Privacy implication, from that fact rather than from a privacy-policy quote: everyone in the meeting is recorded, including people who are not the workspace admin, for as long as the bot is in the call, including the waiting room. Retention prices beyond the recording hour were not on the pricing-page extract used here. Third-party pages say 7 free days then $0.05 per stored hour. That retention figure was not confirmed on recall.ai's own pricing HTML in this pass.

## 8. Hackathon collision

Total Recall (https://tatum.io/hackathon/total-recall, live 19 Oct 2026) wants mainnet Walrus Memory and a Tatum RPC, judged in part on a learning loop. Unwritten (https://github.com/EdCryptoFi/unwritten, described by the author on 15 Oct 2026 at https://x.com/EdCriptoFi/status/2110682940132807117) is already a decision log on that hackathon: it writes household spend decisions to Walrus mainnet, derives the rule people actually follow, and says when a written rule is not the one they use. It is a household spending agreement, not an org memory with a confirm card, but it occupies "decisions on Walrus, for this event." Carry (Walrus blog, 22 Sep 2026, https://walrus.xyz/blog/carry-verifiable-agent-answers-built-on-walrus-memory/) is an older Overflow winner, not a Total Recall entry: answer receipts and an onchain access check, not an org decision lifecycle. The official codebase-memory example (https://docs.wal.app/walrus-memory/sdk/codebase-memory, fetched 19 Oct 2026) already stores "an architectural decision" as one more semantic chunk in a repo namespace and recalls it into a prompt. It does not confirm, pick a winner, or grade. A coding-agent surface that only embeds ADRs into that example is the example.

## What is load-bearing vs costume

Load-bearing, because a current first-party page says it:

- A namespace does not stop another delegate on the same account.
- One Sui address, one MemWal account. Separation means more accounts.
- The managed relayer, and therefore a hosted plugin on that relayer, sees plaintext. Only the manual client is documented as ciphertext-only.
- Removing a delegate key blocks later relayer calls and future Seal identities. Older Seal keys still open older blobs. Deactivation is the whole account.
- `POST /api/forget` drops index rows. Restore can bring them back. Restore is capped, newest-first, and has no cursor.
- `MemWalAccount` as documented has no org, team, role, or "replaced by."
- Tatum exposes `GetObject`, `ListDynamicFields`, and `SubscribeCheckpoints`. It does not sell a "live Sui feed."
- A Sui checkpoint timestamp is consensus time of inclusion. A user-supplied field is not a stamp. Submitting after the outcome is not blocked by the chain.
- Claude Code auto memory is per machine. Contradicting instructions are an arbitrary pick.
- The name Precedent is already on npm, Product Hunt, Devpost, and several repos, including two Slack decision-memory hacks.
- Recall's pricing page still says $0.50/hr. Their bot-usage doc still says $0.70/hr.

Costume, because the page does not say it, or two pages disagree:

- "Alice's agent is refused on finance" if finance is only a namespace.
- "Removing the key wipes what that agent already decrypted."
- "Permanent deletion exists" as a single fact. The 16 Oct dashboard guide says deletion is permanent. The forget route says blobs remain. The security-delete API says legacy V1 blobs, and only when two flags are on. The MCP page says stored secrets cannot be deleted.
- "Every status check reads Tatum" as if Tatum had a decision API. The capability is `GetObject` on an object the app deployed.
- "Clashes stream from Tatum's live Sui feed." The stream is checkpoints. A clash is an app comparison of memories.
- "Stamped on Sui so it cannot be backdated," if the stamp is a field in the transaction arguments, or if nothing forces the transaction to land before the result.
- "Delete the server and the other agent has the full memory," if the demo only calls `restore` once at the default limit of 10.
- A hosted Claude/Cursor plugin that "cannot read plaintext." On the managed relayer, the operator can.

## Source list

Walrus Memory

- https://docs.wal.app/walrus-memory — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant — index 12 Oct 2026
- https://docs.wal.app/walrus-memory/contract/ownership-and-permissions — index 16 Oct 2026
- https://docs.wal.app/walrus-memory/contract/delegate-key-management — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/contract/overview — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/fundamentals/concepts/memory-space — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/relayer/api-reference — index 14 Oct 2026
- https://docs.wal.app/walrus-memory/guides/delete-old-memories — index 16 Oct 2026
- https://docs.wal.app/walrus-memory/guides/manage-your-memory — index 16 Oct 2026
- https://docs.wal.app/walrus-memory/api/security-delete — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/guides/returning-user — index 16 Oct 2026
- https://docs.wal.app/walrus-memory/mcp/overview — index 16 Oct 2026
- https://docs.wal.app/walrus-memory/sdk/codebase-memory — fetched 19 Oct 2026
- https://docs.wal.app/walrus-memory/openclaw/how-it-works — index 5 Oct 2026
- https://github.com/MystenLabs/MemWal

Tatum and Sui

- https://docs.tatum.io/reference/rpc-sui — fetched 19 Oct 2026
- https://docs.tatum.io/reference/sui-grpc — index 22 Jul 2026
- https://docs.tatum.io/changelog/sui-grpc-available-tatum — changelog date 22 Apr 2026
- https://docs.tatum.io/changelog/sui-json-rpc-migration-notice
- https://docs.tatum.io/docs/data-streaming-rpc-grpc-websockets — index 25 Sep 2026
- https://apps.tatum.io/agent-pact and https://apps.tatum.io/agent-pact/docs — fetched 19 Oct 2026
- https://tatum.io/hackathon/total-recall — fetched 19 Oct 2026
- https://docs.sui.io/references/sui-api/sui-graphql/beta/reference/types/objects/checkpoint
- https://docs.sui.io/sui-stack/on-chain-primitives/access-time
- https://docs.sui.io/develop/sui-architecture (checkpoint verification)

Agent memory and the name

- https://code.claude.com/docs/en/memory — fetched 19 Oct 2026
- https://developers.openai.com/codex/memories — extract 5 Jul 2026; full refetch failed 19 Oct 2026
- https://developers.openai.com/codex/memories/chronicle — extract 8 Jul 2026
- https://forum.cursor.com/t/are-my-memories-gone/144057 — 25 Nov 2025
- https://cursor.com/docs/bdk/reference/memory
- https://docs.mem0.ai/core-concepts/how-it-works — index 24 Sep 2026
- https://docs.mem0.ai/platform/features/dream — index 4 Aug 2026
- https://docs.letta.com/guides/agents/memory-blocks/
- https://docs.letta.com/guides/agents/multi-agent-shared-memory/
- https://docs.letta.com/letta-agent/memory/ — index 11 Jul 2026
- https://www.npmjs.com/package/@useprecedent/precedent — 15 Oct 2026
- https://github.com/cero753/precedent
- https://devpost.com/software/precedent-h6sr1k — 12 Jul 2026
- https://devpost.com/software/precedent-y2fczw — 10 Jul 2026
- https://www.producthunt.com/products/precedentai
- https://www.producthunt.com/products/theprecedent/launches/theprecedent
- https://getprecedent.ai/
- https://github.com/AustinChris1/Precedent
- https://walrus.xyz/blog/carry-verifiable-agent-answers-built-on-walrus-memory/ — 22 Sep 2026 (article body from the index; a direct fetch on 19 Oct 2026 returned the site nav only)
- https://x.com/EdCriptoFi/status/2110682940132807117 — 15 Oct 2026
- https://github.com/EdCryptoFi/unwritten
- https://www.recall.ai/pricing — index 7 Oct 2026
- https://www.recall.ai/blog/new-recall-ai-pricing-for-2026 — 10 Mar 2026, updated 14 Sep 2026
- https://docs.recall.ai/docs/bot-usage — still states $0.70/hr
