# Research prompt — one Total Recall idea

Paste the block below into a fresh researcher. It is the assignment. Do not soften it.

---

You are a hostile product researcher for one hackathon entry. Return one idea, or return nothing. A menu is a failed assignment.

Today is after 18 Oct 2026. The contest is already public. Another strong entry is already on Mainnet. Your job is to find a product a judge can tell from that entry in the first minute of a demo, that a person would open on purpose, and that fails if Walrus Memory is removed.

## The contest, as checked 18 Oct 2026

Primary page: https://tatum.io/hackathon/total-recall  
Form: https://recall-tatum-walrus.vercel.app

- Build window 20 Oct–10 Nov 2026. Submissions close 10 Nov 2026, 17:00 UTC.
- Pool $4,500 USDC. Three tracks, $1,000 each, paid 1st/2nd/3rd = $500/$300/$200: (1) Markets & Sports Prediction, (2) Smart Agents for Real Life, (3) Consumer Finance Apps.
- One submission per person. One project is judged once, in one track. Bonuses stack on that prize. Three forms can disqualify you.
- Bonuses: Best Walrus Memory $500, for the deepest learning loop, memories that visibly change the product. Best Tatum AI Builder $500 only if the product is built primarily on https://ai.tatum.io. A mystery $500 lives on Discord and must not drive the design.
- Judging: 30% Walrus + Tatum integration, 30% technical quality with a working Tatum Sui RPC, 20% creativity, 20% presentation. The page says execution beats novelty. The page says the product gets sharper every week, not every login.
- A valid entry writes Walrus Memory on Sui Mainnet, at least 10 memories, uses Tatum where onchain data is needed, and ships a public repo, a working demo, a 2–3 minute video, and a blog post on how it learned over time.
- Form fields: Tatum ID from dashboard.tatum.io, a Sui address, a Sui account ID, and MEMWAL_AGENT_ID = the delegate public key from https://memory.walrus.xyz/dashboard.
- Do not bend the product onto ai.tatum.io unless it is actually built there.

Re-check the live page and the Walrus docs before you treat any of the above as still true. If a rule changed, say so and cite the page.

## What Walrus Memory is

TypeScript SDK `@mysten-incubation/memwal`. Relayer https://relayer.memory.walrus.xyz. Operations: remember, rememberAndWait, recall, analyze, ask, listMemories, listNamespaces, restore.

- One MemWalAccount per Sui address. The owner adds and removes delegate keys (max 20) and can freeze the account, which denies Seal decryption.
- A delegate can remember, recall, analyze, and restore. A delegate cannot manage keys.
- Any registered delegate can request any namespace on that account. A namespace is not a privacy boundary. Real separation is a second account, which means a second Sui address.
- Content is Seal-encrypted. Namespace names and ownership are public.
- Docs updated 16 Oct 2026: permanent deletion exists (dashboard and Security Delete API). `POST /api/forget` only drops index rows. The blobs remain, and restore can re-index them. Do not write "Walrus has no delete." The allowed policy is: append a new memory that names the one it replaces.
- Docs to re-read: https://docs.wal.app/walrus-memory and the pages on delegate keys, ownership and permissions, manage-your-memory, and the relayer API.

## What Tatum is

Tatum is the pipe to the chain. It is not the notebook.

- Sui JSON-RPC gateway: https://sui-mainnet.gateway.tatum.io (`suix_getBalance`, `suix_getAllBalances`, `suix_queryTransactionBlocks`, `sui_getObject`, `sui_getTransactionBlock`). Docs: https://docs.tatum.io/reference/rpc-sui
- Sui gRPC gateway: https://sui-mainnet-grpc.gateway.tatum.io
- Public Sui JSON-RPC is deprecated. If Tatum JSON-RPC fails, use Tatum gRPC. Do not fall back to a public full node.
- The v4 Data API chain table does not list Sui. Do not plan on `/v4/data/wallet/balances` for Sui.
- Tatum Storage API uploads Walrus blobs. That is not Walrus Memory and does not satisfy remember / recall.
- A wallet address in a footer is a failed integration. The RPC call has to decide something on the screen.
- Match a USDC transfer on coin type and amount. A SUI balance change is the wrong signal, because gas makes an honest payment look wrong.
- Agent Pact (https://apps.tatum.io/agent-pact) already stores encrypted agent agreements on Walrus through Tatum. Do not rebuild it.

## What the user has already rejected

Each of these died for a reason. A rename is the same idea.

| Dead idea | Why it died |
| --- | --- |
| Fold | Hand-filled sports pick board. The Markets track example. User moved on. |
| Scout | Forecasting agent. Memory does not help the next unrelated question (arXiv:2610.07782). |
| Staff | Hire/fire delegate keys. An admin ceremony. The product does not get sharper. |
| Lapse | Keep/cut memory cards. User: "not interesting enough." A settings screen. |
| Said | Rumor / confirmation cards. A typed rule. It does not learn. |
| Aside | Two relationships, two accounts, one sentence copied by hand. Changes once. Two databases reproduce it. |
| Keeps | Group agent that learns who flakes. User: it can also be a prompt. "We are building a project." The flake-score has no demand evidence. RSVP apps sell a fresh yes/no/maybe. |
| Pot | One collection for a beach-house trip. User: not a good use case, too small. Paying requires a Sui wallet and USDC, so a normal friend group will not adopt it. |
| Unwritten clone | Ed (@EdCriptoFi) already shipped the household spending-rule learner for this contest, 15 Oct 2026. https://github.com/EdCryptoFi/unwritten https://unwritten-house.vercel.app https://x.com/EdCriptoFi/status/2110682940132807117 |
| Mandate, pending | Overnight agent spend tab. User has not accepted it, and asked why it needs Walrus. Reuse it only if you pass the Walrus test below in the open. A settings form that says "daily limit $25" is Locus, Pink Wallet, Nevermined, or Skyfire. |

Also crowded, so do not submit a cousin of these: official Walrus examples (chatbot, noter, researcher, codebase memory), Carry's answer receipts (https://walrus.xyz/blog/carry-verifiable-agent-answers-built-on-walrus-memory/), and Session 8 "Chatbots That Remember."

## The three tests, in order

Fail any one and kill the idea. Do not negotiate.

1. **Project test.** There is a screen with state. The status on that screen is computed by code from stored records and chain reads. The model may talk. The model cannot set the status, release money, or overwrite the record by arguing. If the whole behavior fits in a system prompt plus the Walrus SDK, it is not a project.

2. **Walrus test.** Name the moment that breaks if the memories live in this app's database. The moment has to be one of these, shown on screen: a second agent, given only the account id, calls restore and the screen makes the same decision; or the owner calls removeDelegateKey, the agent can no longer write, and the records remain. "We need 10 memories for the form" is not a reason. "It persists" is not a reason. A private database persists.

3. **Week test.** Week one and week four show the same kind of input. The screen's decision changed because of what was stored in between. Old records stay visible. A one-time approval, a privacy wall, a key ceremony, or a rule we typed on day one fails this test.

Then apply the rest. Score each out of its weight. These scores are judgment. Say so.

| Test | Weight | Kill if |
| --- | --- | --- |
| Sharper each week | 25 | The decision is the same on day one and day thirty. |
| Walrus is necessary | 20 | A database in this app reproduces the demo. |
| Tatum does work | 10 | The chain read is a footer, or Sui data is faked. |
| Not a collision | 15 | A judge can name the existing product in one sentence. |
| A person gets it | 15 | You cannot say who opens it, on what morning, and what they look at. Understandable is not the same as wanted. |
| Shippable honestly | 10 | The demo needs a fake chain, an unlabeled seed, or a permission Walrus does not have. |
| Claims survive | 5 | A number in the pitch is not from a cited source, or a paper's number is presented as our result. |

Below 75, kill it and search again. Above 75, still kill it if you cannot name a person and a morning.

## Evidence bar

- Every pain needs a primary source: a paper, a vendor's own docs, or a dated public test. Quote the claim, the date, and the URL.
- Do not invent demand. "Users want this" requires a source that says users want this. A paper about model failure is a model failure. It is not a market.
- Do not claim the paper's accuracy, dollar figures, or percentages as this product's results.
- Label any seeded history as seeded.
- arXiv:2610.07782 (6 Oct 2026): persistent memory often does not help the next unrelated question. The demo must be a repeated entity or an unresolved ledger.
- Leave these out of the pitch: collaboration-tax (arXiv:2608.22152), zero-cost cooperation (arXiv:2604.07821).
- Papers already used, so a new idea must not pretend they are fresh discoveries: AgentMemGate arXiv:2610.07707; Who May Release an Agent's Promise? arXiv:2610.21203; Why Do Agent Teams Fail Across Boundaries? arXiv:2610.19342; Receiver Decides arXiv:2610.18424; SocialMemBench arXiv:2605.17789; GroupMemBench arXiv:2605.14498; Memory Echo arXiv:2610.17763; Goals Leak arXiv:2610.17365; Audience-Bound arXiv:2609.36373.
- Spend-split sources already on file, if you touch agent payments: Quinn, DEV, 13 Oct 2026, https://dev.to/quinn_854b15f517d8632ed4f/we-asked-claude-and-gemini-to-get-around-our-ai-agents-spending-rules-heres-what-happened-in-80-1iib ; Stablecoin Insider, 15 Oct 2026; GOAT Network, 14 Oct 2026.

## Search

Look for a job that is bigger than a weekend collection and smaller than a platform. Search papers from September and October 2026, the Walrus docs, Tatum's own apps, and products that already sell the obvious version of the job.

Prefer a loop a judge can see: the same input, a different decision, the old memory still on screen, then a blank agent that restores the account and agrees.

Reject anything whose demo is a chat transcript, a settings form, a leaderboard of people, or a dashboard of one cap.

## What you return

One idea. Plain language. No architecture diagram. Use this shape and no other.

1. **Who, what morning.** One person. What they open. What changed since last week.
2. **The screen.** What the status says, in one sentence. What the model is forbidden to set.
3. **The Walrus moment.** The restore, or the key removal, and what the screen does after it. If you cannot write this paragraph, write "withdrawn" and stop.
4. **The Tatum moment.** The exact read, and the on-screen fact it decides. Coin type if money moves.
5. **Week one and week four.** Same input. Different decision. Name the memories that caused it. At least ten, on Mainnet, and say which are seeded.
6. **Score.** The seven-row rubric, with one sentence of evidence per row.
7. **Collisions.** Name the closest shipped product and the one fact that makes this a different demo.
8. **What we must not claim.** Demand we did not find. Permissions Walrus does not give. Numbers that belong to a paper.
9. **Track.** One track, and why the other two would be a worse fit.

If nothing survives, say so in one paragraph and name the closest miss and the test it failed. Do not offer three runners-up.

Do not write code. Do not sketch a UI. Do not open a prototype. The user has not asked for a build.
