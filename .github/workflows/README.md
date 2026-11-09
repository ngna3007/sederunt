# Workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| Validate | Syntax, application and browser tests, disposable PostgreSQL/Redis/PostgREST checks, dependency and Git-history secret scans | Push, pull request, weekly schedule |

`Validate / gate` is the stable candidate required check. A repository administrator must verify the actual GitHub check name and configure branch protection; this file does not change the repository's ruleset. The security job always runs, even for documentation-only changes. The test job runs when application, test, migration, workflow or validation files change. Deployment is separate.

Run the same checks locally from the repository root:

```sh
npm ci
npx playwright install chromium
node scripts/validate.mjs syntax
node scripts/validate.mjs test
node scripts/validate.mjs integration --confirm
node scripts/validate.mjs secrets
node scripts/validate.mjs audit
```

The integration command creates dedicated temporary Docker containers and removes only those it created. It requires Docker and network access for PostgreSQL, Redis and PostgREST images. The secrets command requires Docker and a complete Git history and runs the pinned Gitleaks image; it fails if the scanner cannot run and redacts findings. One exact historical fingerprint is allowed in `.gitleaksignore`: a synthetic value in the test named “omit secrets”; its reviewed exception expires on 2027-02-09 and the host command fails once expired. Other credentials are not excluded. The audit requires the npm advisory service. A skipped integration, unavailable scanner or unavailable advisory service is not a release pass. If a real credential is identified, rotate it before any coordinated history cleanup; do not rewrite history automatically.

These checks do not create a Slack or Google sandbox and do not replace the documented real-provider demo. Verify production migrations and a reviewed preview before deployment.
