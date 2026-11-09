# Tenant-scoped Slack installation (proposed, not released)

## Release gates

Independent security review is required. No production schema, environment, Slack
app configuration or installation is changed by this branch's tests.

1. Review `20261107190000_slack_installations.sql` before applying it to the target
   project. It creates service-role-only, RLS-enabled installation, lifecycle eligibility and OAuth
   nonce tables plus SECURITY INVOKER RPCs. Generation UUIDs are compare-and-swap
   preconditions, not a predictable counter that can reset after deletion.
2. Configure durable server-side Supabase service access and a valid 32-byte
   `MCP_SECRETS_KEY_V1`, plus the existing stable session secret. Production,
   including hosted preview environments, refuses an in-memory/plaintext store.
3. Configure the app's `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
   `SLACK_SIGNING_SECRET` and HTTPS `SEDERUNT_PUBLIC_ORIGIN`. `SLACK_APP_ID` is an
   optional additional OAuth response check. These identify the one distributed
   app, **not a selected tenant's bot token**. No env edits or redeploys are needed
   when an end user switches Sederunt workspaces or installs into another team.
4. Enable Slack app distribution for other workspaces; register the redirect
   `${SEDERUNT_PUBLIC_ORIGIN}/console/slack/callback` and event request URL
   `${SEDERUNT_PUBLIC_ORIGIN}/api/slack`. Subscribe to the message/app-mention
   events the product uses plus `app_uninstalled` and `tokens_revoked`.
5. Enable all `SLACK_BOT_SCOPES` in `src/slack/oauth.js`, including `files:write`
   for getUploadURLExternal/completeUploadExternal. Existing narrow installations
   need one explicit new consent for the expanded grant. Valid saved grants do
   not require repeated consent on normal tenant switches or reloads.
6. Invite the app to the selected non-archived channel. Installation alone is not
   channel readiness: Setup checks conversations.info and shows a remediation
   message if membership/access cannot be verified. It never automatically joins
   or posts a test message.
7. Preserve existing legitimate single-bot ownership during rollout: verify the
   old bot's actual team and its authoritative Redis **team** owner, then enroll
   that live tenant/team through the separate service-only `slack_legacy_enroll`
   operator/backfill RPC, **only after explicit owner/admin approval**. There is
   no ordinary app enrollment endpoint or production JS enrollment method.
   Connection-status reads and incoming events only query eligibility; they
   never create or refresh it, even when a matching Redis claim is verified.
   Never seed from a channel-only claim, cached account name, absent tenant or
   fresh user. New connections must use the explicit OAuth install flow.
   Review/enroll existing ownership before allowing competing OAuth installs.
   No Redis cleanup is required for safety: stale claims cannot grant access to
   deleted tenants or override the durable lifecycle state. Any optional cleanup
   must compare-and-delete only the exact expected owner; do not bulk-delete.

## Safety and lifecycle

- Owner/admin membership is checked at install start and on callback for the
  **starting** tenant. The signed cookie binds user, tenant, nonce, expiry and
  expected current generation. Distributed nonce consumption is an atomic SQL
  insert, not process memory. Cookie replay across app instances is refused.
- Same-tenant first installs and replacements serialize in PostgreSQL. The
  expected generation prevents stale callbacks from replacing a more recent
  connection. The unique team constraint prevents another tenant taking a team.
- Installation-store errors are never interpreted as absent records or grounds
  to fall back to a deployment token. Existing verified single-bot legacy claims
  remain compatible only after durable enrollment of an existing live tenant
  with verified authoritative team ownership; fresh tenants never inherit them.
- `slack_connection_state` records `legacy`, `oauth` or `disconnected`. Successful
  OAuth saving and supersession commit in the same transaction. Revocation,
  uninstall, explicit disconnect, reloads and failed later reconsents never turn
  a superseded tenant back into a legacy tenant. An initial OAuth transaction
  that fails atomically does not destroy a still-valid prior legacy connection.
- `slack_legacy_eligible` is a read-only STABLE SQL query with no enrollment flag.
  Read/event callers cannot turn it into a write. `slack_legacy_enroll` is a
  different privileged operation reserved for approved, verified operator
  backfill; browser anonymous/authenticated roles cannot invoke it.
- Explicit legacy enrollment checks/locks the real tenant row and serializes with OAuth
  using tenant/team advisory locks. Orphan Redis claims for absent/deleted tenants
  cannot enroll or route events, even with healthy Redis and installation reads.
  Tenant deletion cascades its Slack rows; no client can authorize from an absent
  row alone. Legacy and OAuth claims of the same team by different tenants have
  one durable winner; a same-tenant OAuth connection supersedes its legacy team.
- Retained legacy clients/events re-check durable eligibility at every network
  hop, too. A previously captured deployment token cannot be used after OAuth
  supersession or explicit disconnect.
- Clients re-resolve the tenant installation per operation. Each network hop
  additionally validates the captured generation/team/token. A replaced or
  removed generation aborts before another request can use it. An already-sent
  request cannot be recalled.
- Lifecycle deletion checks team, app, the observed generation, event time and
  (for tokens_revoked) the matching bot user ID. User-only, unrelated bot/app and
  delayed events do not delete a new installation. Persistence errors return 503
  so Slack can retry. Slack timestamps have second precision: ambiguous events
  from the installation's same second are intentionally ignored, rather than
  risking deletion of a reinstalled valid connection. Slack itself rejects
  revoked tokens; an owner can reconnect if such a race leaves a stale record.
- Tokens remain sealed server-side. Browser/status responses contain metadata
  only. Signed file upload URLs receive file bytes but not the bearer token.

## Tests

Standard focused regression (no external Slack calls):

```sh
node --test --test-reporter=tap test/slack-*.test.js test/files-slack.test.js test/openrouter-slack.test.js
```

`test/slack-installations-postgres.test.js` is opt-in and loopback-only. Use a
**disposable** database named `slack_mt_test`, real PostgreSQL and real PostgREST.
Bootstrap `auth.users(id uuid)`, `tenants(id uuid)`, and roles `anon`,
`authenticated`, `service_role BYPASSRLS`, then apply the proposed migration only
there. Seed tenants `00000000-0000-4000-8000-000000000001` through `...000030`.
PostgREST should expose `public`, use `anon` as its anonymous role and the test
JWT secret documented in the test file. The database login must be able to SET
ROLE to those three test roles. Do not use any production key or connection.

```sh
SLACK_LOCAL_POSTGREST_URL=http://127.0.0.1:55440 \
SLACK_LOCAL_PG_URL=postgres://localtester:local-only@127.0.0.1:55439/slack_mt_test \
node --test --test-reporter=tap test/slack-installations-postgres.test.js
```

The test uses the actual store over HTTP to PostgREST, not a fake REST adapter.
Only Supabase's `/rest/v1` prefix is stripped for standalone PostgREST. It tests
competing first installs, competing replacements, team claims, restart/session
restoration, distributed state replay, lifecycle CAS/ABA, legacy supersession,
orphan/deleted-tenant denial, non-enrolling ordinary reads/events, explicit-only
backfill, eligibility-store failure, legacy/OAuth races,
transaction rollback and anonymous/member privilege denial. It truncates only
those three proposed Slack tables in the named
loopback test database. Without the explicit URLs it reports a skip.

## Limits / acceptance still requiring real services

Enterprise-wide installs, GovSlack and rotating `xoxe` tokens are not supported;
use a standard per-workspace bot grant without Slack token rotation. No live
Slack install, consent, channel permission or live-meeting/demo recording is
proved by the local tests. Perform the genuine Add to Slack / A → B → A / reload
acceptance after review and authorized release, then resume the live demo plan.
