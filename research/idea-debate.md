# Idea debate

18 Oct 2026. Pressure-test of Scout, and two alternatives, against what Walrus Memory is actually for and what is hot this month.

## The test

Walrus Memory is a good fit when all three are true:

1. The memory outlives the app. A second agent, with only the account id, can continue the job.
2. The user can see which memories were used, which were blocked, and that the blobs are theirs.
3. A later answer changes because of a memory, and the old memory is still on screen.

Walrus Memory is a costume when the app would work the same with a private database, and the blob id is a footnote.

Walrus's own line, 15 Oct 2026: portable, verifiable state so agents do not lose memory when they switch apps or runtimes. https://x.com/WalrusProtocol/status/2110545164251148360

A prior winner already took the receipt idea. Carry (Sui Overflow, written up 22 Sep 2026) puts a proof on every answer: which memories were read, which were blocked, whether the agent was allowed. https://walrus.xyz/blog/carry-verifiable-agent-answers-built-on-walrus-memory/

Session 8 (chatbots that remember) is in judging. Another chat log on Walrus will look late.

## What is hot, and what it implies

- The unsolved layer is memory portability. Tools have MCP. Agent-to-agent talk is closing. Memory still has many vendors and no shared way to move state. Forkast, 7 Oct 2026. https://tech.yahoo.com/ai/deals/articles/agent-state-management-layer-fracturing-162359665.html
- The Portable Agent Memory paper (May 2026) is the protocol version of Walrus's pitch: the human owns the memory and can rehydrate it in another model. Pilot transfer scores 0.83–0.92 versus 0.28–0.45 with no memory. https://arxiv.org/html/2605.11032v1
- Multi-agent shared memory is the live research fight. Governed shared memory names four failures: leakage, stale copies, contradictions that never die, and lost provenance. https://arxiv.org/abs/2606.24535
- "Whose Memory Is It?" (6 Oct 2026) says a discarded draft becomes a fact if you store the sentence and drop who was allowed to say it. https://arxiv.org/abs/2610.09008
- A warning against our own demo: "Persistent Memory in Multi-Agent LLM Inference" (6 Oct 2026, NeurIPS workshop) found a persistent memory tier added no detectable accuracy on single questions. Each question brought its own evidence, so recall had nothing useful to fetch. https://arxiv.org/abs/2610.07782
- Memory Echo (13 Oct 2026) is the case where memory does matter: repeated copies of one source steer the answer. https://arxiv.org/abs/2610.17763
- Foresight Arena (May 2026) is the agent-forecast shape: lock a probability, score it against the market, do not score bets. https://arxiv.org/abs/2605.00420

The hot product is an agent whose memory is governed and portable. The cold product is a chatbot that stores sentences, or a forecasting contest that already exists on Polygon.

## Option A — Scout, one agent, one chat

You ask about a game. The agent locks a probability, scores itself after the match, and cites a lesson next time.

Usable as a demo. Weak as a Walrus use.

- The lock is a sentence we promise not to edit. Foresight Arena's lock is a hash on a contract. A delegate key can write a new memory that says the call was different. Judges who know Walrus will see a diary.
- Brier and Alpha are arithmetic in our code. Walrus does not compute them.
- Folding five quotes into one voice is a filter we write. Recall would return all five.
- The 6 Oct null result applies. Next week's match does not need last week's memory unless the same voice shows up again. If the demo only works because we planted Sam twice, the learning loop is staged.
- Carry already shipped the "here is the blob I used" receipt.

Keep the costume: an agent, a locked number, a score against the market. Do not ship this option alone.

## Option B — Scout with a second agent and a blocked draft

Same forecast agent. The Walrus job is the handoff and the gate.

Two namespaces on one account the user owns:

- Scratch. The agent's drafts, rejected sources, and "maybe" lines. The forecast agent may not use these as votes.
- Record. Locked calls, settled scores, and lessons that survived. A second agent, a blank page with only the account id, can read Record and continue.

Each answer shows a receipt: memories used, memories blocked, blob ids. That is Carry's pattern, pointed at one job Carry does not do: a forecast that is only allowed to move when the memory is in Record.

This passes the test.

- Second agent is the portability Walrus advertises. A database inside the first app cannot do this page.
- Blocked drafts are "Whose Memory Is It?" made visible. A maybe-sentence does not become a fact.
- The lesson matters only when the same source returns. The demo should use one repeated voice on purpose, and say so. That matches Memory Echo, and it dodges the null result, which was about unrelated questions.
- The lock is still not a hash commitment. The honest claim is: the old blob stays, the second agent sees it, and a new story cannot erase it. Do not claim Foresight Arena's guarantee.

Risk: it can look like two chats and a filter. The receipt has to be the screen, not a tooltip.

## Option C — A small desk of agents sharing one memory

A reader agent saves sources. A forecast agent may only read sources the reader has marked as counted. A checker agent writes the score after the event and is the only writer of results. Each has its own delegate key on the same Walrus account.

This is the hottest shape in the papers (fleet memory, handoffs, provenance). It is also the easiest to overbuild in three weeks, and the easiest to demo as a diagram instead of a product.

Usable only if the desk is three roles and one game, and the screen is still the forecast card plus the receipt. Four agents is a slide.

## Verdict

Option A is a good story and a poor Walrus use. The memory could be Postgres.

Option B is the one to build. It looks like an agent, it uses the Foresight Arena score, and Walrus is the reason a second agent and a blocked draft exist. The sentence for the judges: the forecast can only move from memories the user owns, and a different agent can pick up the same record.

Option C is the right research neighborhood and the wrong scope unless B is already working.

## Demo that would convince a skeptic

1. The forecast agent reads five quotes of Sam and a draft that says "ignore the market." The card shows one counted source and one blocked draft, with blob ids.
2. It locks 62% against a market price of 71%.
3. A second page, different session, only the account id, recalls the lock and cannot see the blocked draft.
4. After the result, a lesson is written into Record. The next forecast cites it. The blocked draft still cannot vote.
5. Tatum Sui RPC shows the account owner on that second page.
