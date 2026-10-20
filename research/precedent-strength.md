# Precedent — angles and the cut

19 Oct 2026. Primary-source check of the org-memory idea, then the version that can survive the three tests. Scores below are judgment, not a measurement.

The wide version (company, every team, every person, Claude Code, Codex, Cursor, Slack, meeting bot, GitHub, CI, Linear, a live clash feed) is a platform. The contest demo is one decision's life. The notes below are what has to be true for that life to need Walrus and Tatum.

## Name

"Precedent" is already in use for this job and for several neighbors.

- Devpost, 12 Jul 2026, Aayush Pokhrel: "Precedent — the Slack agent that remembers every decision, defends it with receipts, and chases every commitment." Human confirm, provenance, re-litigation guard, "why did we," MCP so Claude or Cursor can query it. Storage is sqlite. https://devpost.com/software/precedent-h6sr1k
- A second Devpost, 10 Jul 2026, "Precedent - Decision Memory For Slack," with conflicting-decision and reversed-decision frames. https://devpost.com/software/precedent-y2fczw
- getprecedent.ai: "The Executive Assistant That Earns Your Trust." Private beta. Email, calendar, memory.
- GitHub `cero753/precedent`: agentic decision memory for go-to-market. `AustinChris1/Precedent`: a credit bureau for agents. `oladipsinigami/Precedent`: an AI trading desk.

The name is not free. The July Slack project is the same sentence as this pitch, minus the chain. A judge who has seen it will call a Slack-card demo a port. Rename before the video. Do not ship the confirm step as a Slack bot.

"Called It" is also taken in public: https://calledit.one (a friends prediction game) and a May 2026 Indie Hackers app, CalledIt, with an MCP server. If the other candidate keeps that name, check it the same way.

## What already does the job

| Already shipped | What it holds | What it does not do |
| --- | --- | --- |
| Slack Precedent, Jul 2026 | Decisions, why, receipts, human confirm, MCP | Not on Walrus. One sqlite file. No graded calibration. No second account. |
| Mem0 | Extracts facts, including a line like "Project decision: use Postgres." Scopes by user, agent, run. Platform adds org and project. https://docs.mem0.ai/core-concepts/how-it-works (page dated 24 Sep 2026) | The model writes the fact. Newest similar fact wins the next prompt. No owner, no chain stamp, no "replaced by" the app enforces. |
| Claude Code | `CLAUDE.md` is context, not a lock. Contradictions: "Claude may pick one arbitrarily." Auto memory "is machine-local." https://code.claude.com/docs/en/memory (fetched 19 Oct 2026) | Leaves the machine. Cannot refuse a second tool. |
| Cursor rules | Team rules outrank project rules, which outrank user rules. https://cursor.com/help/customization/rules | Rules are instructions. They are not a decision with an outcome. A secondary write-up says Memories were removed in 2.1 (Nov 2025); the official rules page no longer describes them. |
| ADRs in git | The team already has a place for "we use Postgres, because…" | An agent does not have to read them, and a new chat can contradict them. |
| Unwritten | Household spend rules, Tatum transfer match, Walrus versions | Different job. Do not drift into "who may spend." |
| Carry, official Walrus examples | Answer receipts, chatbot, notes, researcher, codebase memory | A transcript or a repo summary is not this. |

The gap that is still open: a decision the model cannot mark current, stamped before the result exists, readable by a second agent that was given only an account id, and unreadable by an agent that was never given that account's key.

## Claims to correct

**Current status cannot come from recall.** Walrus's own multi-tenant cookbook says semantic recall "is not a reliable way to fetch one authoritative current profile record." https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant (page dated 12 Oct 2026). AgentMemGate (arXiv:2610.07707, 6 Oct 2026) found Mem0 and Graphiti stating unresolved plans as current for 35.2% and 27.3% of pending plans. Those numbers are theirs, not ours. The consequence for us: the word on the screen is a field in a Sui object. Walrus stores the prose. Tatum `LedgerService/GetObject` reads the object. If recall and the object disagree, the object wins.

**"Kill the server and restore" is the wrong verb when the public relayer is healthy.** The search index lives in the relayer. A new agent with a delegate key can `recall` immediately. `restore` rebuilds that index after the relayer loses rows. Default `limit` is 10, newest first, and there is no cursor. Repeating the call at the same limit re-sees the same blobs. https://docs.wal.app/walrus-memory/guides/manage-your-memory (page dated 16 Oct 2026) and the returning-user guide. Demo the second agent with recall. Mention restore only as the index rebuild, and raise `limit` if you show it.

**There is no Tatum live clash feed.** Tatum's Sui gRPC method list includes `SubscriptionService/SubscribeCheckpoints` and `LedgerService/GetObject`. It does not list `SubscribeEvents`. https://docs.tatum.io/reference/rpc-sui (page dated 7 Oct 2026). The Sui gRPC guide's stream example is `SubscribeCheckpoints` on `sui-mainnet-grpc.gateway.tatum.io:443`. https://docs.tatum.io/reference/sui-grpc. WebSocket subscriptions on Tatum are Solana, Ethereum, and Polygon. https://docs.tatum.io/docs/websocket-event-subscriptions (page dated 2 Oct 2026). A clash is an object you write. The screen reads it with `GetObject`. A checkpoint stream is a firehose of the whole chain, not a clash inbox.

**The stamp is the checkpoint, not a date inside the memory.** `sui::clock::Clock` at `0x6` is updated by the system when consensus commits. Callers can only read it. https://docs.sui.io/sui-stack/on-chain-primitives/access-time (page dated 16 Oct 2026). A checkpoint timestamp is "the timestamp at which the checkpoint is agreed to have happened according to consensus." https://docs.sui.io/references/sui-api/sui-graphql/beta/reference/types/objects/checkpoint. A "decided at" string inside a Walrus blob can say anything. The call transaction's checkpoint sequence is the order you compare against the later grade transaction.

**Finance refusal is real only if the finance key is absent from that process.** A namespace is "not a security boundary." Any delegate on an account can request any namespace. One MemWal account per Sui address. https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant and https://docs.wal.app/walrus-memory/contract/ownership-and-permissions (page dated 16 Oct 2026). Eng and finance are two accounts. Alice's agent holds only the eng delegate. `seal_approve` then refuses finance. A hosted plugin that keeps every team's key can read every team. The demo agent must hold one key.

**Removing a key stops the next decrypt. It does not reach backward.** Delegates can remember, recall, analyze, and restore. They cannot manage keys. Removing the key removes that address from `delegate_keys`, so the next relayer call and the next Seal approval fail. Deactivating the account denies every key. Content already decrypted stays decrypted. Permanent deletion exists, as of the 16 Oct 2026 manage-memory guide, and it is a separate, explicit act. `POST /api/forget` only drops index rows. Do not say offboarding deletes anything.

**Confirm is a copy.** The person's account is theirs. The company keeps a decision only if confirm writes it onto the company account. A note that never left the personal account leaves with the person. That copy is the product, not a sync feature.

**Recall.ai's $0.50 an hour is the recording rate, still on the pricing page.** https://www.recall.ai/pricing. Transcription is a separate $0.15 an hour. First 5 hours of recording are free. The bot records the meeting. Consent is the product problem. Keep it out of the judged demo. A pasted line is enough to propose a decision.

## The cut

One area, one decision chain, two MemWal accounts, one Sui object, one MCP tool the agent must call before it treats a decision as current.

The screen is the chain for the database. The status word is `current`, `clashing`, or `replaced`. Code sets it from the object. The model may only narrate.

1. The agent proposes "use Postgres" and must attach likely, coin-flip, or long shot. A coin-flip cannot become current. It sits as a proposal.
2. A person confirms. That writes the prose to the company account and stamps a call object. The checkpoint sequence is the stamp.
3. A later proposal says "switch to MySQL." Code compares it to the current object. Both stay visible. The area owner sends the transaction: Keep A, Keep B, or a new one. The model cannot send that transaction.
4. A merged pull request adds a MySQL dependency while the object still says Postgres. The grade memory says "that one slipped." The object stays Postgres until the owner replaces it.
5. A second agent, given only the company account id and a delegate key, calls recall and Tatum `GetObject`. It answers Postgres, with the why, and it will not cite the replaced record as current.
6. The same agent pointed at the finance account is refused. Then the company owner removes the delegate. The next write fails. The chain is still there for a key that remains.

Week one, with an empty grade book, a likely call can become current after a person confirms. Week four, the grade book says the last four coin-flips on this area landed once. The screen still refuses to promote a coin-flip, and it refuses to quote a replaced id. That is the loop. It is about the class of call, not about Linh. A private score of a person is the Keeps mistake again. Leave it out.

The Sui object holds area owner, current decision id, replaced-by, the confidence that was stamped, and the checkpoint sequence of the call. It does not hold a second membership list. The MemWal delegate list is who can read that account.

Ten Mainnet memories on this one chain, older ones labeled as seeded: the proposal, the confirm, the clash, the owner's pick, the grade, the replacement, and the lesson that coin-flips on this area do not promote.

## What not to build for the demo

Codex packaging, Cursor packaging, a Slack app, Linear, CI as a second grader, a meeting bot, a person leaderboard, a checkpoint firehose, an org chart of every team. One GitHub merge is the grader. One extra account is the privacy scene. Further teams are the same pattern, said in the blog, not built.

## Score after the cut

Judgment only.

| Test | Weight | Cut version | Why |
| --- | --- | --- | --- |
| Sharper each week | 25 | 22 | A coin-flip that would have been confirmed in week one stays a proposal in week four, because graded memories say so. |
| Walrus is necessary | 20 | 17 | The second agent and the finance refusal die if the prose and the keys live in this app's database. The clash math itself does not need Walrus. |
| Tatum does work | 10 | 9 | `GetObject` decides the word on the screen. The checkpoint sequence is the order of the stamp and the grade. |
| Not a collision | 15 | 11 | The Slack Precedent and Mem0 already store "we use Postgres." The object, the stamp, and the account split are the difference a judge can see. The name still collides until it changes. |
| A person gets it | 15 | 13 | A tech lead asks an agent why the database is Postgres, and the answer cites a chain the agent cannot edit. |
| Shippable honestly | 10 | 8 | Two accounts, one object, one MCP, one repository. The platform plan is not this score. |
| Claims survive | 5 | 4 | Only if the demo says recall is not authority, restore is not the happy path, and no accuracy number is ours. |

Total 84, if the cut is what gets built. The uncut platform stays in the 74–76 band you already gave it, because collision and shipping fall.

## Called It, as a score

The higher score on a calibration toy is the week test with nothing else attached. This cut takes that loop and keeps the part a toy can skip: the decision is on an account the next agent can restore access to, and on an account it can be refused. Building both is a second product. One submission.

## Do not claim

- The name is clear.
- The meeting bot, or any host that holds the delegate key, cannot read the memory.
- Offboarding deletes memories or takes back a plaintext someone already opened.
- Walrus Memory has organizations, roles, or replaced-by.
- Clash detection catches paraphrases. The demo clash is one the code matches. Semantic misses stay misses.
- A Grok plugin, unless it is the one you show.
- Any hit rate you have not measured. "7 of 9" in a demo is a seeded label or a live count, and the video says which.

## Deeper pass, same day

Source notes: `research/precedent-angles.md`. These correct the cut above.

**Removing a key does not lock the old blobs.** The delegate-key page says removal prevents future relayer access from that key. The ownership page says withdrawing access bumps a counter and yields a Seal identity the removed delegate cannot fetch, then: "Rotation is forward-only: memories already written under an older counter stay readable with the older key. Retracting those requires re-encryption." Deactivating the account denies every key, the whole company, until someone turns it back on. It is not a per-person lock, and it does not erase a key the person already fetched. The offboarding line in the pitch overclaims. The true demo is: the next relayer write fails. Old blobs stay readable until they are re-encrypted. Say that.

**The managed relayer sees the prose.** The data-flow page says the managed relayer embeds and encrypts, and decrypts on recall, so the operator can see the data in transit. Trust line on that page: you trust Walrus Foundation. Only `MemWalManual` is documented as never seeing plaintext. A plugin on the public relayer is on that path. The finance scene is still real as a delegate refusal. It is not "nobody can read finance."

**A late stamp still counts unless the app rejects it.** A checkpoint timestamp is consensus time of inclusion. It cannot be rewritten earlier. It does not stop someone waiting until the pull request merges and then submitting "I called it." Two commits can share a timestamp, about a quarter second apart. The grade counts only when the call's checkpoint is before the result was knowable. Show a late stamp being refused. That refusal is the app, using Tatum to read both times.

**The name is worse than the Slack bot.** `@useprecedent/precedent` 1.1.0, published 15 Oct 2026, reads `AGENTS.md`, Cursor rules, and `CLAUDE.md` and reports which statement should win. Its own line: a clean report means the files have a documented winner, not that the agent obeyed it. Product Hunt also has PrecedentAI (legal research, 9 Feb 2024) and ThePrecedent (India legal research, 3 Mar 2025).

**Recalling "we use Postgres" is the official example.** https://docs.wal.app/walrus-memory/sdk/codebase-memory already stores an architectural decision as a chunk and recalls it into a prompt. It does not confirm, pick a winner, or grade. If the demo stops at recall, it is that example.

**Mem0 already supersedes.** Dream, always on, marks the older fact superseded when a newer one contradicts it. Superseded rows stay searchable unless `latest_only=true`. That is newest-fact-wins. The owner's Keep A / Keep B / write new is the difference, and only if code sends that transaction.

**Do not say deletion is one thing.** `POST /api/forget` drops index rows and restore can bring them back. The 16 Oct dashboard guide says deleting a memory is permanent. The security-delete API is legacy V1 blobs and returns 404 unless two flags are on. The MCP page says a stored secret cannot be deleted. The product appends a replacement. It does not promise a delete.

**Recall.ai.** The pricing page says $0.50 per recording hour. https://docs.recall.ai/docs/bot-usage still says $0.70. The bot bills from the moment it joins, including the waiting room, and it records everyone on the call. Codex memories, from a 5 Jul 2026 extract of the OpenAI docs, live under `~/.codex/memories/` and are off by default. A full refetch on 19 Oct 2026 did not return that article. Cursor staff, 25 Nov 2025, said Memories were removed in 2.1.x.
