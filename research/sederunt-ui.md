# Sederunt screen

UI direction for the typed path in `src/page.js`. The domain stays as it is. A person types a note, a question, or a ticket. A Linear read creates nothing. A write stays `recorded` until a yes that covers that write only. Team ROW then returns one issue id, and the item becomes `filed`. The page keeps the note text, the allow state, and that id. It never shows a Sui account id or a key.

Sources opened for this note: Linear docs, Apple Human Interface Guidelines, and the GOV.UK Design System. No other product was surveyed.

## 1. One composition

One column, one record. Not a marketing page, not a board, not a chart, not a thread.

From top to bottom:

1. The title `Sederunt`, as the only `h1`, in sentence case.
2. One sentence that states the rule: a ticket is filed only after yes, and only when Linear returns an id. Use it once. Do not add a second introductory block.
3. The allow state, in the same column, as ordinary text. See section 2.
4. When a write is pending, that proposed write, directly under the allow line, with the yes control inside it.
5. The record. Each item is one block, in the order it was recorded, so the page reads downward as minutes rather than as a reverse-chronological feed.
6. The entry field, in normal document flow after the record. Label it `Note, question, or ticket`. Do not pin it to the viewport edge.

Each item shows the text that was recorded, then a key-and-value list with no actions:

- `Status`, then one of the existing words: `recorded`, `filed`, `updated`, `current`, `clashing`, `replaced`.
- `Linear`, then the issue id, and only when one was returned. A note or a read has no such row. Do not print an empty id, a placeholder, or a link that asks the person to type one.

A read such as “What tickets are open for the trip?” is an item in that same list. Its text is the answer. Its status is `recorded`. It has no Linear row, because the read created nothing.

The page-level allow line is what makes the allow state visible even when the list is empty. Empty copy is the label on the field plus `No notes yet.` Say what to type. Do not fill the blank with feature cards.

This follows the reading column, not a dashboard. GOV.UK says to design a single column first, keep the main matter in a two-thirds column, and keep a line to no more than 75 characters. The maximum page width they document is 1020px. Do not stretch this record to that width, and do not add a one-third rail. Longer answers can use a wider column, but these notes are short, so two-thirds is the fit. Check-answers uses that same two-thirds column so the action stays near the text. Apple says to put the important matter at the top, in reading order, and to group related lines with space or a separator rather than with extra containers. On a Mac window, do not leave the only critical control at the bottom edge, because that edge is often off the screen. The allow line and any pending write stay at the top for that reason. The entry field follows the record in the flow. It is not a bar fixed to the window.

Linear’s own issue is the model for a row, not for the chrome around it. An issue belongs to one team, has a title, has a status, and gets one id in creation order. List and board views show or hide `ID` and `status` as properties on the issue. That is the row: text, a status name, an id. It is not a card grid.

## 2. The allow moment

A missing allow is the ordinary state of a write that has not been filed. It is not a failure.

When `session.pending` is set, the block under the allow line shows:

- the exact proposed title, in the same type as any other note
- the status `recorded`
- no Linear id
- one sentence in the same column: yes files this write only
- one filled button on that block

The button submits yes for the proposal on screen and for no other write. Its label is a verb for that write, such as `File venue ticket`, not `Send`, `OK`, or `Yes`. The text field can still receive the word yes. That word and the button are the same allow, for the proposal id that is visible. A later write needs its own yes. When nothing is pending, the line stays `Allow is off.` and there is no file button.

Do not put this in a toast, a banner, a warning icon, a red field, or a modal.

GOV.UK says an error message is for a validation error, and to not use one to say someone lacks permission. The error pattern prefixes the message with a hidden “Error:”, puts it in red, and draws a red border on the field. None of that applies. A missing allow is also not a notification banner. That component is for something not directly related to the page, people miss banners, and it must not be used for a validation error. A success banner is removed when the person moves on, so it cannot be the place the id lives. Inset text is for a quote or an aside, and it is easy to miss, so it is the wrong place for the allow. Warning text is for a legal consequence and starts with a hidden “Warning”. Waiting for yes is not that.

Apple says an alert is for critical information, and to avoid an alert that only informs. Alerts interrupt. A waiting write should stay in the page. On a button, start the label with a verb. For an informational alert, they use `OK` and avoid `Yes` and `No`. They also say not to use `OK` as the default title unless the alert is only informational, because the meaning of `OK` is unclear. Prefer a verb that names the write. Use one prominent button for the action a person is most likely to take. A view should have only one or two prominent buttons. A second button, the one on the entry field, stays the same size but is not filled, so the pending write is the preferred action and `Record` is not a second way to file it. Give the filled button a hit area of at least 44 by 44 points.

The check-answers pattern is the shape of the block, not a second page. The thing about to be sent is visible first. The transaction is not finished until the person confirms. The button names the action. There is no “Change” link in this slice, because there is no earlier answer to edit.

After Linear returns an id, do not navigate to a confirmation page and do not swap the record for a green panel. A GOV.UK confirmation page is the end of a transaction. It includes a reference number when there is one, and people bookmark that page as a receipt, so the reference has to still be there later. Here the transaction is one line in a record that continues. Update the same item in place: status `filed`, and the id in that item. The allow line returns to `Allow is off.` The green confirmation panel, and any link or button inside it, is the wrong container. Their own note says controls inside that panel fail contrast unless restyled.

The reference in their confirmation example is the number in strong text, under a label. Do that for the id inside the item. Do not do it in a panel that replaces the list.

## 3. Status and the Linear id, in type

Set both as text in the key-and-value list. Do not turn them into coloured pills.

The status value is the word the code already uses, in that lowercase form, at body size, regular weight. The id value is the identifier Linear returned, such as `ROW-44`, also at body size, in strong text, with tabular figures so the digits do not shift. Prefix the row key with `Linear` if the id alone would be ambiguous. Do not prefix a fake hash, a URL, or a second identifier.

GOV.UK’s summary list is for key facts: a key such as “Name” and a value such as the fact itself. It can show metadata such as “Last updated” and a date. Rows without actions can drop the action column. Borders are there to tie a row together. Use a 1px rule in the border colour between items, not a heavy frame and not a card shadow. Do not add row actions.

Their tag component does show a status, and it is the thing not to copy. Tags are for when one object has several statuses and a short label helps. They must be adjectives, not verbs, and they must not be links or buttons. Colour cannot be the only signal. More colours are harder to remember. Uppercase tags were harder to read and were dropped. White text on a strong fill was mistaken for a button, so they lightened the fill. Six status words in six colours would be that component, used as decoration. The word is already the status. Repeat it as text.

Linear treats status the same way: a required name on the issue, not a decoration. A team workflow is an ordered list of names. The default they document is Backlog, Todo, In Progress, Done, Canceled. Colour is an editable setting on a status. Display options then show or hide the status, and the id, as properties on the row. Sederunt does not use those workflow names, and it should not borrow their colours. `recorded` is not “Todo” in a pill. The id is the issue’s own identifier. Their docs describe it as one id per issue, in creation order, and their move-team example of an inline reference is `#ENG-123`. Show our id as the same kind of short team-and-number string. On this page it stays visible whenever it exists. Do not hide it behind a display menu.

## 4. Type, colour, spacing

One sans family. No second display face, no small-caps, no tracking as a substitute for a heading.

This service is not on `service.gov.uk`, so it does not use the GDS Transport font. GOV.UK tells a service in that position to use an alternative, and names this stack: `"Helvetica Neue", Helvetica, Arial, sans-serif`. Use it for the title, the notes, the status words, and the id. If a real brand face exists later, their note says to use that face instead. Do not use Inter.

Apple’s rule on the same point: use as few typefaces as possible, and avoid light weights. Hierarchy comes from size and weight. Do not rely on colour alone to carry a state. That matches the tag rule above.

Sizes, from the GOV.UK type scale. Line height is a multiple of 5px. The scale changes at the tablet breakpoint, which is the same 640px width as the spacing scale. Point 19 does not change with width.

- Body, including note text, the allow sentence, status, and the id: 19px, line height 25px. Most of the page is this size. Their paragraphs page sets the default paragraph at 19px.
- The single rule under the title, if it needs to be larger than body: 24px, line height 30px, above 640px, and 21px, line height 25px, below. Use that size once.
- The `h1`: the `heading-l` step, not the extra-large step. Above 640px, 36px with line height 40px. Below 640px, 27px with line height 30px. Sentence case. Do not use the 48px or 80px steps.
- Do not drop the status or the id to 16px. The 16px step is for the occasional small paragraph, and most copy stays at 19px.

The id is the only strong body text. The type-scale API documents a tabular-figures option on the font mixin. Use tabular figures for the id. Nothing else is bold.

Colour is the functional set, used as roles. The colour page says to use the palette, and not to copy a hex into a codebase that can call the Sass function, because the values move. This page does not use that Sass. Use the roles, at the values the page currently prints, and do not retint them.

- Page background: white, `#ffffff`.
- Text: `#484949`.
- Rules and field border: `#cecece`.
- Focus: `#ffdd00` with `#0b0c0c`. Put that pair on the focused control only.
- The one filled button: `#0b0c0c` fill, `#ffffff` label.
- The entry button, while a write is pending: white fill, `#0b0c0c` text and border. When nothing is pending, that button may be the filled one, because it is then the only action.

Leave these unused: error `#ca3535`, success `#0f7a52`, brand `#1d70b8`, link purple `#54319f`. Error and success are for those states. A missing allow is neither, and a filed row does not need a green wash. The id in strong text is the receipt. No gradient, no tinted canvas, no accent on more than one control. Apple says to colour a primary action, and not the background of every control.

Spacing, from the documented scale. Above 640px the larger figures apply. Units 0 to 3 stay the same at every width. The examples they give: unit 6 is 20px on small screens and 30px on large; unit 5 is 15px and 25px; unit 9 is 40px and 60px.

- Page padding: 20px on small screens, 30px above 640px.
- Space inside an item, between the note and the key-value rows: 15px.
- Space between items: 25px above 640px, 15px below.
- Space between the record and the entry field: 60px above 640px, 40px below, so the field is a separate group.
- Field padding: 15px. The textarea uses the body size, not a smaller face.

The field border is the 1px border colour, not a heavy black box. Focus replaces that border with the yellow and black pair. Do not clear the field’s text on an error. Nothing in this slice is a validation error.

## 5. What this slice leaves out

- A chat transcript, bubbles, avatars, an assistant name, streaming, or suggested prompts. The field is the next line of the record. Its button says `Record`, not `Send`.
- A comment box. Linear puts `Leave a comment…` at the bottom of an issue, and an activity section can hold an AI summary of that discussion. That is a different screen. This page does not take comments, reactions, threads, or `@Linear`.
- An activity log, an inbox, or a second history under each item. Linear keeps an activity log of property changes, and property edits in the first three minutes of creation are not written there. This slice has no such log. The item list is the record.
- Linear’s board, triage, priority, estimates, labels, cycles, SLA icons, and the right-hand property sidebar. Status and id are enough.
- A confirmation page, a success banner, a notification banner, warning text, and inset text.
- Coloured status tags, workflow colours, and any pill.
- A green panel, a dashboard, charts, and a one-third sidebar.
- Three feature cards, a gradient, a hero, and a second typeface.
- Change links, a standing-allow settings form, and any control that would file a different write from the one on screen.
- Account ids, keys, blob ids, transaction hashes, and any Sui address. The tests already refuse those strings. Do not add a quiet footer for them.
- The meeting bot, a speaking state, and a waveform. The typed path is the screen.

## Sources

- Linear, [Concepts](https://linear.app/docs/conceptual-model), [Issues](https://linear.app/docs/creating-issues), [Issue properties](https://linear.app/docs/issue-property), [Display options](https://linear.app/docs/display-options), [Notifications](https://linear.app/docs/notifications), [Comments and reactions](https://linear.app/docs/comment-on-issues).
- Apple, [Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Color](https://developer.apple.com/design/human-interface-guidelines/color).
- GOV.UK Design System, [Layout](https://design-system.service.gov.uk/styles/layout/), [Type scale](https://design-system.service.gov.uk/styles/type-scale/), [Typeface](https://design-system.service.gov.uk/styles/typeface/), [Paragraphs](https://design-system.service.gov.uk/styles/paragraphs/), [Headings](https://design-system.service.gov.uk/styles/headings/), [Spacing](https://design-system.service.gov.uk/styles/spacing/), [Colour](https://design-system.service.gov.uk/styles/colour/), [Summary list](https://design-system.service.gov.uk/components/summary-list/), [Tag](https://design-system.service.gov.uk/components/tag/), [Check answers](https://design-system.service.gov.uk/patterns/check-answers/), [Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/), [Error message](https://design-system.service.gov.uk/components/error-message/), [Notification banner](https://design-system.service.gov.uk/components/notification-banner/), [Inset text](https://design-system.service.gov.uk/components/inset-text/), [Warning text](https://design-system.service.gov.uk/components/warning-text/), and [Using GOV.UK Frontend without GOV.UK branding](https://frontend.design-system.service.gov.uk/using-govuk-frontend-without-govuk-branding/).
