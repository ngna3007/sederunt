# Scout

Proposal for Total Recall, the Tatum x Walrus Memory hackathon.
Track: Markets & Sports Prediction.
Written 18 Oct 2026. Replaces the hand-filled Fold board as the product. The folding rule stays inside the agent.

## One sentence

Scout is a forecasting agent. You ask it about a game. It locks a probability before kickoff, tells you why, and next week it answers differently because it remembers where it was wrong.

## Where the idea comes from

Two papers, one job each.

**The agent and the score.** Maksym Nechepurenko and Pavel Shuvalov, "Foresight Arena: An On-Chain Benchmark for Evaluating AI Forecasting Agents," arXiv:2605.00420, 23 Apr 2026, revised 4 May 2026.
https://arxiv.org/abs/2605.00420
Live contest and contracts: https://foresightarena.xyz/ and https://github.com/foresight-arena/contracts

What we take from it:

- The thing being tested is an **agent that states a probability**, not a person pasting posts, and not a bot that places bets.
- The agent **locks** that probability before the outcome exists. After the lock, it cannot edit the call.
- The score is the **Brier score** (how far the probability was from what happened) and the **Alpha score** (did the agent beat the market price). An agent that copies the market scores zero. Profit and loss is the wrong score, because a lucky bet can look smart.
- The track record has to stay visible. Their version writes it to Polygon. Ours writes it to Walrus, which is what this hackathon scores.

We do not rebuild their contest. They already run a multi-agent leaderboard on Polygon. Their paper's published numbers are a simulation study. The product gap is an agent whose **memory** changes the next forecast, on Sui.

**The memory rule.** Yufeng Li, Sheng Yao, Peng Zeng, and coauthors, "Memory Echo in Single-Agent Long-Term Memory," arXiv:2610.17763, 13 Oct 2026.
https://arxiv.org/abs/2610.17763
https://github.com/OrcasSam/memory-echo-benchmark

An agent that saves every post will treat five copies of one opinion as five opinions. They call that Memory Echo. A correction does not fix it, because the old copies are still retrieved. Their rule: one vote per source, keep the old line, and stop letting it vote after a real correction. On 190 questions that raised accuracy from 0.825 to 0.920.

Scout uses that rule while it is reading, so the forecast is not just a confident paraphrase of a repost.

Sports is the setting because market prices there are a weak guide. Convex Lake, 30 Sep 2026, found Polymarket tech markets end near a Brier score of 0.021, while sports stays around 0.16. https://convexlake.com/blog/brier-score-category-research

## What you see

A chat with one agent, plus a card for the game.

You type: "City this weekend?"

Scout recalls what it locked last week, which sources burned it, and its running Alpha against the market. It reads a short set of sources for this game. Copies of the same person count once. It then says something a person can check:

"I'm at 62% City. The market is at 71%. I'm under the market because last week I followed Sam, and four of the posts were just quotes of Sam. Sam then switched his call. I have that as a memory."

It locks 62% as a Walrus memory before kickoff. The card shows the number, the reason, the sources it counted, the sources it folded, and the blob id. The number on the card does not change after the game starts.

When the match ends, Scout writes a result memory: what happened, its Brier score, and its Alpha versus the market price at lock time. It also writes one lesson, in a sentence: "Reposts of Sam are one source."

Next session you ask about the next match. The answer cites that lesson. The ranking of sources on the card has moved. That movement is the product.

A second page, given only the Walrus account id, shows the same locked calls and the same lessons. Tatum's Sui RPC reads the account so the owner and the memory count are on screen.

## What each memory is

- A **lock**: event, probability, market price at lock time, sources counted, sources folded, blob id. Written before the event.
- A **result**: outcome, Brier, Alpha, written after.
- A **lesson**: one sentence the agent must be able to cite next time. For example, "Sam's quotes are one voice."

Nothing is deleted. A wrong lock stays on the timeline, which is the point of a track record you cannot quietly edit.

`recall` brings back locks and lessons. The Brier and Alpha arithmetic runs in our code. The model writes the reason and the lesson. One namespace for the league.

Ten mainnet memories is the hackathon minimum. Two games produce more than that: locks, results, and lessons.

## Demo, about three minutes

1. Ask Scout about a game. It cites a past lesson and folds five quotes of one person into one source. The card shows 62% against a market price of 71%.
2. The lock is written. Refresh the page. The number is the same, with a Walrus id.
3. Settle the game. The card gains a Brier score and an Alpha score. A new lesson appears in memory.
4. Ask about the next game in a new chat. Scout's probability moves, and it quotes the lesson from step 3. A blank page with only the account id shows the same history. Tatum's read of the account is on screen.

## What we ship in three weeks

In: one agent, one league, a few fixtures, locked forecasts, folded sources, Brier and Alpha against a public price, Walrus mainnet writes, a Tatum Sui RPC read, a second page that recalls the account.

Out: a betting bot, a multi-agent contest, scraping all of X, covering every sport, training a model.

## Hackathon fit

| Requirement | How Scout meets it |
| --- | --- |
| Track | Markets & Sports Prediction. The agent logs the pick before the event and learns who to trust. |
| Looks like an agent | The user talks to it. It reads, decides, locks, and comes back next session with a different answer. |
| Walrus on mainnet | Each lock, result, and lesson is a memory. |
| Tatum Sui RPC | Reads the memory account in the demo. |
| Learning loop | The next forecast cites a lesson that was written after the last result. |
| Best Walrus Memory | The card changes because of memories, and the old wrong call is still visible. |
