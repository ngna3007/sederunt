# Said

A group-chat agent that cannot turn a maybe into a plan. 18 Oct 2026.

## The use case

A friend group is planning Saturday in one chat. Somebody says "maybe Lisbon." Somebody else quotes them. The agent tells the group the trip is on and starts naming flats. The person who was quoted never agreed.

Said shows one card: who was quoted, who repeated it, and the Walrus id. The plan stays a rumor until the quoted person confirms it from their own account. If they reject it, the card stays visible and the agent has to tell the group it is not a plan.

Private feelings stay on that person's own account. The group agent only receives what someone chose to publish onto the group account. A new agent can restore the group account and still cannot read the private one, because it was never given a key there.

## Why this is the Walrus-shaped version

Namespaces on one account do not hide memories from other delegates. Separate accounts do. Publishing is a write onto the group account. That is the ownership model in the Walrus docs, not a filter inside one app.

https://docs.wal.app/walrus-memory/contract/ownership-and-permissions
https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant

## Citations

Chirag Sharma, Benjamin Fowlersmith, and Karime Maamari, "AgentMemGate: Addressing Speculation Contamination in Conversational Assistant Memory," arXiv:2610.07707, 6 Oct 2026.
https://arxiv.org/abs/2610.07707
A plan can enter memory as a fact. "Might move to Seattle" becomes "lives in Seattle." On 147 held-out conversations, Mem0 and Graphiti state unresolved plans as current reality for 35.2% and 27.3% of pending plans. Gating that write drops contamination from 87.5% to zero on the core style they measured, and task accuracy goes from 65% to 95%.

Olukunle Owolabi, "SocialMemBench: Are AI Memory Systems Ready for Social Group Settings?," arXiv:2605.17789, 18 May 2026.
https://arxiv.org/abs/2605.17789
Mem0, LangMem, Graphiti, and Cognee score about 0.12 to 0.18 on friend, family, and group questions. A full transcript scores about 0.37. The failures are the product: shared history versus one person's exception, and who said what after someone leaves.

Jinming Hu and coauthors, "Learning from Others, Acting for You: Cross-User Memory Sharing for LLM Agents," arXiv:2609.32511, 26 Sep 2026.
https://arxiv.org/abs/2609.32511
Sharing a memory helps, and it also copies preferences the receiver does not hold. ShareMem keeps the reusable experience and fills it with the receiver's own values.

Chenchen Lin and coauthors, "Beyond Memory Majority," arXiv:2608.19701, 20 Aug 2026.
https://arxiv.org/html/2608.19701
Several agents repeating one upstream source look like a majority. They call this memory correlation bias.

## Track

Smart Agents for Real Life. The trip, the split, or the game pick is the rumor. One product, one demo.
