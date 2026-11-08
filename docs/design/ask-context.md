# Design: Ask context

Requirements: [Sederunt](../requirements/sederunt.md), SED-8.3.
Related: [Access](./access.md), [Workspace](./workspace.md).

Ask quota belongs to a person across all their workspaces. Conversation content belongs to one person, tenant and company/personal selection. The server resolves current membership before reserving quota or constructing a context.

`scopeAskStore(store, { user, tenantId, workspace })` creates a request-scoped view of the existing store. `workspace` is `company` or `personal`; even a personal turn records its active tenant. The wrapper keeps the store's call shape, stamps `create`, and filters metadata, chunks, batched reads, lists and overview. It also refuses writes to a turn outside the current context. Client-supplied scope is not authorization: only the server may construct this view after verifying membership.

New turns persist `tenantId` and `workspace` in their metadata. A context-specific index retains the newest 20 turns without another context evicting them. Each read still checks the metadata rather than trusting index membership. Redis and the REST command adapter share this persistence implementation. Development uses the same context policy over the in-process store.

Existing turns with no provenance remain unscoped. They are not included in a scoped list, resumed stream, batched read or model history; their tenant is never guessed from the current session. They expire on their existing Redis TTL or are removed by the account-wide admin history reset. The unscoped raw store API remains for admin operations and compatibility with in-flight internal code, not member-facing routes. No old turn is backfilled into a tenant.

Quota remains keyed by person and day. Each successful claim returns an opaque `quotaKey` with a unique claim ID. A refund atomically consumes that claim's receipt, so repeated or concurrent refunds return one question at most. Receipts are user-bound and expire with the quota window. Reset generations prevent an older claim's refund from changing the new quota. New caller code must pass the returned token unchanged; legacy tokens without a claim receipt retain their earlier internal contract only for deployment compatibility.

The member routes must use the scoped store consistently for history listing, prior-prompt selection, chunks, SSE access checks, and cancellation. Workspace changes must close the previous subscriptions and request the new context explicitly. A stream's turn ID alone grants no access. The HTTP handler owns quota reservation ordering and exactly one refund on any post-claim failure; the store makes duplicate refund attempts safe across processes.

Admin reset uses the raw account-wide store. It clears all contexts and keeps reset tombstones so late streaming writes cannot recreate removed answers.
