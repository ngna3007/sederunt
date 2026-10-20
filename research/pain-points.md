# Pain points for Pot

18 Oct 2026. What papers actually measure, and which of those pains Pot is allowed to claim.

## The pains that match the product

Three agent papers from the last two weeks describe the same break: a sentence is treated as money or as a finished plan, and nobody checks the outside record.

**A spoken plan becomes a fact.** Chirag Sharma, Benjamin Fowlersmith, and Karime Maamari, "AgentMemGate," arXiv:2610.07707, 6 Oct 2026. https://arxiv.org/abs/2610.07707

Memory systems write a user's message into a store and later treat it as the user's current life. "Might move to Seattle" comes back as "lives in Seattle." On 147 held-out conversations, Mem0 did this for 35.2% of pending plans and Graphiti for 27.3%. Their gate keeps speculation out until the plan is confirmed, abandoned, or still open. For Pot, "I'm in for $40" is still a yes. It is not a payment. The status stays short until a transfer exists.

**A team agent does not keep its own promise straight.** Lan Wei, Bingyu Shen, Jiaqi Tang, Qing Lu, Kuan Huang, Meng Xu, Miles Q. Li, Bin Hu, and Boyang Li, "Who May Release an Agent's Promise?," arXiv:2610.21203, 15 Oct 2026. https://arxiv.org/abs/2610.21203

An assistant promises Alice something. Later the wrong person cancels it, or the agent goes ahead after the promise was released. Across six models, larger ones drop the promise when a peer says so (Qwen3.8-27B 89%, gpt-6.1-sol 83%). Telling the model the rule does not stop it from acting. A ledger the agent keeps, recording whether the promise is still owed, stops that override in four of five models. With a short release policy, gpt-6-luna goes from 49% to 83% strict accuracy. Pot's status is that ledger. Covered is owed only when the yes and the transfer both exist. The model does not get to release it.

**No agent checks a peer's claim unless the system does.** "Why Do Agent Teams Fail Across Boundaries?," arXiv:2610.19342, 14 Oct 2026, revised 15 Oct 2026. https://arxiv.org/abs/2610.19342

More than 2,500 runs, 488 scenarios. One finding holds across every harness and model they tried: no agent verifies another agent's factual claim on its own. The system is only as reliable as the least reliable participant, unless a protocol does the check. "I paid" is that claim. Tatum reading the pot address is the check.

## A pain that is also a warning

**The agent that holds the money is the one that decides, and it can be talked out of it.** "Receiver Decides Agent-to-Agent Negotiations," arXiv:2610.18424, 13 Oct 2026. https://arxiv.org/abs/2610.18424

Fifteen agents, 1,049 negotiations. One side tries to raise money from a holder told to keep $100. Which agent holds the money explains 47% of how much moves. Which agent asks explains 2%. Fine-tuning a holder on a persuasion set with almost no refusals raised what it gave away from 12% to 84% of the endowment. Pot must not let the chatting agent mark the pot covered or send the money back because someone argued. The match is code over Tatum results.

## The human pain, and how far it reaches

People already lose track of shared costs. Saba Eskandarian, Mihai Christodorescu, and Payman Mohassel, "Privacy-Preserving Payment Splitting," arXiv:1911.09222, 20 Nov 2019. https://arxiv.org/abs/1911.09222

They describe the job Splitwise and its peers already do: meals, roommates, and travelers keeping a book of who paid for whom. Their own result is about privacy. Those apps send group names, amounts, comments, and receipts to the company. That supports "a group needs a book." It does not support "the book should live on Sui," and it does not measure people who say yes and never transfer.

Equal splitting has a measured cost, and it is a different cost. Uri Gneezy, Ernan Haruvy, and Hadas Yafe, "The Inefficiency of Splitting the Bill," The Economic Journal 114, 2004. Groups of six diners order more when the bill is split than when each pays their own. Asked beforehand, 80% preferred to pay individually. That is over-ordering, not a missing transfer. Pot should not claim it fixes the restaurant-check problem. Splitwise's Itemize launch on 14 Oct 2026 is aimed at that check. https://www.splitwise.com/press/splitwise-launches-new-feature-that-takes-the-awkwardness-out-of-splitting-the-check

## What is not in the papers

No paper in this pass measures how often a friend confirms a group expense and then does not pay. No paper measures demand for a Sui pot. The sentence "Sam said yes and the chain is empty" is a demo of pains A, B, and C. It is not a surveyed user complaint.

Papers about agents failing to share information, such as the collaboration tax (arXiv:2608.22152) and zero-cost cooperation (arXiv:2604.07821), are real coordination failures. They are not about a collection. Leave them out of the pitch.

## What Pot may say

The pain is an agent that will call a collection done because someone said so. The papers show that failure in promises, in memory, and in unchecked claims. The human bookkeeping pain is already served by Splitwise. Pot's difference is the second list: the transfer Tatum reads, which the model is not allowed to invent.
