# Design: Access

**Status:** active
**Owner:** @ngna3007
**Last updated:** 2026-10-21
**Scope:** System-wide

## Mission

Decide whether this caller may hear this decision. The check is the same on every door.

## The check

1. Resolve the caller to a member id. No id returns `missing-member`.
2. Load `inviteMemberIds` from the decision.
3. An id that is absent returns `not-invited` and no sentence.
4. An id that is present returns the sentence.

The check runs before a tool preference is considered. A read does not consult the preference. A write still has to pass the check, then the preference.

The bot stores the invite set when it hears the decision. People who join the channel later are not added. People who leave keep the id that was stored. The bot must have been in the room. A room with `botPresent` false produces no decision.

## Doors

### Meeting

Recall sends the participant id on the transcript event. That id is the member id. The bot's name is Sederunt. It stays quiet until someone addresses it, including the form "Hey @Sederunt". Platforms are Zoom, Google Meet, Teams, and Webex.

The bot joins with camera and microphone through Recall Output Media. The page is a public URL. Audio for the transcript is the meeting audio Recall grants, so the bot does not hear its own speech. A spoken action uses the write preference of the tool. If the call fails, a delivery can still arrive through the MCP door.

Participants present while the bot is in the meeting become `memberIds` on that room, and the snapshot on each decision.

### Channel

A channel is a room. The member id is the platform user id. The bot must have been in the channel to store or answer. The gate is the meeting gate.

### MCP

The first client is a local stdio server. Claude Code talks to it. Cursor and Codex attach to the same server later. They do not get a second implementation.

The process is configured with one member id. `recall` runs the invite check with that id. `act` submits one requested write through the gate. The MCP server does not call Linear or Calendar itself.

Tool results omit keys, tokens, and account ids.

A hosted server for many people uses a short-lived credential minted after the person was seen in a room. The credential binds the member id. The delegate key stays on the server. This is the same check, with the member id taken from the credential instead of the config file.

## Operator setup

The operator signs in on Walrus Memory with the Google or Apple zkLogin that product already provides, creates the company account and the personal account, and registers a delegate key for each. Console sign-in is a separate zkLogin and a separate address. Sederunt does not perform either sign-in.

The landing's wallet link is not a login. It does not connect a wallet.

## Links

- Requirements: [docs/requirements/sederunt.md](../requirements/sederunt.md) — SED-1, SED-3, SED-7
- Decisions: [0003](../decisions/0003-room-membership.md), [0001](../decisions/0001-one-process.md)
- Entities: [docs/design/entities.md](./entities.md)
- System: [docs/design/system.md](./system.md)
