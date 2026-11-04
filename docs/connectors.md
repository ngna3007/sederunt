# Custom MCP connectors

A space can add an MCP server over Streamable HTTP. Sederunt lists that server's tools, keeps them off until someone enables them, and exposes the enabled ones on its own MCP endpoint.

The exposed name is `<slug>__<tool>`. The description and input schema are the remote ones. A call is checked with `authorize()`:

- `read` runs.
- `write` asks unless this space has a live preference `mcp:<slug>:<tool>` set to do.
- `delete` always asks. An unconfirmed write or delete is held and the remote server is not called.
- A tool whose definition changed since approval is disabled and is not listed. A call to it is refused.

## Confirming a held call

A held write or delete includes `actionId`. The remote tool has not run. Call `tools/call` again with the same arguments and `arguments._confirm` set to that `actionId`. The same confirmation is `params._meta` with `confirmed: true` and `confirmActionId`. That id runs once. Using it again does not call the tool and does not open a new hold. A live preference `mcp:<slug>:<tool>` of do lets a write run without this step. A delete still asks.

## Google Forms

The Connectors page adds a Google Forms preset for the current space. The connector URL is this server's `/mcp/forms`. Calls use the signed-in person's Google access token as a bearer header. That token stays on the server. When Forms scopes are missing, the card says Connect Google Forms and starts incremental Google consent. Fake mode (`SEDERUNT_FORMS_FAKE=1`, or `SEDERUNT_AUTH_FAKE=1` unless Forms fake is `0`) connects without a Google grant.

## Environment

| Name | Purpose |
| --- | --- |
| `MCP_SECRETS_KEY_V1` | 32-byte AES-256-GCM key, as 64 hex characters or base64. Server only. Required before a connector token can be stored. Leave it empty in examples. |
| `SUPABASE_SECRET_KEY` | Service-role key for the server-side connector store. `SUPABASE_SERVICE_ROLE_KEY` is accepted as the same value. Without it, or when fake auth is on, connectors stay in memory. |
| `SEDERUNT_MCP_FAKE` | `1` allows the loopback fake MCP server (`http://127.0.0.1` or `http://localhost` only). `0` turns that off even when `SEDERUNT_AUTH_FAKE=1`. |
| `SEDERUNT_MCP_FAKE_PORT` | Port for the demo server. Empty uses a random loopback port. The add dialog shows that URL as "Use demo server". |
| `SEDERUNT_TENANT_ID` | Space id used by the stdio MCP process when it is not implied by the only in-memory tenant. |

Tokens are write-only. The console shows "Token set" and the last four characters. They are not written to the activity log or returned by the API.

The connector list is `GET /console/connectors` with `Accept: application/json`. The same path without that header is the console page.
