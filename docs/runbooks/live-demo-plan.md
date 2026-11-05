# Live demo / QA kịch bản

Canonical end-to-end script for manual QA and hackathon demos. Drive it as a
real user in the browser (not only `npm test`). Prefer a deploy or local server
built from `dev` — Production on `main` may lag.

Related automated coverage: `npm test` (`node --test` under `test/`). That suite
does **not** replace this live path.

## Preconditions

- App running from current `dev` (local or redeployed Production/Preview).
- Google sign-in configured; GitHub sign-in stays hidden until its OAuth secret
  exists.
- Slack app installed for the workspace under test; bot name defaults to Adam
  (wake phrases configurable).
- Grok Bot test Slack account uses the bot mailbox
  `adekunleraniya8407-p99wd9@mail.grokbot.com` (sign-ups only; never commit
  other secrets).
- Meeting under test is scoped to the owner’s real Slack/Google identity (Ngọc Anh email account) only for the privacy check — not the Grok Bot test Slack user.

## A. Console setup

1. Open the app → **Continue with Google** → land in onboarding (GitHub button
   must stay hidden if not configured).
2. Finish onboarding → reach **Home** with no dead ends.
3. From Home → Manage / Connectors → **connect every preset MCP** to the user's
   workspace (Google Calendar, Google Forms, and any other presets shown).
4. Confirm each preset shows connected (clear empty/error copy; no raw MCP
   jargon). Finish console setup (workspace, bot name / wake phrases, Account).

## B. Real meeting

5. Invite the Sederunt bot into a **real** meeting.
6. Tell the bot to **do something** and to **remember something**.
7. **End** the meeting.

## C. Slack — Grok Bot test account + privacy / files

8. Register (or sign in) a Slack user with the Grok Bot email above.
9. Invite that Slack user and the Sederunt bot into the Slack workspace.
10. As the **Grok Bot test account**, ask in Slack about the meeting from B.
    **Expected:** the bot must **not** answer with meeting content (meeting is
    only for the Ngọc Anh email account / owner; the Grok Bot test Slack user is an outsider).
11. As the allowed owner (Ngọc Anh email account), post an **important announcement with
    files** in Slack.
12. **DM the bot** asking for that announcement / file.
    **Expected:** bot can summarize and, if supported, **resend the file** (or
    a working link). Record whether file resend works.

## D. App surfaces + roast

13. **Ask AI** — send a prompt → stream → reload mid-stream (resume) → confirm
    quota UI (pill; limit dialog only when actually capped; hackathon demo
    default 5 prompts/user/day, Asia/Saigon midnight).
14. **Files** — list → upload a small file → see **Verified on Walrus** (no
    blob/tx/checkpoint jargon on the overview) → download → delete; no false
    error toasts.
15. Roast pass: Manage, error toasts, MCP labels, empty states — no leftover
    jargon or blank crashes. Spot-check layout ~1024 and ~640.

## Pass / fail notes

Record date, build SHA or deploy URL, and pass/fail per step in the demo notes
or PR. Do not paste secrets, tokens, or private keys into this file or commits.

## Out of scope for this script

- Making the GitHub repo public (owner decision).
- Applying Supabase migrations without explicit approval.
- Merging to `main` or force-push.
