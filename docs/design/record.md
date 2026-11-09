# Design: Record

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-11-04
**Scope:** System-wide

## Mission

Keep the decision sentence, name a file without returning its bytes, and prove the Sui object.

## Memory

The adapter calls `MemWal.create` with the delegate key, the account id, `https://relayer.memory.walrus.xyz`, and namespace `sederunt`. Tests use an in-memory fake. They do not call the network.

`remember` takes text. The text is the memory document from [Entities](./entities.md). The idempotency key is at most 255 bytes. `remember` returns a job. The blob id is recorded when the job is done. Until then the decision has no blob id and is not claimed as durable.

`recall` returns decrypted text for the closest matches, limited by the caller and capped by the relayer. The gate parses the document and applies the invite check before any sentence is returned. Default limit is 10. The cap is 100.

`analyze` extracts facts from long text. It is not the path for a short decision, and it does not accept a file.

The public relayer's server wallet pays the WAL storage fee and the SUI gas. This process holds neither token. The relayer sees plaintext during encryption and embedding.

A blob lives for the epochs that write paid. Mainnet epochs are about two weeks. The owner-token API grants `memories.read` only, so this process cannot renew a blob. The decision stores `expiryEpoch` when the relayer provides it. Console does not renew memory blobs. When the epoch passes, the content is gone.

Locate uses Tatum gRPC. A stored object id is one `GetObject`. Otherwise `ListOwnedObjects` on the owner address from `remember` matches the blob id, then `GetTransaction` reads the certifying checkpoint. There is no public GraphQL query and no whole-chain scan. A miss leaves the proof `unknown`. That locate result is a candidate stamp. The proof is the later `GetObject` check: the blob exists, the blob id matches, it is certified, and the checkpoint and time are known.

## Durable deletion

Deletion first persists one metadata-only intent per tenant, room and source or decision identifier. The server must authorize the request before calling the store. Room/source/decision identifiers are SHA-256 digests of namespace-qualified JSON values. The intent stores no sentence, file name, source text or provider error. Digests are pseudonymous identifiers, not encryption or protection against guessing low-entropy IDs.

`src/memory/deletions.js` supplies `createDeletionStore(env)` for Supabase and `createLocalDeletionStore(file)` for local SQLite. The caller creates the local parent directory beneath `.local/`; the runtime requires the pinned Node version. Local SQLite uses transactions, a busy timeout and leases across process instances. Hosted composition must fail closed when the store is unavailable; it must never substitute a process-local Map.

`request({tenantId, roomId, sourceIds, decisionIds})` accepts a trusted tenant UUID and at least one source/decision ID. It commits all targets atomically and deduplicates replays without reopening completed work. A source intent covers every matching decision, including records discovered after the request. An intent is retained after provider cleanup and tenant retirement; there is deliberately no tenant foreign-key cascade. Tenant IDs must never be reassigned.

`list(tenantId)` includes pending, running, failed and completed intents. `withDeletionOverlay(memory, store, tenantId)` filters both index and recall, and `filterDeletedDecisions(store, tenantId, decisions)` filters already-loaded decisions. Every board, proof, room, semantic answer, minutes and follow-up evidence reader must apply this overlay before returning content. A failed overlay read fails the request instead of returning unfiltered memory. Do not cache an empty overlay indefinitely. Pending deletion also removes matching queued proposal text from reader responses.

`drainDeletions({store, resolveDecisions, writeTombstone, limit, leaseSeconds})` claims at most 100 intents with a lease of at most 300 seconds. Defaults are 10 intents and 60 seconds. `resolveDecisions(intent)` must read the tenant's **unfiltered** provider adapter and return decision objects; the worker independently checks their room and source/decision digest before writing every match. `writeTombstone({intent, decision})` supplies the existing memory tombstone conversion, with sentence/file names cleared, `deleted: true` and stable idempotency such as `${decision.id}:deleted`. It returns a durable write receipt; null/undefined means failure, while local `{blobId:null}` is a valid receipt. Provider idempotency is required because a crash or expired lease can repeat writes.

The RPC claim uses row locks with `SKIP LOCKED`. Each claim receives a fresh token; completion and failure require that token and an unexpired lease. Failure retains overlay suppression and exponential retry delay capped at one hour. No plaintext error is persisted. The worker returns only claimed/completed/failed/lostLease counts. The current Node process or a protected host-invoked drain must keep scheduling bounded retries; a background promise alone is insufficient. Bound provider calls to finish within the lease, or accept an expired claim and an idempotent retry.

Acceptance means **deletion requested and hidden**, not provider cleanup completed. If intent persistence fails, return a retryable error without reporting deletion. Once accepted, mark every matching loaded decision deleted, remove pending text, and then attempt cleanup. UI can distinguish pending cleanup, retrying and completed cleanup from the durable state. The provider's semantic index is approximate; zero discovered records does not prove physical erasure. Permanent overlay suppression prevents late/stale replay from resurrecting content. Immutable Walrus blobs are not physically erased by writing a tombstone.

The additive migration is `20261109110000_memory_deletions.sql`. Tables and RPCs deny anonymous and authenticated member roles; only service-role server calls are allowed. Apply it before enabling deletion readers. Application rollback must retain the table and overlay enforcement.

## Files

A file goes to a private Console folder through the Console API. The service private key stays on the machine and off the landing. Reserve returns sponsored transaction bytes. The adapter signs those bytes with the service key and posts the signature. Console attaches the gas sponsor and broadcasts. The service key needs no SUI balance for that call.

Channel files use the same account. By default every workspace shares one private folder. A workspace can be mapped to its own folder and child key; that key is sealed with `MCP_SECRETS_KEY_V1` and the runtime does not mint it. `CONSOLE_API_KEY` and `CONSOLE_SERVICE_PRIVATE_KEY` are required for a live write. `CONSOLE_SPACE_ID` selects the space (unset uses the key's personal space). `CONSOLE_FOLDER_ID`, when set, is an existing folder and is never created. `CONSOLE_FILES_FOLDER_NAME` (default `sederunt-files`) is used only when that id is unset. `FILES_DEMO=1` serves an in-memory page. The layout, tags, tenancy, and delete rules are in [walrus-files.md](./walrus-files.md). The mint sequence is [console-mint-plan.md](./console-mint-plan.md).

The decision's `fileNames` entry is the name people hear. `recall` does not return bytes. Disconnecting Console does not delete memories. Console's Memory tab is metadata. It does not hold the sentence.

New files uploaded through Console renew on their own.

## Proof

Tatum gRPC `GetObject` reads the object. The proof reports:

- the checkpoint sequence
- the write preference in effect, when the subject is an action
- the domain status

It does not report an account id or a key.

If the sentence inside the memory document and the object disagree, the object is followed. If the read fails, the status is `unknown`. The adapter does not fall back to a public fullnode. It does not use the Tatum Data API or Storage API.

`acceptCheckpoint` refuses a checkpoint that is not a non-negative integer, and refuses a checkpoint later than the checkpoint at which the result was already knowable.

## Personal notes

A utterance that starts with `private:` or `private note:` is remembered on the personal account. The company delegate is not used for that call. The personal invite set is the speaker's member id.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-2, SED-5, SED-6, SED-7
- Decisions: [0002](../decisions/0002-two-accounts.md), [0005](../decisions/0005-walrus-is-the-record.md)
- Entities: [docs/design/entities.md](./entities.md)
- System: [docs/design/system.md](./system.md)
