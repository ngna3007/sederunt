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
