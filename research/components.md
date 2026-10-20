# Marks and parts

Checked against the live minutes page and `research/ui-standard.md`. This is the set to build. It is not a component library.

## Logo

The page already sets the name in Google Sans Flex at weight 425. That wordmark is the logo. It stays the only display type.

A second mark is only for 16px and 32px, where the word does not fit. It is two minute rules and one stop: the line that was written, and the id that closed it. Tusk on black. No violet in the mark. The glow stays behind the panel.

Leave these: a walrus, a sparkle, a monogram, a chair, a seal, and any file of Ratch.

The favicon can be that stop later. The minutes page does not put the mark beside the name.

## Parts

These parts, and no others. Every route reuses them.

| Part | What it is | Rule |
| --- | --- | --- |
| Wordmark | The name | Display face, weight 425. One per screen. |
| Rule | One sentence | Body size. The job of that screen. |
| Allow | "Allow is off." or the standing allow | Ordinary text. Never a switch. |
| Panel | The work | 24px radius, 1px hairline, black fill. Glow behind it only. |
| Minute | One decision | Text, then a fact row. A new one fades in over 150ms. |
| Fact row | Status, Linear, Calendar | Key in `#b1b4b6`, value in tusk, regular weight. No row when the id is empty. |
| Issue line | `ROW-N`, title, state | The id is the only strong text, in Google Sans Code. |
| Pill | Record, File venue ticket, Keep this one | Transparent, 26px radius, code face, at least 44px. One primary. The other is the same shape and quieter. |
| Field | Note, question, or ticket | `#14181b` well, 8px radius, hairline `#53575a`. |

"This read created nothing." is a sentence under the answer, not a part of its own. Empty is the sentence "No notes yet." A connector that has not answered says "Not yet."

The introduction is `/`, a scrolling page. Each section is one screen and shows the minutes in that state. The record itself stays at `/record`.

## Screens, same parts

- `/` minutes. Result is the latest status and the id. Action is Record, or File venue ticket when a write is waiting.
- `/chat` the same panel and the same button. The answer is paragraphs. No bubbles.
- `/clash` two minutes, both still visible. The action on each is Keep this one. Newest does not win.
- `/connectors` two fact rows, Linear and Calendar. The value is the allow, or "Not yet." The agent cannot turn an allow on from this screen, so there is no switch.
- Voice. One rule: Sederunt can hear. An edit waits for an allow. No second controls.

No sidebar, no icon set, no status colors, no toast, no modal, no avatar.

## Build order when implementation starts

The minutes page already has the wordmark, rule, allow, panel, minute, fact row, issue line, both pills, and the field. Next screens compose those. A favicon is the small mark, added when a screen is served, not as a font or a sprite sheet.
