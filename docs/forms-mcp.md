# Google Forms MCP

Sederunt ships an in-repo Google Forms MCP server. It speaks Streamable HTTP with `@modelcontextprotocol/server` v2. The process does not keep Google tokens. Each call uses the bearer token on that request and forwards it to `https://forms.googleapis.com/v1`.

On a running Sederunt server the endpoint is `/mcp/forms`. External MCP clients use that URL. The Connectors preset does not. A connector with preset `google-forms` is called in-process: the connector client opens the Forms MCP server in memory and passes that person's access token in the request context. The stored URL is the marker `builtin:google-forms`. The card shows **Built in**. An older row whose URL is still this server's `/mcp/forms` is treated the same way when its preset is `google-forms`. Neither path is fetched, so the preset works with `SEDERUNT_MCP_FAKE=0` and `SEDERUNT_PUBLIC_ORIGIN` on `127.0.0.1`.

The same server can run on its own:

```
node src/mcp-forms/serve.js
```

`PORT` sets the listen port. The default is `8787`, on `127.0.0.1`. The path is `/mcp/forms`.

## Scopes

Incremental Google consent asks for:

- `https://www.googleapis.com/auth/forms.body`
- `https://www.googleapis.com/auth/forms.responses.readonly`

The Connectors card shows **Connect Google Forms** until the signed-in person has granted both. That button opens `/console/auth/google?intent=forms&next=/console/connectors`, which adds `access_type=offline`, `prompt=consent`, and `include_granted_scopes=true`. The callback stores the scopes Google returned on the token (`scope`). It then redirects to `/console/connectors`.

If Google did not grant a Forms scope, the grant is still saved and the card goes back to **Needs Google access** with "Google did not grant Forms access. Connect again and allow Forms."

The refresh token and the granted scopes are sealed with `MCP_SECRETS_KEY_V1`. The row is ciphertext, nonce, key version, and a scopes array. The access token is cached in memory on that process only. It is not written to the row, the browser, or the session cookie. A refresh that returns `invalid_grant` deletes the row and the next call reports `needs_access`. Any other refresh failure keeps the row.

Grants are keyed by space and person. When `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set, the row is `public.person_google_grants` through the service role. Otherwise it stays in memory. Fake auth does not by itself force the memory backend.

Calls from Sederunt's own `/mcp` are named `google-forms__<tool>`. The connector client loads that person's access token and passes it in-process. A 401 refreshes once. The token is not logged and not returned.

## Tools

| Tool | Class | What it does |
| --- | --- | --- |
| `create_form` | write | Creates a form, adds questions, and publishes unless `publish` is false. |
| `add_questions` | write | Appends questions after the items already on the form. |
| `publish_form` | write | Publishes and sets whether the form accepts responses. |
| `get_form` | read | Title, questions, publish state, and links. |
| `list_responses` | read | Responses with answers keyed by question title. |

Question types are `short_text`, `paragraph`, `multiple_choice`, `checkboxes`, `dropdown`, `scale`, and `date`. Choice questions need 1–50 unique, non-empty options. A form takes at most 100 questions. Titles are at most 300 characters.

Each tool returns `structuredContent` as the object and `content[0].text` as a short summary. `create_form` structured fields are `formId`, `title`, `responderUri`, `editUrl` (`https://docs.google.com/forms/d/<id>/edit`), `published`, and `questionCount`. The tools declare an `outputSchema` for those objects. A tool error is `isError: true`, with text `code: message` and `structuredContent` `{ code, message }`. The text does not include the bearer token.

## Confirming a write

On Sederunt's `/mcp`, `create_form`, `add_questions`, and `publish_form` are held until someone confirms, unless the space has a live preference `mcp:google-forms:<tool>` set to `do`. A held result's `structuredContent` is:

```json
{
  "held": true,
  "needsConfirmation": true,
  "actionId": "mcp-hold-1",
  "tool": "google-forms__create_form",
  "actionClass": "write",
  "preference": "ask"
}
```

`content[0].text` says the call needs confirmation. The form is not created yet. Call `tools/call` again with the same arguments and `arguments._confirm` set to that `actionId`. The same confirmation is `params._meta` with `confirmed: true` and `confirmActionId`. The id runs once. Using it again does not call the tool and does not open a new hold. `get_form` and `list_responses` run without this step. After a confirmed call, `structuredContent` is the form object from the tool, not a wrapper around it.

## Environment

| Name | Purpose |
| --- | --- |
| `SEDERUNT_FORMS_FAKE` | `1` keeps forms in memory. `0` calls Google even when `SEDERUNT_AUTH_FAKE=1`. |
| `SEDERUNT_AUTH_FAKE` | When Forms fake is unset, `1` turns the in-memory forms server on. |
| `SEDERUNT_AUTH_FAKE_SCOPE` | Fake consent only. When set, the token's `scope` is this value instead of the scopes on the consent URL. Empty uses the requested scopes. |
| `SEDERUNT_MCP_FAKE` | `1` allows other loopback connector URLs. The Forms preset does not use it. |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client used to refresh a person's Forms access token. `CALENDAR_OAUTH_CLIENT_ID` is the fallback. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Matching secret. `CALENDAR_OAUTH_CLIENT_SECRET` is the fallback. |
| `MCP_SECRETS_KEY_V1` | 32-byte key that seals the per-person refresh token. Server only. |
| `SUPABASE_URL` | When set with a service-role key, grants are stored in `person_google_grants`. |
| `SUPABASE_SECRET_KEY` | Service-role key for that table. `SUPABASE_SERVICE_ROLE_KEY` is the same value. The key is a header, not part of the URL, and it is not logged. |
| `PORT` | Listen port for `node src/mcp-forms/serve.js`. Default `8787`. |

Fake mode (`SEDERUNT_FORMS_FAKE=1`, or auth fake unless Forms fake is `0`) never calls Google. Ids are `fake-form-1`, `fake-form-2`, and so on. A seeded form `fake-form-seed` ("Weekly feedback") has two responses. The responder link is `http://<this-host>/forms/fake/<id>/viewform`, served by Sederunt so it opens offline. The preset connects without a Google grant.

Sederunt does not read `FORMS_ACCESS_TOKEN`.

## Live check

To call Google for real, use a script you keep outside this repository. That script reads `FORMS_ACCESS_TOKEN` from its own environment and sends it as a bearer token. Do not commit the token, and do not point the script at a secrets file in this workspace.

Start the server (`SEDERUNT_FORMS_FAKE` unset or `0`), then from that outside script:

```
curl -sS "http://127.0.0.1:8787/mcp/forms" \
  -H "authorization: Bearer ${FORMS_ACCESS_TOKEN}" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A `tools/call` for `create_form` uses the same header. The token needs the two Forms scopes above. `structuredContent` is the form object. `content[0].text` is a one-line summary.
