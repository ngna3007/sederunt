# Auth setup

Console sign-in uses Supabase Auth when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set. A workspace passphrase (`SEDERUNT_CONSOLE_SECRET`) still works on its own, and stays available as a secondary "Use a passphrase" form when both are set. With neither configured, the console stays open.

## Configure

Copy `.env.example` to a gitignored file such as `.env` and replace the placeholders. Do not commit real keys.

Start the process with the env file:

```sh
node --env-file=.env src/server.js
```

`SEDERUNT_SESSION_SECRET` seals the OAuth cookie (access token and refresh token). If it is unset, the process uses `SEDERUNT_CONSOLE_SECRET`, then a random key that does not survive a restart.

In the Supabase dashboard:

1. Authentication → URL configuration. Add redirect URL `<origin>/console/auth/callback`, for example `http://127.0.0.1:8787/console/auth/callback` or the public `https` origin.
2. Authentication → Providers. Enable Google and GitHub. Set each provider's client id and secret there. The app always shows both buttons. A provider that is off returns to the sign-in page with a notice instead of a Supabase error.
3. Set `SEDERUNT_PUBLIC_ORIGIN` to that same origin when the process sits behind a proxy, so the OAuth `redirect_to` matches the allowed URL.

Google and GitHub are separate accounts. The first sign-in creates a personal tenant and a profile.

## Fake mode

`SEDERUNT_AUTH_FAKE=1` uses an in-process identity backend and makes no network calls. Google signs in as Ada Lovelace. GitHub starts off. It overrides a configured Supabase URL, which keeps tests from calling out. Unset it for a real project.

Try the first-run flow locally:

```sh
SEDERUNT_AUTH_FAKE=1 node src/server.js
```

Open http://127.0.0.1:8787/console and continue with Google. GitHub stays off unless `SEDERUNT_AUTH_FAKE_GITHUB=1`.

## Fake calendar

`SEDERUNT_CALENDAR_FAKE=1` keeps Calendar in memory. The console can read and edit a few meetings for today and tomorrow. Each has a description and guests. Board readout is read-only and rejects writes. Nothing is sent to Google.

Fake auth turns this on by itself. `SEDERUNT_AUTH_FAKE=1` implies a fake calendar unless `SEDERUNT_CALENDAR_FAKE=0`.

`SEDERUNT_CALENDAR_FAKE_CONNECTED=0` still lists those meetings, but the console treats Calendar as not connected. Home then shows the Calendar tool ask when the account is allowed to ask.

```sh
SEDERUNT_AUTH_FAKE=1 SEDERUNT_CALENDAR_FAKE_CONNECTED=0 node src/server.js
```
