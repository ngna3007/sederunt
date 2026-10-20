# R&D verdict

18 Oct 2026. Strict review of what this hackathon will actually pay for, what is already built, and which idea survives both.

## The assignment

"Best" here means the highest chance of placing, not the cleverest metaphor.

The page says the product gets sharper every week, not every login. Walrus Memory is where scores, preferences, and reasoning live across sessions. Best Walrus Memory is $500 for the deepest learning loop: memories that visibly change the product. Judging is 30% Walrus plus Tatum integration, 30% technical quality with a working Tatum Sui RPC, 20% creativity, 20% presentation. The FAQ says execution beats novelty, and the track examples are not a script to copy.

Source: https://tatum.io/hackathon/total-recall, read 18 Oct 2026. Local brief: research/total-recall.md.

A privacy wall, a key-admin screen, or a one-time approve button can be a good product. It is a bad answer to this assignment, because the product does not get sharper.

## What a hostile judge has already seen

Official Walrus examples are a chatbot, a notes app, a research assistant, and codebase memory. https://docs.wal.app/walrus-memory

Carry already shipped a receipt of which memories an answer used or blocked. https://walrus.xyz/blog/carry-verifiable-agent-answers-built-on-walrus-memory/

Session 8, Chatbots That Remember, is in judging. Another transcript bot is late.

One entrant is already public, and ahead of a cold start. On 15 Oct 2026 Ed (@EdCriptoFi), a two-time hackathon winner who also shipped WalCoach for Session 8, posted Unwritten for this contest: https://x.com/EdCriptoFi/status/2110682940132807117

Repo: https://github.com/EdCryptoFi/unwritten
App: https://unwritten-house.vercel.app

Unwritten is a household money product. It watches decisions and writes the rule the house actually follows, including a written rule the house stopped following. The learning path is seven pure functions, with no model in the loop, replayed week by week over a seeded Mainnet history. The seed is disclosed. A new version of a rule is appended and names the version it replaces. Tatum reads real transfers on a house wallet and matches them to decisions. Their proof page calls the relayer and Tatum from the browser.

They also wrote down the holes they did not ship. Revoking a delegate is a rehearsal. Members are a role switcher. The weekly writer is replayed, not run. They know a namespace is not a privacy boundary. The design they name and do not build is a second account that holds only an aggregate, so an observer cannot leak member-level facts. This build has one account.

Do not build a household rule engine. They have the Mainnet seed, the chain match, the proof page, and the essay. A thinner copy loses on execution, which is 60% of the score.

## A correction

Do not inherit their headline. "Walrus Memory has no delete" is not the current docs.

The manage-memory guide, updated 16 Oct 2026, documents permanent deletion from the dashboard and from the Security Delete API: https://docs.wal.app/walrus-memory/guides/manage-your-memory

`POST /api/forget` only drops index rows. The blobs remain, and `restore` can re-index them: https://docs.wal.app/walrus-memory/relayer/api-reference

The design that still holds is an application rule: we do not edit a record in place. A new memory names the one it replaces. That is our policy. It is not a protocol fact.

## Rubric

Scores are out of the weight. They are judgment, not a measurement.

| Idea | Sharper each week (25) | Walrus is necessary (20) | Tatum does work (10) | Not a collision (15) | A person gets it (15) | Shippable honestly (10) | Claims survive (5) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Keeps | 22 | 16 | 8 | 13 | 13 | 8 | 4 | 84 |
| Aside | 6 | 14 | 8 | 12 | 12 | 8 | 4 | 64 |
| Unwritten clone | 23 | 12 | 10 | 2 | 8 | 3 | 2 | 60 |
| Said | 10 | 12 | 7 | 11 | 9 | 7 | 4 | 60 |
| Staff | 5 | 18 | 9 | 10 | 4 | 8 | 5 | 59 |
| Scout | 14 | 8 | 6 | 6 | 5 | 7 | 3 | 49 |

## Killed

**Aside.** Two relationships, two accounts, one sentence carried by hand. The story is clear. The assignment is not. The lease answer changes once, because a human copied a sentence. The product does not get sharper next week. Two databases with two keys reproduce the scene. Restore and the on-chain key are a coda. Keep the separate-account fact. Do not lead with the wall.

**Said.** A maybe cannot become a plan until the quoted person confirms. That is a rule we typed. It does not learn. It also returns to the card the last idea already was.

**Staff.** The strongest pure use of `removeDelegateKey` and `restore`. It is an admin tool. This user has already rejected that shape, and a key ceremony is not a learning loop.

**Scout and Fold.** A credibility table for sports voices is the Markets track example, and Foresight Arena already runs that contest. The 6 Oct 2026 null result still applies: memory does not help the next unrelated question. https://arxiv.org/abs/2610.07782

**A second Unwritten.** Highest learning-loop score on paper. Lowest collision score. They are weeks ahead on the exact essay a judge will compare.

## The idea that survives

**Keeps.** A group agent that gets stricter about who to believe.

A friend group uses one agent to turn chat into a plan. Early on, the agent treats "maybe Lisbon" as a plan. It books. The weekend does not happen. That outcome is written down. It happens again. The stored record now says Maya's last four maybes did not become a plan. The next maybe from Maya does not book. Sam's last four yeses did. Sam's yes books.

The screen is the agent's decision, with the memories beside it. It is not a leaderboard and not a settings page. Week one and week four are the same kind of sentence from the same person. The answer changed. The old outcomes are still there.

A blank agent, given only the group account id, restores and makes the same call. That is the portability Walrus advertises. https://docs.wal.app/walrus-memory

Maya can also tell her own agent "I want to cancel," on an account the group key has never been given. The group agent refuses because of the four outcomes on the group account. It cannot open her account. Tatum Sui RPC reads both accounts and their delegate lists, so the split is on chain rather than a folder in the app. Walrus docs: a namespace does not restrict other delegates on the same account, and each Sui address has one MemWal account. https://docs.wal.app/walrus-memory/contract/ownership-and-permissions

The reliability update is code. The agent is only allowed to say what the code decided. Unwritten's discipline is the right one: if the model can overrule the record, the demo is theater.

### Why this is not the brief's sports example

The Markets blurb is: users log picks, memory stores credibility, the app learns who to trust. Doing that for analysts is copying the brief. Doing it for whether a person in a group meant what they said is a different product. The hero is a booking that stops, not a table of scores. If the build drifts into a ranking page, kill it. The rubric point for "a person gets it" depends on that.

### What to film

Label the seeded weeks, the way Unwritten labeled the Wilsons. Four past weekends can be fixtures. The live minute is one new sentence.

1. Maya says maybe. The agent does not book. Four outcome memories are on screen.
2. Sam says yes. The agent books. Four different memories are on screen.
3. Maya's private account holds "I want to cancel." A recall from the group key does not return it. Tatum shows the two accounts.
4. A new agent restores the group account and still refuses Maya.

Ten Mainnet memories fall out of the outcomes, the two new lines, and the appended reliability record. The blog says the weeks were seeded, the gate is code, and the private account was never granted.

### What would falsify this

- The only visible change is a percentage on a card. That is Fold again.
- The refusal is a sentence in the system prompt, and wiping the account does not change it.
- The private account is the whole demo. That is Aside, and it fails the assignment.
- Shipping it requires a real multi-user chat. The demo is a scripted group and one live decision.

## Correction, 18 Oct 2026

The 84 is a contest-fit score. It is not evidence that people want Keeps. The cell "A person gets it" (13/15) scored whether the story can be understood in one scene. It did not score demand.

No paper or user study found in this pass says people want an agent that publishes which friend flakes. The products already selling this pain (Partiful, eventMate, Who's In, Campfire RSVP) sell a fresh yes / no / maybe for one plan. They do not sell a historical reliability score. A Campfire post names the chronic non-responder and tells the host to book without them, which is a host tactic, not a measured market. https://www.campfire.rsvp/blog/how-to-get-friends-to-rsvp

What is cited, and what it actually supports:

- Sharma, Fowlersmith, and Maamari, AgentMemGate, arXiv:2610.07707, 6 Oct 2026. On 147 held-out conversations, Mem0 and Graphiti state unresolved plans as current reality for 35.2% and 27.3% of pending plans. Supports "maybe must not become a fact." Does not support scoring the speaker.
- Wei, Shen, Tang, Lu, Huang, Xu, Li, Hu, and Li, Who May Release an Agent's Promise?, arXiv:2610.21203, 15 Oct 2026. A team assistant's promise is dropped or executed by the wrong person. Across six models, larger ones drop a promise on a peer's word (Qwen3.8-27B 89%, gpt-6.1-sol 83%). A commitment ledger the agent keeps itself stops override in four of five models, and with a release policy lifts gpt-6-luna from 49% to 83%. Supports a ledger of whether this promise is still owed. Does not support a reputation of the person.
- Owolabi, SocialMemBench, arXiv:2605.17789, 18 May 2026. Mem0, LangMem, Graphiti, and Cognee score about 0.12 to 0.18 on friend and family questions. Group consensus overwrites individual dissent. Supports keeping who agreed and who did not. Synthetic groups, not a product study.
- Yang and coauthors, GroupMemBench, arXiv:2605.14498, 14 May 2026. Strongest memory system they tested reaches 46.0% on multi-party questions, and 27.1% on knowledge update. Supports "the agent forgets that the plan changed."

The learning loop in Keeps, "after four misses, stop booking this person," is an invention aimed at the hackathon sentence "sharper every week." Treat that mechanism as unproven demand.

## Track

Smart Agents for Real Life. One submission. Do not file the finance track. Unwritten is already the serious finance entry we know about, and a second household app invites a direct loss.

Do not bend the app onto ai.tatum.io for the other $500 unless the product is actually built there. Unwritten already kept an AI Builder lineage in a separate repo. A decorative pass will not beat a real one.
