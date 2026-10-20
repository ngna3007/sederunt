# 2026-10-21 — ai-devkit adoption

Point-in-time record of applying the vendored kit at `.agents/skills.lock` upstream `1cef4869`. Not revised to stay current.

## Applied

- Canonical skills stay in `.agents/skills/`. `.grok/skills/` adapters were already the short-form Grok Build template. `.claude/skills/` adapters were generated the same way for Claude Code.
- `AGENTS.md` remains a symlink to `CLAUDE.md`.
- `docs/` was seeded from `cmk:docs`. Six common rules were seeded from `cmk:agent-instructions`.
- Node is pinned in `.nvmrc` at the version this machine runs. npm remains the only package manager. `npm test` remains the only test command.

## Skipped, and why

- Role-first move of `src/` into `ui/` or `backend/`: this product is one Node process. The layout map records the directories that exist.
- `infra/`: nothing in the repo is infrastructure-as-code.
- Deploy CI: nothing here is deployed. No environment to map a workflow onto.
- Checked-in `.mcp.json`: MCP servers for this session are user-level. A repo file would risk writing a secret.
- Cursor and OpenCode adapters: this checkout has no Cursor rules and no OpenCode skill path.
- `docs/guides/on-ramps.md`: the vendored kit contains no source file for it, so `CLAUDE.md` does not point at one.
- Moving `research/` into `docs/research/`: that is a rename of existing notes. The notes stay where they are. `docs/research/README.md` points at them.
