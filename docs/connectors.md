# Custom MCP connectors

A space can add an MCP server over Streamable HTTP. Sederunt lists that server's tools, keeps them off until someone enables them, and exposes the enabled ones on its own MCP endpoint.

The exposed name is `<slug>__<tool>`. The description and input schema are the remote ones. A call is checked with `authorize()`:

- `read` runs.
- `write` asks unless this space has a live preference `mcp:<slug>:<tool>` set to do.
- `delete` always asks. An unconfirmed write or delete is held and the remote server is not called.
- A tool whose definition changed since approval is disabled and is not listed. A call to it is refused.

## Confirming a held call

A held write or delete has not called the remote tool. `structuredContent` is `{ held, needsConfirmation, actionId, tool, actionClass, preference }`. `content[0].text` says the call needs confirmation. Call `tools/call` again with the same arguments and `arguments._confirm` set to that `actionId`. The same confirmation is `params._meta` with `confirmed: true` and `confirmActionId`. That id runs once. Using it again does not call the tool and does not open a new hold. A live preference `mcp:<slug>:<tool>` of do lets a write run without this step. A delete still asks.

A successful custom tool call passes the upstream `structuredContent` through unchanged. `content[0].text` is the upstream text, or compact JSON when the upstream sent none. `recall` and `act` still return the decision record. A failed custom call is `isError: true` with `structuredContent` `{ code, message }` and the same message as text.

## Google Forms

The Connectors page adds a Google Forms preset for the current space. The connector is the built-in Forms server, called in-process. Its stored URL is `builtin:google-forms`, and the card shows **Built in**. Calls use the signed-in person's Google access token inside that process. The token stays on the server. When Forms scopes are missing, the card says Connect Google Forms and starts incremental Google consent. A declined Forms scope leaves the card on Needs Google access and explains that Forms access was not granted. Fake mode (`SEDERUNT_FORMS_FAKE=1`, or `SEDERUNT_AUTH_FAKE=1` unless Forms fake is `0`) connects without a Google grant.

The refresh grant is sealed with `MCP_SECRETS_KEY_V1` and stored per space and person. With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) that row is `public.person_google_grants`. Otherwise it is in memory. Access tokens are not stored.

## Environment

| Name | Purpose |
| --- | --- |
| `MCP_SECRETS_KEY_V1` | 32-byte AES-256-GCM key, as 64 hex characters or base64. Server only. Required before a connector token or a Forms refresh grant can be stored. Leave it empty in examples. |
| `SUPABASE_SECRET_KEY` | Service-role key for the server-side connector store and Forms grants. `SUPABASE_SERVICE_ROLE_KEY` is accepted as the same value. Without it, connectors stay in memory. Fake auth also keeps connectors in memory. Forms grants use Supabase whenever the URL and this key are set. |
| `SUPABASE_URL` | Project URL. With the service-role key, Forms grants are written to `person_google_grants`. |
| `SEDERUNT_MCP_FAKE` | `1` allows the loopback fake MCP server (`http://127.0.0.1` or `http://localhost` only). `0` turns that off even when `SEDERUNT_AUTH_FAKE=1`. The Forms preset does not fetch a URL, so this flag does not apply to it. |
| `SEDERUNT_MCP_FAKE_PORT` | Port for the demo server. Empty uses a random loopback port. The add dialog shows that URL as "Use demo server". |
| `SEDERUNT_AUTH_FAKE_SCOPE` | Fake Google consent only. Overrides the scope string returned to the Forms callback. |
| `SEDERUNT_TENANT_ID` | Space id used by the stdio MCP process when it is not implied by the only in-memory tenant. |

Tokens are write-only. The console shows "Token set" and the last four characters. They are not written to the activity log or returned by the API.

The connector list is `GET /console/connectors` with `Accept: application/json`. The same path without that header is the console page.
