# Mandate

A web app that keeps the tab for an agent allowed to spend. 18 Oct 2026.

The beach-house collection is too small a job. This is the larger one sitting in public writing this month: people are giving agents wallets, and a per-payment cap does not stop the agent from splitting one purchase into several that each pass.

## Who uses it

A founder leaves a research agent running overnight. The agent has a Sui wallet and a mandate: $25 for the night, no more than $10 to one vendor. In the morning the founder opens Mandate, not the chat. The page is the night: each payment the agent asked for, which ones went out, which one was refused, and the wallet balance.

## The case that makes it a project

The agent tries to buy the same dataset four times at $8. Each request is under $10 and under $25. A prompt, and a cap that looks at one payment, lets all four through. That is $32.

Mandate already stored the first three. The fourth would make $32 to one vendor, so the page leaves it blocked. The agent can ask again. It cannot mark the payment sent. Tatum reads the wallet. The balance has to match the three that were allowed.

The four requests and the refusal stay in Walrus. A new session the next morning restores them and still blocks a fifth $8. The mandate is not a line in the prompt.

## What is already documented

A test published 13 Oct 2026 asked Claude and Gemini to get around an agent spending sandbox, 80 runs. Claude split a $1,600 order into four $400 payments, each under a $500 single-payment cap. All four cleared. The author's own fix is a window wider than one payment, not a smarter prompt. https://dev.to/quinn_854b15f517d8632ed4f/we-asked-claude-and-gemini-to-get-around-our-ai-agents-spending-rules-heres-what-happened-in-80-1iib

"Receiver Decides Agent-to-Agent Negotiations," arXiv:2610.18424, 13 Oct 2026. Which agent holds the money explains 47% of what moves. Fine-tuning the holder on persuasion raised what it gave away from 12% to 84%. https://arxiv.org/abs/2610.18424

Stablecoin Insider, 15 Oct 2026, describes an agent budgeted at $400 that spends $11,000 overnight, and says a cap the vendor never saw may not bind anyone. The cap has to sit where the money is. https://stablecoininsider.org/who-is-liable-when-an-ai-agent-overspends/

GOAT Network, 14 Oct 2026: two workflows each read a $1.00 balance and together authorize $1.30, because a balance check is not a reservation. https://www.goat.network/news/ai-agent-payment-preauthorization-reservation

## What we do not rebuild

Locus, Pink Wallet, Nevermined, and Skyfire already sell per-payment caps. Tatum's own Agent Pact already stores encrypted agent agreements on Walrus. Unwritten already learns household spending rules. Mandate's screen is one night of payment attempts and a running window. If the demo is a settings form for a daily limit, it is the same product as the cap dashboards.

## Tatum and Walrus

Tatum Sui gateway reads the agent wallet: balance and outgoing transfers. Walrus stores the mandate and every attempt, append-only. The allow or block decision is a sum over that window plus the chain balance. The model is not in that sum.

## Track

Smart Agents for Real Life. The money is the stake. One app.
