# Total Recall — research brief

Window: 18 Sep 2026 to 18 Oct 2026 for community/GitHub signals. Hackathon facts are from the live page and Event Rules dialog on 18 Oct 2026.

Primary page: https://tatum.io/hackathon/total-recall
Rules dialog on that page. Submission form: https://recall-tatum-walrus.vercel.app
Walrus Memory docs: https://docs.wal.app/walrus-memory

## What it is

Tatum x Walrus Foundation online hackathon. Tagline: "Get your memory back." Apps that store scores, preferences, and reasoning in Walrus Memory so the product gets sharper across sessions.

- Build window: 20 Oct 2026 to 10 Nov 2026, 17:00 UTC
- Judging: 11–16 Nov 2026
- Winners: 17 Nov 2026
- Prize pool: $4,500, paid in a stablecoin the sponsors choose (rules say USDC). Winner confirms by email and sends a USDC-capable wallet within 14 days, plus a tiny test transfer.
- One submission per person. 18+ and not a resident of a sanctioned jurisdiction. Sponsor staff who run the event may be ineligible.
- You keep the IP. Sponsors get a royalty-free license to review and showcase the submission.
- Existing projects are allowed if the submitted work is new during the window.
- Solo or team. Web2 builders are explicitly welcome. AI Builder is optional.
- The rules preamble still describes a "feedback and form platform." That sentence does not match the tracks. The operative requirements are the checklist and the three tracks below.

## Money

| Award | Amount | Who decides |
| --- | --- | --- |
| Each track, 1st / 2nd / 3rd | $500 / $300 / $200 | Panel, same rubric for AI Builder and indie builds |
| Best Walrus Memory | $500 | Walrus team. Deepest learning loop. Memories that visibly change the product. |
| Best Tatum AI Builder app | $500 | Best shippable product built primarily on https://ai.tatum.io |
| Mystery bounty | $500 | Brief drops on Discord closer to the event |

Track prizes are $1,000 x 3 = $3,000. Bonuses are $1,500. A project can stack a track place and a bonus.

## Judging

- 30% Walrus and Tatum integration. Meaningful use of Walrus Memory, plus Tatum RPCs or Data APIs.
- 30% Technical quality. Clean code and a working Tatum Sui RPC integration.
- 20% Creativity. Do not copy the brief verbatim. The FAQ says execution beats novelty, and tracks are directional.
- 20% Presentation. Docs plus a working demo.
- Optional social post on X or LinkedIn. Tagging @Tatum_io and @WalrusFoundation may add points.

60% of the score is "did memory and Tatum actually do work."

## Must ship

1. Walrus Memory writing on Mainnet.
2. Tatum RPC for onchain data where the product needs it.
3. At least 10 memories stored on Mainnet.
4. A published blog post: what it does, how it uses Tatum and Walrus, how it learned over time.
5. Working demo, public repo, and a 2–3 minute video.
6. AI Builder only if you want that $500.

Submission form fields: email, Discord, LinkedIn, how you heard about it, first Web3 project or not, Tatum ID, Sui address, Sui account ID, `MEMWAL_AGENT_ID`, project description, demo video, GitHub repo, Walrus experience, AI Builder experience.

`MEMWAL_AGENT_ID` is the delegate public key under Delegate keys in https://memory.walrus.xyz/dashboard. Tatum ID comes from https://dashboard.tatum.io/.

## Stack

Walrus Memory (docs refreshed 14–17 Oct 2026):

- TypeScript: `@mysten-incubation/memwal`. Python: `pip install memwal`.
- Mainnet relayer: `https://relayer.memory.walrus.xyz`. Testnet: `https://relayer-staging.memory.walrus.xyz`.
- Auth: Ed25519 delegate key plus a `MemWalAccount` object id on Sui.
- Loop: `remember` / `rememberAndWait`, `recall`, `analyze` (split a long note into facts), `ask`, `listMemories`.
- `namespace` isolates leagues, users, groups, or repos.
- Writes are async: embed, Seal-encrypt, upload to Walrus, index. Recall is semantic, scoped to owner plus namespace.
- Ownership and delegates are enforced on Sui, which is the difference versus Mem0 or a private Postgres.

Tatum:

- Sui RPC and Data APIs: https://docs.tatum.io/docs/getting-started
- Optional first draft: https://ai.tatum.io
- Storage API (`POST /v4/data/storage/upload`) is blob storage. This hackathon scores Memory (remember/recall), not a one-off file upload.
- Example prompts already on the page: sports picks journal, expense watchdog agent, shared budget app.

Discords: Tatum https://discord.gg/hR6NG7sNXE, Walrus https://discord.gg/walrusprotocol.

## Tracks

### 01 Markets and Sports Prediction — $1,000

Prediction app for sports, elections, culture, or markets. Compare bookmaker odds with onchain sources. Users log picks before the event. Memory stores credibility so the app learns who to trust.

Examples they give: sports companion that learns your leagues and analysts, odds dashboards that flag disagreement, pick journals with post-game scorecards.

### 02 Smart Agents for Real Life — $1,000

Agents that watch inboxes, expenses, habits, or workflows and resume across tools. Examples: research agent with source trust scores, expense watchdog with long-term memory, workflow bot that learns escalation rules.

### 03 Consumer Finance Apps — $1,000

Everyday money products. Blockchain stays invisible. Memory holds balances, habits, and preferences. Examples: group spending that remembers who owes what, subscription managers with learned limits, savings goals that adapt to cash flow.

## Last 30 days — what is hot, mapped to the tracks

GitHub search plus Hacker News, 18 Sep–18 Oct 2026. A combined last30days engine pass on "AI agents with persistent memory for prediction markets and personal finance" returned 6 GitHub items and 6 HN stories, and 0 Reddit threads and 0 Polymarket markets. The useful signal is from targeted repo search and first-party docs, not that combined query.

### Memory itself is the crowded layer. The product loop is not.

Still the largest, and all pushed in the last two days:

- Mem0 `mem0ai/mem0` — about 67.4k stars, pushed 17 Oct. Fact extraction plus search.
- Hindsight `vectorize-io/hindsight` — about 50.9k stars. 1.0 and Memlake (object-storage engine, claimed <100ms p99) announced 13–15 Oct. Operations are retain, recall, reflect. https://hindsight.vectorize.io/blog/2026/10/13/memlake
- Graphiti `getzep/graphiti` — about 31.9k stars. Temporal knowledge graph. Facts have a time they were true.
- Cognee `topoteretes/cognee` — about 32.4k stars. Graph over documents.
- Supermemory `supermemoryai/supermemory` — about 31.3k stars, pushed 18 Oct.
- Letta Code `letta-ai/letta-code` — about 3.6k stars, fastest relative growth of the smaller runtimes (+275 stars / +8.2% in 30 days per OpenAlternative, 17 Oct). Memory is a git repo of markdown, edited by the agent.

New HN launches in the same window: MuscleMemory (procedural memory, 16 Oct, https://github.com/TheWariend/MuscleMemory), MemorySync (13 Oct), IHMT hierarchical tree (12 Oct, https://github.com/gonzaroman/IHMT-MEMORY), Past.dev (17 Oct). On 17 Oct HN also carried "Three LLM judges couldn't tell an AI agent's real memory from a counterfeit one" (https://kairos-experiment.com/checks.html).

What that means here: another "chatbot that remembers" is late. Walrus Session 8, Chatbots That Remember (18 Sep–9 Oct), is in judging, and GitHub is full of those entries (`marshaldotexe/RecallOs`, `nxrskyaa/eling`, `DrApkFile/SessionDesk`, `yukitran03/tact`, `bagstreet/vow`). Judges for this event want memories that change the next screen. Walrus can show a blob id and an onchain owner, which is a direct answer to the counterfeit-memory story.

Also new and relevant as patterns, not as dependencies: `AgentMemoryRepo/agentmemoryrepo` (~801 stars, a spec), `libingzheren/Jev-Mem` (~218), `mem0ai/dolphinbench` (~46), `Fengzdadi/memory-bench-registry` (~209). People are benchmarking memory, not just storing chat logs.

### Track 1 — prediction markets are a trading-bot pile. Credibility is the open product.

Active and starred, pushed this month:

- `alsk1992/CloddsBot` — about 3.0k stars. Autonomous trading across Polymarket, Kalshi, and other venues.
- `Polymarket/agents` — about 3.8k stars. Official framework. Older project, still the category anchor. Polymarket's live agent surface is now skills plus SDKs: `ts-sdk` updated 16 Oct, `py-sdk` 15 Oct. https://github.com/orgs/Polymarket/repositories
- `aarora4/Awesome-Prediction-Market-Tools` — about 777 stars.
- `YichengYang-Ethan/oracle3-prediction-market-agent` — about 468 stars, pushed 12 Oct. Cross-venue fee-adjusted arbitrage, Kalshi and Polymarket, MCP.
- `machina-sports/sports-skills` — about 250 stars, pushed 16 Oct. Live sports plus Kalshi/Polymarket skills.
- `bennyjo/phil` — about 228 stars, pushed 18 Oct. Self-rewriting trader. Strategy updates after every settled bet.
- `komako-workshop/digital-oracle` — about 898 stars. Macro questions answered from Polymarket, Kalshi, and other feeds.
- Polystrat (Pearl) claims 23,286 trades and 4,033 markets as of 18 Oct. https://pearl.you/polystrat

Fresh research, not a repo: Vultax, 9 Oct, matched NFL, college football, Premier League, midterms, and Fed contracts on Kalshi and Polymarket. Pre-game sports gaps almost never cleared both venues' fees. Midterm gaps did in about 10% of readings. https://vultax.com/research

Tiny new repos this month (`isrita/prediction-market-agent`, `arno23o/prediction-market-agent`, `jlarcara17/Lineshift`) are the same bet-the-market idea with no stars.

Idea that fits the rubric: a pick journal and voice scoreboard. People log picks before the event. After settlement, Walrus stores a credibility fact per voice. The feed reorders. A second pane flags Kalshi vs Polymarket (or book vs chain) disagreement, which is the brief's "sources disagree" example and matches the October research. Demo the reorder on camera. Skip live auto-trading. It is crowded, harder to judge in three minutes, and a worse fit for "consumer app first."

### Track 2 — agents that resume, but the next action changes

The GitHub issue that best states the problem is `ai-village-agents/ai-village-external-agents` #102 (13 Oct): a heartbeat agent whose only continuity is a handover note, and a bad inherited claim.

Pattern worth copying from the memory field, then putting on Walrus:

- `analyze` a session into discrete facts (Walrus already does this). Do not store one blob of transcript.
- Namespace per person, inbox, or workflow.
- A trust score on sources, same shape as Track 1 credibility.
- Show the fact that caused the new behavior, with a memory id, so it is not a hidden prompt.

Do not ship a Telegram bot that recalls last Tuesday. Session 8 already did that. A research agent that downgrades a source after the user marks it wrong, or a workflow bot whose escalation rule is a memory the user can see and edit, matches the brief and the "memories change the product" bonus.

### Track 3 — finance agents are deciding, not chatting

New and small, all created or pushed since 18 Sep:

- `aditya-c7/pfa-1` — 90-day balance forecast, then a deterministic call: pay in full, split, installment, or wait.
- `harsh0475/WealthWise` — tool loop, PII redaction, prompt-injection defense.
- `raulvazquez7/personal-finance-agent` — local-first imports, rules then model then human.
- `vaibhavkapur/Personal-Finance-Agents` — 12 specialist agents (tax, lending, freelancer cash, fraud).

Older write-up that still matches the architecture: Vorniq, multi-persona finance agents sharing one memory bank, keyword plus semantic retrieval because money amounts embed badly. https://dev.to/shivani_saraf_315/building-a-multi-persona-finance-agent-with-persistent-memory-inside-vorniq-2ppo

Idea: a shared-budget app whose split rules are memories ("Alex covers the tip", "rent is 60/40"), one namespace per group. Balances can be read with Tatum Sui RPC or Data APIs so the chain stays in the background. The demo is a new expense that follows a rule the app learned last week, and a screen that shows that memory. Subscription limits that tighten after repeated overages are the same loop with a harsher before/after.

## What to avoid

- A chatbot whose only Walrus call is `remember(user message)`.
- An auto-trader. The starred work this month is already there, and the brief asks for a consumer credibility app.
- Decorative RPC. Technical quality is 30% and names Tatum Sui RPC specifically.
- Copying the three example bullets as the product. The FAQ says not to.
- Fewer than 10 real Mainnet memories. That is a hard checklist item, not a nice-to-have.

## Recommended idea: Fold

Track: Markets and Sports Prediction. One product. The learning loop is the screen.

Fold is a pick board for a league, a culture question, or a market. People and outlets log a probability before the event. After it settles, the board reranks who is worth hearing. The twist, and the reason it is not the brief's "credibility score" example, is that **repetition is not evidence**.

Five posts that quote the same analyst are one voice. A corrected pick stays in history and loses its vote. The old line cannot outvote the correction just because it was stored more often.

### Why this is the hot gap

GitHub's hot agent repos this month are the wrong product:

- Coding memory is won. `thedotmack/claude-mem` is around 100k stars. Hindsight, Mem0, Graphiti, Cognee, and Supermemory are the memory engines.
- Trading bots are won. CloddsBot, Oracle3, `bennyjo/phil`, Polystrat.
- On-chain forecaster contests exist and are not us. [Foresight Arena](https://arxiv.org/abs/2605.00420) (May 2026, live at foresightarena.xyz) scores **agents** with Brier and Alpha on Polymarket, commit-reveal, Polygon, ERC-8004. Their live eval was still pending in the paper. We do not clone a Polygon agent contest.

The papers from 5–14 Oct 2026 all describe a failure no consumer app is shipping:

| Paper | Date | What it shows | What Fold takes |
| --- | --- | --- | --- |
| [Memory Echo](https://arxiv.org/abs/2610.17763), Li, Yao, Zeng et al. | 13 Oct 2026 | Writing the same claim back makes one source look like many. Family–Provenance–Authority (FPA) lifts accuracy 0.825 to 0.920 (DeepSeek V4 Flash) and 0.782 to 0.916 (Kimi K2.6) on 190 questions. Decision contamination falls from about 0.11 to about 0.03. Code is a benchmark, [OrcasSam/memory-echo-benchmark](https://github.com/OrcasSam/memory-echo-benchmark), not a product. Echo survives a correction. | One vote per source family. A verified correction makes the old record ineligible. History stays. |
| [Whose Memory Is It?](https://arxiv.org/abs/2610.09008) | 6 Oct 2026 | A provisional sentence becomes a fact if memory drops who was allowed to say it. | Every pick stores speaker, scope, and status: active, superseded, or correction. |
| [The Right Memory in the Wrong Context](https://arxiv.org/abs/2610.07309) | 5 Oct 2026 | A relevant memory can be inadmissible because it belongs to someone else or to an old lifecycle state. | Namespace per league. A settled pick cannot vote on next week's game. |
| [Memory of Memory](https://arxiv.org/html/2609.25054v1) | 7 Sep 2026 | Overwrite deletes the prior value, so a bad update is unrecoverable (0% vs 100% when displaced values are kept). | Superseded picks remain visible and cannot vote. |
| [Beyond Retrieval](https://arxiv.org/abs/2610.19474) | 14 Oct 2026 | "How many times did X happen" fails if you only do vector search. A ledger plus deterministic count gained 13.8 points on their repo set. | The board counts families and Brier updates in code. Recall finds the rows. The model does not do the math. |
| [Portable Agent Memory](https://arxiv.org/html/2605.11032v1) | 10 May 2026 | A protocol for moving owned, provenance-checked memory between agents. The human owns it, not the model host. | Walrus already is that substrate: Sui owner, Seal, blob id, delegate key. The demo is opening the same account in a second blank agent. |

Sports is the right skin. Convex Lake, 30 Sep 2026, computed Polymarket Brier scores at five points in each market's life across 12 categories. Tech falls to 0.021 by the late checkpoint. Sports stays around 0.156 to 0.184 and barely improves. A market price is a weak prior exactly where this hackathon points. [Overround](https://www.overround.pro/leaderboard) (17 Oct 2026) already ranks wallets and refuses to let one correlated position count as a track record. That is the family idea applied to trader PnL. Fold is voices, corrections, and a record the user owns.

### The three-minute demo

1. Paste five posts that all quote one analyst. A naive memory list says the crowd agrees, five to zero. Fold shows one family, weight one.
2. The analyst changes the pick. The old line was stored more often, so a normal recall still surfaces it. That is the echo result. Fold marks it superseded. It stays on the timeline and drops out of the vote.
3. The event settles. A settlement memory writes a Brier update. The ranking on the home screen moves. Each row shows its Walrus blob id.
4. Tatum Sui RPC reads the MemWal account: owner and memory count. A second page, with only that account id, recalls the same ranking. Memory moved. The app did not.

### How it maps to the score

- Integration: the vote and the ranking are functions of memories. RPC is how you prove the account.
- Technical quality: Mainnet writes, a real Sui read, scoring in code.
- Creativity: FPA from a paper five days old, not the sample bullets.
- Best Walrus Memory: the product is the learning loop. Ten memories is easy. Each pick, correction, and settlement is one.

### Build shape

- One namespace per league or question set.
- `analyze` turns a pasted post into a fact: source family, claim, probability, event id.
- `remember` stores that fact plus status. Corrections store a new memory that points at the old one. Nothing is deleted.
- Ranking is computed from eligible memories only. Eligible means active, pre-settlement, and one row per family.
- Score is Brier against the outcome, and a simple edge versus the market price if we have one. Win rate hides a voice that says 90% on coin flips.
- Disagreement strip: book, Polymarket or Kalshi, and Fold's one-vote crowd. That is the brief's "sources disagree" line, done with the echo rule on top.

### What would make it ordinary

A win-rate leaderboard. A bot that bets. A chat panel that recalls last week's picks. Any of those is a crowded repo from this month. Fold's sentence is: the same claim, repeated, still counts once, and a correction sticks.
