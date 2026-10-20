# Rules

Engineering standards: the conventions code in this repository is expected to
follow.

## Conventions

- Shared, language-agnostic standards live in [`common/`](./common/).
- Language and framework standards live in `rules/<language>/` and
  `rules/<framework>/`; add a folder only when it is actively used.
- One topic per file, `kebab-case`, written as actionable rules rather than
  advice.
- A narrower rule overrides a broader one; say so explicitly where it does.

## Topics

| Topic | File |
|---|---|
| Naming | [common/naming.md](./common/naming.md) |
| Doc comments | [common/doc-comments.md](./common/doc-comments.md) |
| Testing | [common/testing.md](./common/testing.md) |
| Git workflow | [common/git-workflow.md](./common/git-workflow.md) |
| CLI surfaces | [common/cli-surfaces.md](./common/cli-surfaces.md) |
| Agent conduct | [common/agent-conduct.md](./common/agent-conduct.md) |

## When to read

Before writing or reviewing code — start with `common/`, then the language or
framework folder that applies.
