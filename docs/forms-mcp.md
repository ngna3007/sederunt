# Google Forms MCP

Sederunt ships an in-repo Google Forms MCP server. It speaks Streamable HTTP with `@modelcontextprotocol/server` v2. The process does not keep Google tokens. Each call uses the bearer token on that request and forwards it to `https://forms.googleapis.com/v1`.

On a running Sederunt server the endpoint is `/mcp/forms`. A connector preset points at that URL for the current space. The same server can run on its own:

```
node src/mcp-forms/serve.js
```

`PORT` sets the listen port. The default is `8787`, on `127.0.0.1`. The path is `/mcp/forms`.

## Scopes

Incremental Google consent asks for:

- `https://www.googleapis.com/auth/forms.body`
- `https://www.googleapis.com/auth/forms.responses.readonly`

The Connectors card shows **Connect Google Forms** until the signed-in person has granted both. That button opens `/console/auth/google?intent=forms&next=/console/connectors`, which adds `access_type=offline`, `prompt=consent`, and `include_granted_scopes=true`. The refresh token is sealed on the server for that person. It is not sent to the browser and it is not written into the session cookie.

Calls from Sederunt's own `/mcp` are named `google-forms__<tool>`. The connector client loads that person's access token and sends it as `Authorization: Bearer`. A 401 refreshes once. The token is not logged and not returned.

## Tools

| Tool | Class | What it does |
| --- | --- | --- |
| `create_form` | write | Creates a form, adds questions, and publishes unless `publish` is false. |
| `add_questions` | write | Appends questions after the items already on the form. |
| `publish_form` | write | Publishes and sets whether the form accepts responses. |
| `get_form` | read | Title, questions, publish state, and links. |
| `list_responses` | read | Responses with answers keyed by question title. |

Question types are `short_text`, `paragraph`, `multiple_choice`, `checkboxes`, `dropdown`, `scale`, and `date`. Choice questions need 1–50 unique, non-empty options. A form takes at most 100 questions. Titles are at most 300 characters.

`create_form` returns `formId`, `title`, `responderUri`, `editUrl` (`https://docs.google.com/forms/d/<id>/edit`), `published`, and `questionCount`.

## Confirming a write

On Sederunt's `/mcp`, `create_form`, `add_questions`, and `publish_form` are held until someone confirms, unless the space has a live preference `mcp:google-forms:<tool>` set to `do`. A held result looks like:

```json
{ "held": true, "needsConfirmation": true, "actionId": "mcp-hold-1", "tool": "google-forms__create_form" }
```

The form is not created yet. Call `tools/call` again with the same arguments and `arguments._confirm` set to that `actionId`. The same confirmation is `params._meta` with `confirmed: true` and `confirmActionId`. The id runs once. Using it again does not call the tool and does not open a new hold. `get_form` and `list_responses` run without this step.

## Environment

| Name | Purpose |
| --- | --- |
| `SEDERUNT_FORMS_FAKE` | `1` keeps forms in memory. `0` calls Google even when `SEDERUNT_AUTH_FAKE=1`. |
| `SEDERUNT_AUTH_FAKE` | When Forms fake is unset, `1` turns the in-memory forms server on. |
| `SEDERUNT_MCP_FAKE` | `1` allows the loopback connector URL `http://127.0.0.1/mcp/forms`. |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client used to refresh a person's Forms access token. `CALENDAR_OAUTH_CLIENT_ID` is the fallback. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Matching secret. `CALENDAR_OAUTH_CLIENT_SECRET` is the fallback. |
| `MCP_SECRETS_KEY_V1` | 32-byte key that seals the per-person refresh token. Server only. |
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

A `tools/call` for `create_form` uses the same header. The token needs the two Forms scopes above.
