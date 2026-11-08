# Sederunt

Company meeting memory for the Total Recall hackathon.
One Node process, `node src/server.js`, records a note, reads Linear, and files a ticket only after an allow.
Status, allow, clash, and the checkpoint stamp live in `src/domain/`.

Optional local skills live in the ignored `.agents/skills/` directory.
Read a skill there before applying it when installed. Local `.grok/skills/` and
`.claude/skills/` adapters are not required to build, test, or run the app.

The public name is Sederunt.

## Layout

- `src/` — the server, the landing, the typed path, and `src/domain/`
- `test/` — `node --test`
- `public/` — models and media the server reads
- `docs/` — documentation tree
- `.agents/skills/` — optional local skills (gitignored)

## Invariants

- Stay one Node package. Do not split the process into another framework.
- A write goes through `handleUtterance`, and only after an allow.
- Do not print keys, and do not commit `.local/`.

## Build & test

- Runtime: Node, pinned in `.nvmrc`. Package manager: npm. Lockfile: `package-lock.json`.
- Tests: `npm test`.
- Start: `npm start`.

## Rules

Detailed standards live in `docs/rules/common/`, one file per topic, loaded only when the matching task comes up:

| Doing this? | Read |
|---|---|
| Naming anything | `docs/rules/common/naming.md` |
| Writing a doc comment | `docs/rules/common/doc-comments.md` |
| Writing tests | `docs/rules/common/testing.md` |
| Committing or opening a PR | `docs/rules/common/git-workflow.md` |
| Adding or changing a CLI command | `docs/rules/common/cli-surfaces.md` |
| Long-running or background work | `docs/rules/common/agent-conduct.md` |

## Documentation

Start at `docs/README.md` for how the rest of the documentation tree is organized and when to read each part of it.

## Scratch

Agent scratch and temporary files go under `.local/tmp/`, never a system temp directory or an ad-hoc `tmp/`.
