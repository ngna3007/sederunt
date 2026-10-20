# Fold

Proposal for Total Recall, the Tatum x Walrus Memory hackathon.
Track: Markets & Sports Prediction.
Written 18 Oct 2026.

## One sentence

Fold is a sports pick board that remembers who gave good advice, counts a repeated quote as one voice, and moves the ranking after the game.

## Core reference

The rule at the center of Fold comes from this paper:

Yufeng Li, Sheng Yao, Peng Zeng, Dezhang Kong, Shi Lin, Changting Lin, Xun Wang, and Meng Han. "Memory Echo in Single-Agent Long-Term Memory: Lifecycle Evaluation and Provenance-Guided Mitigation." arXiv:2610.17763, submitted 13 Oct 2026.
https://arxiv.org/abs/2610.17763
Code, a benchmark rather than a product: https://github.com/OrcasSam/memory-echo-benchmark

Their finding: if an app saves the same claim again and again, memory starts treating one source as many sources. They call that Memory Echo. A correction does not fix it by itself, because the old copies are still in memory and still get retrieved.

Their fix is Family–Provenance–Authority:

- Family. One representative per source. Quotes of the same person count once.
- Provenance. After a verified correction, the old record stays in the history and loses the right to answer.
- Authority. The current answer has to follow the record that is still allowed to speak.

On 190 fixed questions, that rule raised accuracy from 0.825 to 0.920 with DeepSeek V4 Flash, and from 0.782 to 0.916 with Kimi K2.6.

Fold takes that rule out of a benchmark and puts it on a sports board. The hackathon brief supplies the setting: users log picks before an event, and memory stores who was worth trusting. The paper supplies the part the brief does not: repetition is not a bigger crowd, and a correction has to stick.

Supporting references, in the order they matter:

- Convex Lake, "Prediction Market Calibration by Category," 30 Sep 2026. https://convexlake.com/blog/brier-score-category-research
  On Polymarket, tech markets get sharp by the end of their life (Brier about 0.021). Sports stays around 0.16 and barely improves. A sports board has a real job, because the market price is a weak guide.
- "Whose Memory Is It? Scope-Aware Commit Rules for Long-Term LLM Memory," arXiv:2610.09008, 6 Oct 2026. https://arxiv.org/abs/2610.09008
  A "maybe" becomes a fact if the app forgets who was allowed to say it. Fold stores the speaker and the status on every pick.
- "Memory of Memory," arXiv:2609.25054, 7 Sep 2026. https://arxiv.org/html/2609.25054v1
  Deleting the old value makes a bad update unrecoverable. Fold keeps the superseded pick visible.
- "Portable Agent Memory," arXiv:2605.11032, 10 May 2026. https://arxiv.org/html/2605.11032v1
  The person should own the record and carry it to another app. Walrus Memory is how Fold does that.

## The problem

People pick up a game-day opinion from a pile of posts. Most of the pile is the same sentence copied around. An app that "remembers everything" saves each copy and then sounds sure, because it has five memories of one opinion.

When the analyst changes their mind, the old copies are still in memory. Next week the app can still quote the first pick, because it shows up more often.

After the match, nothing in that pile tells you whether to listen to this person next time.

## What we build

A small web app for one league.

You add a voice: an analyst, a friend, a bookmaker, or a market price. Before the game, you save what they said, as a probability. Fold writes that pick to Walrus Memory on Sui mainnet.

The board has three views.

1. The crowd. For this game, how many real voices are on each side. Quotes of the same person are folded into one.
2. The timeline. Every pick and every correction, with the Walrus blob id. Old picks stay. They are marked superseded.
3. The ranking. After games settle, voices move up or down. The score is the Brier score: the squared gap between the probability they gave and what happened. A voice that says "90%" on a coin flip does not look skilled just because they win half the time.

Tatum's Sui RPC reads the memory account so the app can show the owner and confirm the writes are on mainnet. A second page, given only that account, recalls the same ranking. The record is not stuck inside Fold.

## Walk-through

Saturday, Manchester City.

Sam posts "City wins, I'm 80% sure." A fan account quotes him. A blog quotes him. A group chat pastes him. Sam posts it again. You save all five.

Fold stores five memories and shows one vote: Sam, City, 80%.

On Sunday morning Sam posts "I've changed this to a draw, 55%." Fold stores a sixth memory, links it to Sam's first pick, and marks the first one superseded. The timeline still shows "City, 80%." The board now shows one vote: Sam, draw, 55%.

City wins. Fold writes a settlement memory. Sam's draw call was wrong, so he drops on the ranking. Next Saturday, Sam is no longer at the top. That is the app learning.

You open a blank page and paste the Walrus account id. The same ranking comes back. The memory did not live in Fold's database.

## What Walrus Memory does

Every pick, correction, and settlement is a memory on mainnet. The text of the memory carries the fields the board needs:

- event id
- speaker
- source family (Sam, even when a fan quoted him)
- claim and probability
- status: active, or superseded
- pointer to the memory it corrects, when there is one
- after the game, the outcome and the score update

`analyze` can turn a pasted post into those fields. `remember` writes them. `recall` brings back the rows for a game or a voice. The vote count and the Brier score are computed in our code from the rows that are still allowed to vote. The model does not do the arithmetic.

One namespace per league, so a settled City game cannot vote on next week's match.

Ten mainnet memories is the hackathon minimum. A single Saturday produces more than that: five quotes, one correction, one settlement, plus the next game's picks.

## What Tatum does

- Sui RPC reads the MemWal account: owner, and proof the memories are on mainnet.
- The submission uses a real Tatum API key and the dashboard account id.
- If we show a market price next to the crowd, that read goes through Tatum where the source is onchain.

The chain stays in the background. The user sees a pick board.

## Demo, about three minutes

1. Paste the five Sam posts. Show the raw memory count, then the folded vote: one voice.
2. Add Sam's correction. Show the old line still on the timeline, and off the vote.
3. Settle the game. Show the ranking move, with blob ids on the rows.
4. Open the second page with only the account id. The ranking is there. Tatum's read of the account is on screen.

## Hackathon fit

| Requirement | How Fold meets it |
| --- | --- |
| Track | Markets & Sports Prediction. Picks logged before the event. The board learns who to trust. |
| Walrus on mainnet, 10+ memories | Each pick, correction, and settlement is a memory. |
| Tatum Sui RPC | Reads the memory account and shows it in the demo. |
| Learning loop | The ranking the user sees is produced from memories. A correction changes the vote. A result changes the order. |
| Blog post | This proposal is the spine: what it does, how Tatum and Walrus are used, how it learned. |
| Repo, demo, 2–3 min video | The four beats above. |

Judging weight sits on integration and technical quality, 30% each. Both are visible in the demo: the board is wrong if the memories are wrong, and the Sui read is on screen.

## Scope for the three weeks

In:

- One league, a handful of fixtures, entered by hand or pasted as text.
- Voices, families, corrections, settlement, Brier ranking.
- Walrus mainnet writes and a Tatum Sui RPC read.
- A second page that recalls the same account.

Out:

- Placing bets or moving money.
- Scraping all of X.
- Covering every sport.
- Training a model.

## Name

Fold, because the board folds copies of the same voice into one.
