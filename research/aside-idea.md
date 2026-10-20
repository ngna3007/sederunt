# Aside

An agent that keeps each relationship in its own memory. 18 Oct 2026.

## The use case

You and your partner share an agent for the flat. You also talk to an agent about a job. Same kind of assistant. Two different lives.

Tuesday you tell the job agent: "If I get the offer, I'm gone in June." You also tell it the salary, the company, and that you have not told your partner.

Wednesday you ask the flat agent: "Should we renew the lease?"

A normal memory product answers from everything it has ever heard. It says no, because you are leaving, and it can drag the salary into a conversation your partner can see.

Aside answers from the flat. Rent, the broken heater, who pays the internet. It has never been given the job. The lease answer stays a flat answer.

Then you pick one sentence and carry it across yourself: "I might move in June." The flat agent is asked again, and the answer changes. The salary, the company, and the doubt stay on the job account.

Your partner's agent can restore the flat account and read that one sentence. A new agent with no key on the job account cannot restore the rest. If your partner moves out, you remove their key. The flat memories stay. Their agent goes blind. The job account was never theirs.

## Why this is interesting

People are starting to put one assistant in the group chat and another in a private chat, or the same assistant in both. The bad moment is the assistant gossiping across those relationships. The product is the wall, and the one sentence you carry on purpose. You see the lease answer change only after that carry.

## Why Walrus, not a folder

Walrus gives each Sui address one MemWal account. A namespace on that account does not hide memories from the account's other delegates. Any registered delegate can request any namespace. Real separation is a second account, which means a second address.

The job is one account, and only your job agent holds a key. The flat is another account. You and your partner hold keys there. Carrying a sentence is a new `remember` on the flat account. Removing a person is `removeDelegateKey`. A replacement agent calls `restore` on the account it was given.

https://docs.wal.app/walrus-memory/contract/ownership-and-permissions
https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant

Walrus's own examples are a chatbot, a notes app, a research assistant, and codebase memory. Another bot that remembers a transcript repeats those.

## What the demo has to show

One loop, on camera.

1. The job agent recalls June, the company, and the salary from the job account.
2. The flat agent is asked about the lease and answers from flat memories only.
3. You carry the June sentence. The same question gets a different answer. The salary line is still absent.
4. A new agent restores the flat account and can say the sentence. It has no key for the job account.

Ten or more Mainnet memories fall out of a normal session: flat facts, job facts, the carried sentence. Tatum Sui RPC reads both accounts and their delegate lists. The claim is that the other account's blobs were never in the prompt. The claim is not that the model was asked to forget.

## Citations

Saloni Gupta, Sébastien Krier, and Glenn Matlin, "When Goals Leak Across Relationships: How Cached Goal Representations Shape Cross-Client Decisions," arXiv:2610.17365, 12 Oct 2026.
https://arxiv.org/abs/2610.17365
An agent with shared conversational memory serves two clients with opposing goals. On OLMo-3-7B-Instruct, across 20 market scenarios, it deviates from the current client's objective in 22% of eligible decisions. Probes find the other client's goal still represented in the cache, and ablating those locations moves the decision back. This is a workshop paper on one model. Aside does not ablate caches. It keeps the other relationship's memories out of the prompt by putting them on an account this agent cannot open.

Sibo Liu, "Audience-Bound Persistent Memory: Authorization Across the Memory Lifecycle," arXiv:2609.36373, 28 Sep 2026.
https://arxiv.org/abs/2609.36373
A personal agent learns a fact with one audience and later places it in context for another. Their rule: an audience widens only by an explicit grant of that specific item, and an item enters the model only when every current viewer is allowed to see it. On 10,000 multi-party histories, unscoped retrieval exposed forbidden items in 82% of contexts. Their scoped stores let none in. Walrus cannot enforce audience tags inside one account, because delegates are account-wide. The grant in Aside is a copy onto the other account.

## Track

Smart Agents for Real Life. The lease is the stake inside one agent product. One submission, one demo.
