# Source and repository audit: 2026-11-08

The release tree now excludes unused development artifacts and includes fixes for authorization, request handling, connector redirects and memory reads. Validation completed on Node 24.15.0. This is a repository-wide inventory and automated scan with focused manual review of sensitive paths; it is not a claim that every line or external integration has been exhaustively verified.

## Baseline and scope

The audit used deployed release `c9c3ee8`, which includes the Slack, calendar and admin changes ahead of `main` (`05e3667`). The cleanup is isolated on `chore/repository-audit`; the original working tree and its unrelated edits are preserved. Production was not changed by this audit.

The baseline contained 856 tracked files, including 138 entries under `src/`, approximately 42,549 JavaScript source lines and 31,145 test lines. Review covered the server and routing, identity, tenant scoping, domain write gate, memory binding, Slack ingestion, file access, connector HTTP transport, deployment packaging and test fixtures. Syntax checks covered all JavaScript under `src/` and `scripts/`.

## GitHub cleanup

505 obsolete or local-only files are removed from the published tree. Copies are preserved in the ignored local archive at `.local/tmp/repository-archive/` in the original workspace.

- Exclude local agent skills/adapters, raw hackathon research, prototype pages, old QA captures, archived handoffs and video-generation source.
- Remove the unshipped prototype route and its obsolete test file.
- Retain application source, tests, migrations, operator scripts, architecture/setup documentation and operational runbooks.
- Retain the four rendered runtime video clips in `public/clips/`, models, product media and seven screenshots used by the demo/admin runbooks.
- Add a root README and security guidance; exclude development artifacts and environment files from Vercel uploads.

The archive is a local convenience, not a distributed backup. Git history still contains files removed by this change. No history rewrite or repository-visibility change was performed.

## Fixed findings

| Area | Defect and resulting behavior |
| --- | --- |
| Write authorization | The invitation check used a helper that added the caller before checking membership. It now checks supplied participants or room members first. An outsider cannot acquire write permission by submitting a request. |
| Slack ingestion | The server appended the sender even when the membership response excluded them, and used the sender alone when membership was unavailable. It now refuses storage/file downloads without confirmed membership. This also prevents outsider questions from becoming visible stored channel notes. Injected membership adapters are honored in tests without a live Slack request. |
| HTTP MCP | The legacy POST endpoints accepted tool calls without the configured console session and trusted a requested workspace/member. Both endpoints now enforce session and origin checks, validate workspace membership, and bind the caller identity. Local unconfigured mode and stdio retain their existing contracts. |
| Signed file downloads | A token could supply a cached user identity without a current session. Downloads now require the issuing user's current session and current workspace access. Anonymous callers, another signed-in person, changed workspace membership and deleted files are covered by regressions. |
| Connector redirects | A redirect could forward authentication to another origin. Cross-origin redirects are now blocked before another request; redirect bodies are canceled rather than buffered. |
| Request handling | Ordinary text/JSON requests and Forms MCP requests had no body-size bound. They now have a 1 MiB byte limit. File uploads retain their separate limit. Malformed JSON/URL encoding gets 400, oversized bodies get 413, and unexpected HTTP failures use a generic response. |
| Cookies | Malformed percent encoding in a session cookie could throw during sign-in checks. It now behaves as a missing cookie. |
| Memory adapters | Tenant wrappers advertised index/recall even when the underlying adapter did not implement them. Capability checks are now preserved. Rebinding also preserves explicitly configured local unscoped access; authenticated tenant isolation remains enforced. |
| Meeting hearing | A process-global hold keyed only by provider room ID could affect another workspace session. Holds now belong to the session and match its room ID. |
| Identity requests | Supabase HTTP calls now have a 15-second timeout. |
| Console history | An embedded regular expression lost its word-boundary escape in the HTML template. The emitted JavaScript now retains it. |
| Test reliability | Paths containing spaces are decoded before filesystem access/spawning. Meeting mocks return the required provider bot ID. Browser assertions target the actual empty-home CTA and disconnected-calendar state; file deletion assertions account for foreground completion. |

## Compatibility changes

HTTP MCP clients must authenticate with the configured console session. Requests cannot choose an unrelated workspace or impersonate another member. This does not introduce an OAuth client-authorization flow for third-party MCP clients.

Signed file links are personal, authenticated links. Opening one in a new tab in the same signed-in browser works; copying it to an anonymous browser or another account no longer grants access.

Slack membership lookup failure now prevents keeping that message and sends a brief explanation. A transient Slack rate limit can therefore require the user to send the message again. This chooses an explicit failure over creating access from an unverified participant list.

## Verification

| Check | Result |
| --- | --- |
| Baseline full suite | 783 tests: 744 passed, 34 failed, 5 skipped |
| Final full suite, `npm test` | 788 tests: 783 passed, 0 failed, 5 skipped, about 63 seconds |
| Additional signed-download membership regression | 6 file-live tests passed after extending the test to change active workspace |
| Syntax, `node --check` | 140 JavaScript files under `src/` and `scripts/`, no syntax failures |
| Dependency audit, `npm audit` | 0 known vulnerabilities at audit time |
| Patch whitespace, `git diff --check` | Passed |
| Current-tree credential patterns | 334 tracked text files scanned; three matches reviewed as explicit test fixtures |
| Published Markdown links | Demo/onboarding screenshots retained; remaining placeholder is the intentional requirements-template topic link |

The obsolete prototype test file contributed five baseline test cases. Seven new request-boundary regressions were added. Existing integration tests were updated to assert the stricter authorization and current UI contracts; real failing behavior was not hidden with skips or retries.

The five skips belong to optional database/Redis integration coverage, including admin reset concurrency and real PostgreSQL/PostgREST Slack persistence. Those services were not provisioned for this run. Live provider calls, production data deletion and a new production deployment were not used as validation.

Credential checks used patterns for private-key headers, GitHub tokens, AWS access keys, Google API keys, Slack tokens and Supabase secret keys. The three matches are named test sentinels in test files. No dedicated secret scanner or full Git-history scan ran; the result does not certify that history is free of credentials. Raw logs and scan metadata stay under ignored `.local/tmp/admin-validation/`.

## Remaining work

| Priority | Finding | Recommended next change |
| --- | --- | --- |
| High | Connector hostname validation resolves DNS before native fetch performs its own resolution. A DNS rebinding/time-of-check gap remains. | Pin validated addresses in the HTTP transport with correct TLS hostname handling, or enforce equivalent outbound network policy. Add an adversarial DNS-change integration test before claiming SSRF closure. |
| High | Real database/Redis reset and Slack persistence tests are opt-in and skipped in this run. | Run them against disposable services and make them required release evidence. Never use production as the fixture. |
| Medium | No GitHub Actions validation workflow is present. | Add repeatable syntax, test, dependency and dedicated history-secret checks, including browser installation and disposable integration services. Configure branch protection after verifying the actual check names. |
| Medium | `src/console-page.js`, `src/server.js` and `src/console.css` are large and contain accumulated UI layers. | Extract cohesive modules within the existing Node package, preserve design tokens, and remove superseded CSS only with browser comparisons across states and widths. A broad rewrite was excluded from this security-fix diff. |
| Medium | Pattern scans cover the current tree only. | Run a dedicated scanner across Git history. If a real credential is found, rotate it before considering history rewriting. Removing a file alone is insufficient. |
| Medium | A console without authentication remains accessible by design for local development. | Keep production auth configured and add a deployment configuration check that rejects fake/open modes for production. |

The fixes are ready for review as code changes. The outstanding items above remain explicit limitations of this audit.
