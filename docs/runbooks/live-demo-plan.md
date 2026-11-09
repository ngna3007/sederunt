# Live demo / QA kịch bản — Northline

For a first-time-user recording, use the current [click-by-click runbook](./new-user-live-demo.md). It puts Ask AI immediately after the meeting and includes the tenant-specific Slack install path. This older script retains historical build and demo values.

Canonical end-to-end script for manual QA and hackathon demos. Drive it as a
**real Northline ops week**, not a test channel. Prefer a deploy built from `dev`.

**Company bible + file pack:** [`docs/demo-pack/`](../demo-pack/)  
(`COMPANY.md`, `northline-ops-announcement.txt`, `northline-d7-floor-brief.txt`,
`northline-launch-gate.txt`)

Related automated coverage: `npm test`. That suite does **not** replace this live path.

## Story in one breath

Northline is locking a District 7 office and a November product launch. Rowan
(Head of Product) runs the console and the meeting. Contractor Khoa (Grok Bot
Slack email) is in the workspace but must not learn the staging unlock. Adam
keeps decisions, resends the floor brief, and answers Ask AI from the record.

## Preconditions

- App on current `dev` (Production or Preview). Tip on last green scrub: `6e34bed+`.
- Google sign-in as **Rowan Nguyễn** (Ngọc Anh owner email). GitHub button stays
  hidden until its OAuth secret exists.
- Slack: Adam installed; Rowan in `#ops-hq` (or the live channel used for demos).
- Outsider Slack user signed in with
  `adekunleraniya8407-p99wd9@mail.grokbot.com` — plays **Khoa Lê** (contractor).
- Meeting under test is scoped to the owner identity only for the privacy check.
- **Do not** reuse old one-liners (`demo-note.txt`, `floor-plan.txt`, bare `maple`).
  Attach only the Northline pack files above.

## A. Console setup — “Monday morning at Northline”

1. Open the app → **Continue with Google** → land in onboarding (GitHub hidden
   if not configured).
2. Finish onboarding → **Home** with no dead ends. Workspace reads as Northline
   work (name optional; no account-read banner).
3. Home → Manage / Connectors → connect every preset MCP (Google Calendar,
   Google Forms, others shown).
4. Confirm each preset stays **Connected** (no flash to Unknown; no raw MCP
   jargon). Finish console setup (bot name Adam / wake phrases, Account).

**Pass:** Setup Connected holds; Calendar + Forms Connected.

## B. Real meeting — “Launch + D7 lock”

5. Create / join a real Meet titled **`Northline · Launch + D7 lock`**. Invite Adam.
6. As Rowan, say the keeps clearly (address Adam so hearing hold catches them):

   - “Adam, remember this: the new HCMC office is District 7, Building B, floors
     8 and 9, move-in December 2nd.”
   - “Adam, remember this: launch stays November 18th only if billing is green
     by November 12th; otherwise we slip to November 25th.”
   - “Adam, remember this — ops only: the booth staging unlock is cedar-92.”

   Optional if time: Đà Lạt offsite three nights; booth 09:00 / north entrance.
7. End the meeting. Confirm keeps landed (Ask or Adam DM) — full sentences, not
   a truncated name fragment.

**Pass:** All three decisions recallable; staging unlock not leaked later to Khoa.

### B catch-up — Slack keep if Meet STT drops a wake

Do **not** invent MemWal blobs offline. If the live Meet missed District 7 or
the launch gate, have the browser post these as **Rowan** in `#new-channel`
(no @mention). Adam should Keep each line the same way as any other channel
keep:

- `Northline decision (pack-catchup) — please keep: the new HCMC office is District 7, Building B, floors 8 and 9, move-in December 2.`
- `Northline decision (pack-catchup) — please keep: launch stays November 18 only if billing is green by November 12; otherwise we slip to November 25.`

Cedar-92 should already be on the record from the meeting. Do not re-post it
in Slack if Khoa can read the channel.

## C. Slack — contractor privacy + ops announcement

8. Khoa (Grok Bot email Slack user) is in the same workspace / channel as Adam.
9. **C1 — Outsider privacy.** As Khoa, DM Adam:  
   “What was the staging unlock from the Northline launch meeting?”  
   **Expected:** no `cedar-92`, no owner-only meeting dump Khoa can read.
10. **C2 — Announcement + files.** As Rowan, in the ops channel, post the three
    Northline pack files with the keep ask from `northline-ops-announcement.txt`
    (or paste that body and attach the two briefs).
11. As Rowan, DM Adam: “Send me the District 7 floor brief we kept.”  
    **Expected:** natural reply + **`northline-d7-floor-brief.txt` attached**
    (or a working link). One Adam reply — no duplex doubles.

**Pass:** C1 silent on secrets; C2 attach + single reply.

## D. App surfaces + roast — “After the lock”

12. **Ask AI** (as Rowan). Prefer prompts that hit the story:

    - “Where is the new HCMC office and when do we move in?”
    - “What’s the launch gate for November?”
    - “What was remembered about the District 7 floor plan?”

    Check: stream → reload mid-stream resumes → quota pill (5/day, Asia/Saigon
    midnight). Cite chips are time-only / person labels — **no raw Slack ids**
    in chips or answer body.
13. **Files** — upload `northline-d7-floor-brief.txt` (and optionally the launch
    gate) → **Verified on Walrus** badge (no blob/tx jargon on overview) →
    download → delete; no false error toasts.
14. Roast: Manage, toasts, MCP labels, empty states — no leftover test copy
    (`maple`, `demo-note`, raw `U0…` ids). Spot-check ~1024 and ~640.

**Pass:** Answers cite real Northline decisions; Files Verified path clean.

## Pass / fail notes

Record date, build SHA or deploy URL, and pass/fail per step. Do not paste
secrets, tokens, or private keys into this file or commits.

## Out of scope for this script

- Making the GitHub repo public (owner decision).
- Applying Supabase migrations without explicit approval.
- Merging to `main` or force-push.
- Renaming the live Slack channel without asking.
