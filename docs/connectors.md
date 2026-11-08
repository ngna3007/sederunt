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

## Google Calendar

The Connectors page adds a Google Calendar preset next to Google Forms. It uses the signed-in person's Google account and the same Calendar grant as calendar-edit. If that grant is already present, the card says **Add · already connected** and can be added with no second consent. If it is not, the card says **Needs Google access** and **Connect Google Calendar**, and the link is the existing incremental consent flow (`access_type=offline`, `prompt=consent`, `include_granted_scopes=true`). After that grant, calendar-edit and this preset share it. A declined Calendar scope leaves the card on Needs Google access and explains that Calendar access was not granted. The refresh token is not stored for a partial grant.

The stored URL is `https://calendarmcp.googleapis.com/mcp/v1`. That host is fixed for this preset. It is not a URL the person typed, and the URL guard does not look it up. The connector card shows that URL. Calls use the calendar-edit token and its refresh. The token stays on the server and is not returned.

Tools come from the upstream `tools/list`. Each tool is Read, Write, or Delete from its annotations, or from the name when those hints are absent: `list_`, `get_`, `search_`, and `suggest_` are read; `create_`, `update_`, and `respond_` are write; `delete_` is delete. Exposed names are `google-calendar__<tool>`. Read runs. Write is held for confirmation on `/mcp` unless the space preference `mcp:google-calendar:<tool>` is do. Delete always asks, and delete tools stay off until someone turns them on. Confirm with `arguments._confirm` or `params._meta`. A successful call passes `structuredContent` through.

Fake mode (`SEDERUNT_CALENDAR_FAKE=1`, or `SEDERUNT_AUTH_FAKE=1` unless Calendar fake is `0`) serves `list_events`, `get_event`, `list_calendars`, `search_events`, `suggest_time`, `create_event`, `update_event`, `delete_event`, and `respond_to_event` in-process. `SEDERUNT_CALENDAR_FAKE_CONNECTED=0` keeps that server but presents Calendar as not connected. The stored URL stays the Google host.

The refresh grant is sealed with `MCP_SECRETS_KEY_V1` and stored per space and person. With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) that row is `public.person_google_grants`. Otherwise it is in memory. Access tokens are not stored.

## Environment

| Name | Purpose |
| --- | --- |
| `MCP_SECRETS_KEY_V1` | 32-byte AES-256-GCM key, as 64 hex characters or base64. Server only. Required before a connector token or a Forms refresh grant can be stored. Leave it empty in examples. |
| `SUPABASE_SECRET_KEY` | Service-role key for the server-side connector store and Forms grants. `SUPABASE_SERVICE_ROLE_KEY` is accepted as the same value. Without it, connectors stay in memory. Fake auth also keeps connectors in memory. Forms grants use Supabase whenever the URL and this key are set. |
| `SUPABASE_URL` | Project URL. With the service-role key, Forms grants are written to `person_google_grants`. |
| `SEDERUNT_MCP_FAKE` | `1` allows the loopback fake MCP server (`http://127.0.0.1` or `http://localhost` only). `0` turns that off even when `SEDERUNT_AUTH_FAKE=1`. The Forms preset does not fetch a URL, so this flag does not apply to it. |
| `SEDERUNT_MCP_FAKE_PORT` | Port for the demo server. Empty uses a random loopback port. The add dialog shows that URL as "Use demo server". |
| `SEDERUNT_AUTH_FAKE_SCOPE` | Fake Google consent only. Overrides the scope string returned to the Forms or Calendar callback. |
| `SEDERUNT_CALENDAR_FAKE` | `1` serves the Calendar preset in-process. `0` turns that off even when `SEDERUNT_AUTH_FAKE=1`. |
| `SEDERUNT_TENANT_ID` | Space id used by the stdio MCP process when it is not implied by the only in-memory tenant. |

Tokens are write-only. The console shows "Token set" and the last four characters. They are not written to the activity log or returned by the API.

The connector list is `GET /console/connectors` with `Accept: application/json`. The same path without that header is the console page.


## Outbound connection boundaries

Custom MCP HTTP and SSE connections resolve the destination once for each request and pin those vetted IPv4/IPv6 addresses into the socket lookup. The original hostname remains the HTTP host and TLS server name, with certificate verification enabled. Private, loopback, link-local and metadata destinations are refused, including mixed public/private DNS answers. Each redirect is checked again; credentials are never forwarded to another origin. Connections use the direct transport rather than environment proxy settings or a second global-fetch DNS lookup.

Development can explicitly allow an HTTP loopback fake server. Production (`NODE_ENV=production` or `VERCEL_ENV=production`) ignores fake-loopback flags and injected fetch adapters. There is no production fallback to an unpinned fetch when DNS, TLS or connection validation fails. A connector using an untrusted/self-signed TLS certificate must install a valid certificate; disabling verification is not supported.

The transport streams request and response bodies, supports cancellation and applies the connector's existing timeout. Gzip, deflate and Brotli response decoding preserves the SDK's fetch contract. The pinning tests use local sockets and a generated disposable TLS certificate; they never probe a real metadata service.
