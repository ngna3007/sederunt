# Pot

A group collection that cannot be marked paid unless the chain says so. 18 Oct 2026.

## The use case

Five friends are putting money in for a flat. The screen is one pot: the amount, who said yes, who has paid, and a status that is either short or covered.

Maya tells the agent she is in for $40. That yes is stored on the group Walrus account, from her key. Her note "I cannot really afford this" stays on her own account. The group key has never been added there.

Sam says he is in. No transfer arrives from Sam's address. The status stays short. The agent can remind him. It cannot flip the status to covered.

When a real USDC transfer from Maya's address hits the pot address, Tatum's Sui gateway shows that transaction. The matcher credits Maya. Sam is still unpaid. When his transfer lands, the status becomes covered. Only then can anyone treat the flat as funded.

Last month's pot is still in memory. Sam said yes and no transfer ever arrived. This month the screen shows that open item next to his new yes. The old pot is not edited. A new memory points at it.

A blank agent given the group account can restore and still see who owes what. It still cannot see Maya's private note.

## Why this is a project

The status is computed. Inputs are Walrus records and Tatum transaction results. The model is not one of the inputs. A prompt can tell an agent to be careful. It cannot see a Sui transfer, and it cannot be trusted to keep a promise ledger. Wei and coauthors, arXiv:2610.21203, 15 Oct 2026, found that stating the rule does not stop a team agent from acting on a promise that was already released. A ledger outside the model does.

https://arxiv.org/abs/2610.21203

## Walrus

- Group MemWal account: the plan, each yes, each superseding version, the outcome.
- Private MemWal account per person who wants one. Publishing a yes is a write on the group account. A namespace on the group account does not hide anything from the group delegates.
- `restore` on a second agent is the portability beat.
- Ten or more Mainnet memories come from the yeses, the shortfall, and the closed pot.

https://docs.wal.app/walrus-memory/contract/ownership-and-permissions

## Tatum

Sui is read through Tatum, not through a public full node.

- Gateway: `https://sui-mainnet.gateway.tatum.io`
- gRPC gateway: `https://sui-mainnet-grpc.gateway.tatum.io`
- Docs, 7 Oct 2026: https://docs.tatum.io/reference/rpc-sui
- `suix_getBalance` or gRPC `StateService/ListBalances` for the pot
- `suix_queryTransactionBlocks` filtered by the pot address, then `sui_getTransactionBlock` for the coin and the amount
- `sui_getObject` on each MemWal account id, so the owner and the account are on screen

Sui gas is paid in SUI. A USDC transfer can be matched on coin type and amount. Do not match on the SUI balance change. Ed's Unwritten post (15 Oct 2026) makes the same warning for SUI transfers: gas makes an honest payment look like the wrong amount.

The v4 Data API chain table does not list Sui in the portion published at https://docs.tatum.io/reference/blockchain-data-api (page updated about a month before 18 Oct 2026). Do not plan the pot on `/v4/data/wallet/balances`. Tatum's Storage API uploads Walrus blobs. That is not Walrus Memory, and it does not satisfy `remember` / `recall`.

Public Sui JSON-RPC was deprecated before this hackathon. Tatum still documents the JSON-RPC methods on its gateway, and Unwritten was still reading through that gateway on 15 Oct 2026. Call Tatum. If JSON-RPC fails in the build, use Tatum's gRPC gateway. Do not point the app at a public full node.

## Collision

Unwritten, https://github.com/EdCryptoFi/unwritten, already compares a house wallet's transfers, read through Tatum, with approvals stored in Walrus. Their product is the rule a household already follows. Pot is one collection with a status the agent cannot set. The first ten seconds of the demo have to show a single pot, short then covered. A list of inferred family rules will look like their app.

## Track

Consumer Finance Apps if the pot is the whole product. The agent is how someone joins. One submission.

## UX

One screen. The title is the plan, "Lisbon flat." Under it, one word: Short or Covered, and the dollar gap. Then a list of people. Each row is a name, "yes $40" or "no reply," and "paid" or "not yet." The agent sits under the list and can only talk. It has no button that sets Covered.

A person never sees a Walrus key, a namespace, or a transaction hash on this screen. Those sit on a proof page for the judge. Paying is the step a normal friend will not do: it requires a Sui wallet and USDC. Splitwise plus a bank app is the habit. Pot is good enough for a group that already pays on Sui, and good enough for a three-minute demo where the wallets are ours. It is not good enough to replace Splitwise for a group chat that uses Venmo.

## What would make this fail

- The status flips because the agent says so.
- The only Tatum call is reading the MemWal account in a footer.
- The demo is a chat.
- Seeded transfers are presented as live. Label them, and include one live read of the pot address.
