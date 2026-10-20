# Staff

A second product idea. 18 Oct 2026. Richer Walrus use than Scout.

## One sentence

Staff is a desk of agents you can hire and fire. Firing one removes its key from your Walrus account on Sui. Hiring a new one rebuilds the same memories from the chain. The memories stay yours.

## Why this uses Walrus for real

From the Walrus Memory contract docs, updated 16 Oct 2026:

- The owner of a `MemWalAccount` is the only one who can add or remove delegate keys. https://docs.wal.app/walrus-memory/contract/delegate-key-management
- A delegate can remember, recall, analyze, and restore. It cannot add keys, remove keys, or transfer the account. https://docs.wal.app/walrus-memory/contract/ownership-and-permissions
- Removing a key stops that key from using the relayer. The SDK call is `removeDelegateKey`.
- A new delegate on the same account can `restore` a namespace from the onchain blob list and decrypt, because the memories were never inside the fired agent. https://docs.wal.app/walrus-memory/fundamentals/architecture/tracking-agent-storage
- Seal encrypts the content. Ownership of the account is public. Tatum's Sui RPC can read the account and show the delegate list change.
- An account can be deactivated. That denies Seal decryption for every key until the owner turns it back on. That is the panic button.
- Up to 20 delegate keys.

## The limit we must not lie about

A namespace is not a lock between agents. Delegate access is account-wide. Any registered delegate can request any namespace on that account. The docs say this in Ownership and Permissions and again in the multi-tenant cookbook. https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant

So Staff does not claim "the sports agent cannot see the budget." On one account, a hired agent can. The real onchain act is hire and fire: the key is on the account, or it is not.

True separation would be two MemWal accounts, because each Sui address can own only one. That is a later step, not the demo.

## What you see

Two agents on one screen. One talks about a league: who you trust, what you locked in last time. One talks about the household: who owes what, a spend limit. Both write into your account, in different namespaces, so recall stays organized.

You press Fire on the sports agent. The app submits `removeDelegateKey`. That agent tries to recall and fails. Tatum's Sui RPC shows the account's delegate list without that key.

You press Hire. A blank agent gets a new delegate key. It calls `listNamespaces` and `restore`, then answers from the old memories. It has never seen the first chat's database.

Ten memories is the normal session: picks, a correction, a settlement, a rent rule, a correction to that rule.

## Track

Smart Agents for Real Life. The sports board and the household ledger are the memories the staff carry, not separate products.

## What this is not

- Not a per-folder permission system. Walrus does not enforce that between delegates.
- Not Scout. Scout's main act is a forecast. Staff's main act is the key on the account.
- Not Carry. Carry receipts what an answer used. Staff shows an agent going blind, and a new agent recovering the same blobs.
