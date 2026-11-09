# Auth setup

Member web sign-in uses Google through Supabase Auth when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set. GitHub and workspace-passphrase sign-in are not member web entry paths. The separate `/admin` operator login is unaffected. Signed Slack requests and configured local MCP identities do not require a separate web login.

## Configure

Copy `.env.example` to a gitignored file such as `.env` and replace the placeholders. Do not commit real keys.

Start the process with the env file:

```sh
node --env-file=.env src/server.js
```

Set `SEDERUNT_SESSION_SECRET` to a strong server-only secret shared by application instances. It signs the OAuth cookie (access token and refresh token). The local development fallback is a passphrase secret, then a random per-process key; neither is a production configuration.

In the Supabase dashboard:

1. Authentication → URL configuration. Add redirect URL `<origin>/console/auth/callback`, for example `http://127.0.0.1:8787/console/auth/callback` or the public `https` origin.
2. Authentication → Providers. Enable Google and set its client id and secret there. Disable GitHub and other unused providers. Sederunt offers only Continue with Google; direct GitHub authorization requests are rejected.
3. Set `SEDERUNT_PUBLIC_ORIGIN` to that same origin when the process sits behind a proxy, so the OAuth `redirect_to` matches the allowed URL.

The first Google sign-in creates a personal tenant and a profile. Basic sign-in does not request Calendar or Forms feature scopes; those are requested when the person connects the feature. Existing sessions without verified Google provider provenance must sign in again. A Gmail address or a linked Google identity alone is not accepted as proof of a Google sign-in.

## Fake mode

`SEDERUNT_AUTH_FAKE=1` uses an in-process identity backend and makes no network calls. Google signs in as Ada Lovelace. It overrides a configured Supabase URL, which keeps tests from calling out. Unset it for a real project.

Try the first-run flow locally:

```sh
SEDERUNT_AUTH_FAKE=1 node src/server.js
```

Open http://127.0.0.1:8787/console and continue with Google. GitHub remains unavailable even if the fake backend fixture has it enabled. Fake mode and an open local console are development-only.

## Fake calendar

`SEDERUNT_CALENDAR_FAKE=1` keeps Calendar in memory. The console can read and edit a few meetings for today and tomorrow. Each has a description and guests. Board readout is read-only and rejects writes. Nothing is sent to Google.

Fake auth turns this on by itself. `SEDERUNT_AUTH_FAKE=1` implies a fake calendar unless `SEDERUNT_CALENDAR_FAKE=0`.

`SEDERUNT_CALENDAR_FAKE_CONNECTED=0` treats Calendar as not connected. Home shows the Calendar connection prompt rather than editable upcoming meetings.

```sh
SEDERUNT_AUTH_FAKE=1 SEDERUNT_CALENDAR_FAKE_CONNECTED=0 node src/server.js
```
