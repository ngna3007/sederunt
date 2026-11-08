# Sederunt

Meeting memory for teams. Sederunt keeps decisions from meetings and Slack, answers questions from the record, and asks for approval before taking an action.

[Open the app](https://sederunt.vercel.app) · [New-user demo](docs/runbooks/new-user-live-demo.md) · [Documentation](docs/README.md)

## Run locally

Use the Node version in `.nvmrc` and npm:

```sh
nvm use
npm ci
SEDERUNT_AUTH_FAKE=1 npm start
```

Open http://127.0.0.1:8787/console. Fake mode uses local identities and a fake calendar. It is for development; it does not demonstrate live Google, Slack, Walrus or Linear behavior.

For real integrations, copy `.env.example` to `.env`, supply your credentials, and start with:

```sh
node --env-file=.env src/server.js
```

Follow [authentication setup](docs/auth-setup.md), [connector setup](docs/connectors.md), and the [Files design](docs/design/walrus-files.md). Credentials stay in ignored environment files or the deployment environment. Never commit tokens, private keys, user exports, or `.local/`.

## Check changes

```sh
npm test
npm audit
```

The test runner is Node's built-in `node --test`. Browser tests use Playwright and a locally installed Chrome/Chromium; some integration tests require explicit disposable PostgreSQL and Redis configuration. See the [source audit](docs/reports/2026-11-08-source-audit.md) for the baseline, verification results and remaining hardening work. A successful unit test run alone is not a live-integration check.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | Node server, HTML views, integration adapters and domain rules |
| `src/domain/` | Allow, status, clash and checkpoint rules |
| `test/` | Behavioral tests and disposable fixtures |
| `supabase/migrations/` | Reviewed database changes |
| `public/` | Runtime media and models |
| `scripts/` | Explicit operator utilities; read each before running |
| `docs/` | Architecture, setup guides and operational runbooks |

One Node package and one server process: `node src/server.js`. Business writes pass through `handleUtterance` after an allow. The admin page at `/admin` lists accounts and workspaces and supports quota reset or scoped app-data deletion; see the [admin runbook](docs/runbooks/admin-demo-recovery.md).

## Repository hygiene

Agent-specific tooling, raw research, old visual-review captures, video-generation sources and prototype pages are local development artifacts. They are excluded from new Git changes and deployment uploads. The app's rendered video clips remain in `public/clips/`; the source is preserved in the local archive. Required build and runtime files stay in Git.

Removing a file from the current tree does not remove it from Git history. This cleanup does not rewrite published history or change repository visibility. The source audit records the scope of credential checks and outstanding review work.
