# Lapse — citations that shape the product

Collected 18 Oct 2026. Each source maps to one product rule. Numbers are from the abstracts, not from a reimplementation.

## The rule the papers agree on

An agent may save a sentence. That sentence does not become something the agent may act on until a person, or a recorded decision, says it holds. The rejected sentence stays readable. Asking the model to forget does not work.

## Sources

### 1. A "maybe" becomes a fact if you only store the sentence

Hongyu Gu and Xinchang Li, "Whose Memory Is It? Scope-Aware Commit Rules for Long-Term LLM Memory," arXiv:2610.09008, submitted 6 Oct 2026. NeurIPS 2026 Workshop LP4FM poster.
https://arxiv.org/abs/2610.09008
https://openreview.net/forum?id=jXE0A1Pv0T

An agent considers a plan, reports someone else's belief, or rejects its own idea. If memory keeps only the sentence, that line later comes back as a fact. They call the missing label discourse ownership: which world, branch, or speaker was allowed to say it. Their commit rule, CASK, lets shared-world facts into durable memory and keeps provisional lines inside their original scope. On the 3B model they report 83.33% as the strongest attachment method they tested.

Shapes Lapse: the ticket line is stored as Sam-might-have-been-offered, speaker = agent, status = provisional. It cannot be read as "you agreed" until you keep it.

### 2. Do not auto-promote. The third button is review

Yijiashun Qi, Xiang Xu, and Yuxuan Li, "When Not to Write Memory: Governing False Promotion from Correlated Agent Traces," arXiv:2607.02579, submitted 30 Jun 2026. Accepted at MLISE 2026.
https://arxiv.org/abs/2607.02579

Repeated lines are not independent evidence. The same claim can be copied, prompted, stale, or true only in a narrow scope. GovMem outputs one of three decisions: promote, reject, or needs-review. In their default synthetic test, false promotion falls from 0.597 to 0.040, with recall 0.960, at a high review burden. On 120 human-labeled real traces, false promotion falls from 0.371 to 0.032, but held-out false promotion is still 0.111, review burden is 0.692, and direct recall is 0.448. Of 133 high-impact external coding-agent candidates, none were safe to promote automatically.

Shapes Lapse: the screen is the review. Keep and cut are promote and reject. The agent does not promote its own notes. The authors say GovMem is a diagnostic design, not a proven automatic writer. Lapse should not claim it solved false promotion. It should show the review.

### 3. At reuse time, ask the user instead of trusting the note

Baichuan Li, Junyi Yao, and Zihao Zheng, "Remember, Verify, or Ask? Evaluating Memory Decisions at Reuse Time," arXiv:2608.19564, revised 12 Oct 2026.
https://arxiv.org/abs/2608.19564

A stored candidate meets a later situation. The agent should choose one of four actions: persist, use it only for this turn, verify it against a source, or clarify it with the user. An incorrect durable update distorts later behavior. They have not tested how those states change retrieval.

Shapes Lapse: Wednesday's question is reuse time. A kept memory may be used. A cut memory may be shown and must not be used. An unresolved card is the "ask" action, still open.

### 4. History stays. Authority is separate

Yufeng Li, Sheng Yao, Peng Zeng, Dezhang Kong, Shi Lin, Changting Lin, Xun Wang, and Meng Han, "Memory Echo in Single-Agent Long-Term Memory: Lifecycle Evaluation and Provenance-Guided Mitigation," arXiv:2610.17763, submitted 13 Oct 2026.
https://arxiv.org/abs/2610.17763
Code: https://github.com/OrcasSam/memory-echo-benchmark

Saving the same claim again makes one source look like many. Their Family–Provenance–Authority rule keeps one representative per source, makes an old record ineligible after a verified correction, and still keeps the history. On 190 questions, accuracy goes from 0.825 to 0.920 with DeepSeek V4 Flash and from 0.782 to 0.916 with Kimi K2.6. Decision contamination falls from 0.106 to 0.030 and from 0.109 to 0.038. Their sentence: agent memory can preserve traceable history without allowing repeated historical information to govern current decisions.

Shapes Lapse: five City quotes are one voice. The cut ticket card stays on the timeline and loses its vote.

### 5. Do not delete the old value

Bowen Qin and Yao Lu, "Memory of Memory," arXiv:2609.25054, submitted 7 Sep 2026.
https://arxiv.org/html/2609.25054v1

Overwrite makes a wrong update unrecoverable. Their Provenant Memory keeps a current value and retains what it displaced. Typed operations include support, supersede, contest, reject, revoke, and resolve.

Shapes Lapse: cut writes a new memory that points at the old blob and marks it ineligible. The old blob is not destroyed.

### 6. Asking the agent to forget fails

Bofan Xie, Chaokun Wang, Guanchen Ge, Songyao Wang, Fang Niu, Hang Zhang, and Wei Wang, "Can Agents Forget When Asked? A Benchmark for Memory Unlearning in LLM Agents," arXiv:2610.18052, submitted 13 Oct 2026.
https://arxiv.org/abs/2610.18052
Code: https://github.com/Nboxff/bemula-benchmark

Bemula has 50 dialogues, 135 forget requests, and 1,742 questions. Across six memory systems and three backbones, no system passes more than 1.5% of forget requests end to end. Most pass none. They either leave the fact extractable or delete too much.

Shapes Lapse: cut is not a prompt that says "forget the ticket." Cut is a record our code checks before the answer. The card remains, so we are not in the benchmark's delete-and-hope failure.

### 7. A relevant memory can still be the wrong one to use

Zi Wang, Xingqiao Wang, Emmanuel Addai, Devika Ambekar, and Xiaowei Xu, "The Right Memory in the Wrong Context: Verifying Retrieval Admissibility in Long-Term Agent Memory," arXiv:2610.07309, submitted 5 Oct 2026. NeurIPS 2026 Workshop "Who Verifies the Agents?"
https://arxiv.org/abs/2610.07309

A retrieved memory can be relevant and still inadmissible, because it belongs to someone else, breaks a policy, or is in the wrong lifecycle state. A correct-looking answer can follow a memory that should not have been in the prompt. Text-only checks missed violations that metadata caught.

Shapes Lapse: each card carries status, speaker, and blob id. The answer step reads that metadata. Semantic similarity alone is not allowed to pull a cut card into the decision.

### 8. Admission matters more than wording

Chang Liu and Deliang Ding, "What to Admit and How to Present: Governing Persistent Memory in LLM Agents," arXiv:2610.11188, submitted 8 Oct 2026.
https://arxiv.org/abs/2610.11188

Two decisions: what memory enters the working context, and how it is phrased. Tightening admission cut cross-domain failure by a further 17.5 percentage points. Rewording the same admitted memories did not produce a difference that survived their correction. Both of their admission designs also increased personalization failures.

Shapes Lapse: the demo shows a card leaving the answer, not a nicer sentence about the same card. Expect a cost: a cut memory is a fact the agent will miss on purpose.

### 9. The person should hold the memory, and provenance is not the same as permission

Jianan Chen, Yufei Qin, and Yaosen Lin, "Beyond Provenance: The Economics and Governance of Personalized AI Memory," arXiv:2609.25521, submitted 22 Sep 2026.
https://arxiv.org/abs/2609.25521

Provenance says where a memory came from. It does not say who may use it. They compare subject-held ownership with platform-held ownership.

Ming Wu and Pengyuan Zhu, "Agent Zero Memory," arXiv:2608.29606, submitted 30 Aug 2026.
https://arxiv.org/abs/2608.29606

Every learned item carries origin, time, and an evidence pointer. An answer may cite only evidence the reader opened. If it cannot, it abstains. They report 95.60% on LongMemEval and 93.60% on LoCoMo.

Shapes Lapse: the Walrus account is the subject's. Each answer cites the blob ids it opened and the blob ids it was blocked from using.

### 10. What Walrus actually enforces

Ownership and permissions, Walrus Docs, updated 16 Oct 2026.
https://docs.wal.app/walrus-memory/contract/ownership-and-permissions

Delegate key management.
https://docs.wal.app/walrus-memory/contract/delegate-key-management

Multi-tenant cookbook, 12 Oct 2026.
https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant

The owner adds and removes delegate keys. A delegate can remember, recall, analyze, and restore. A namespace separates recall. It does not stop another delegate on the same account from requesting that namespace. Content is Seal-encrypted. Namespace names are public.

Shapes Lapse: keep and cut are memories our app enforces. They are not a Walrus permission. The Walrus-backed claim is narrower and still strong: the cards are encrypted blobs the user owns, a new delegate can restore them, and removing a delegate key makes that agent unable to read the account. Do not say a cut is an on-chain ban against every future delegate.

## What the demo is allowed to say

1. The agent saved a provisional belief and a repeated quote.
2. You kept one and cut one. Both blobs remain.
3. The next answer cites the kept blob and refuses the cut blob.
4. A second agent restores the same account and follows the same cards.
5. Tatum's Sui read shows the account those blobs belong to.

## What the demo must not say

- That the model forgot the cut memory. Bemula says that fails.
- That a namespace hides the cut card from every delegate. The Walrus docs say it does not.
- That GovMem's false-promotion numbers are our numbers. They are the reason the review exists.
