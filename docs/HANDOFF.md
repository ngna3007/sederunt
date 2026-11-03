# Console redesign handoff

Branch `cursor/console-redesign-5f81`. Checkpoint commit is the parent of this doc. Work stopped mid-pass because the owner is switching accounts. Do not treat the tree as reviewed or visually signed off.

Last owner-checked commit before this pass: `31480f0`.

## Tests

Not green as a claim. Before the last decision-column override, `npm test` failed one case: `test/console-columns.test.js` reported the decision sentence at `228px` (the wide room track was beating the stack). That rule was then limited to `min-width: 1101px`, and `node --test test/console-columns.test.js` passed alone (`1920`, `1097`, `768`, `640`). The full suite was not run again after that edit. Unit tests that did pass in the partial run include the new Slack-name, failure-sentence, partial-undo, and non-blocking `/api/console` cases. Screenshot remeasure and before/after shots were not taken.

## Run 19 (items 1–10)

1. **Done, unit-tested.** A Slack row stored as a channel name is retryable until lookup misses. `canReplay` in `src/activity-replay.js` allows a name unless `channelMissing`. `hydrateSlackChannels` in `src/typed-path.js` runs from `consolePayload` in `src/server.js` and stores the id, or sets `channelMissing` when `slackChannelFor` returns nothing. A name does not fall through to `SLACK_DEFAULT_CHANNEL`. `resolveChannelName` in `src/slack/post.js` returns `""` when a token is present and `conversations.list` misses; no token still returns the default id. Tests: `test/activity-replay.test.js`, `test/slack-post.test.js`.

2. **Done, unit-tested.** `withChanges` in `src/activity.js` inserts extra clauses before the failure colon. `failedUndoSentence` renders `couldn't undo the change to <title>…: <error>`. Test in `test/activity.test.js`.

3. **Done, unit-tested.** `undoRecorded` in `src/typed-path.js` logs a failure with `undoOf`, and on `error.partial` keeps only changes whose indexes are not in `error.appliedIndexes` (`runReplay` in `src/activity-replay.js`) and sets `undo.available` false. Retry uses `fieldUndoPlan` and, on success, `logUndo` rather than a forward `logAction`. Test: “a partial undo retries only the steps that did not apply”.

4. **Partly done.** `#people-table .people-row` stays `60px`; `#people-table .people-head` is auto (`src/console.css`). Chips use `max-width: 100%` and `fitChips` in `src/console-page.js`. Not remeasured at `1024` after the later card-layout rules.

5. **Partly done.** At `max-width: 700px`, room rows hide platform and View and use three tracks with a status column of at least `11.5rem` (`src/console.css`). Not remeasured in the browser after the round-14 overrides.

6. **Done in the column test, not shot.** Decisions stack at `max-width: 1100px` (`src/console.css`). `test/console-columns.test.js` now walks `1920`, `1097`, `768`, `640` and expects the sentence `>= 300` at `<= 1100`. At `min-width: 1101px` the room track is `minmax(220px, 32%)` with nowrap. No screenshot.

7. **Partly done.** `body.room-open #file-dialog.room-screen` gets `16px` horizontal padding and the header padding is `10px 0`, with panel left/right padding cleared (`src/console.css`). Title size was also changed for round 14. Edges were not measured, so `x` alignment is unverified.

8. **Partly done.** `.composer-hint` is `display: none` inside `@media (max-width: 1100px)` in `src/console.css`. The ask was `900px`. Not checked at `640`.

9. **Done in CSS, not checked.** The desktop rule that hid `#crumb-current` was removed. Above `901px`, `#crumb-current` stays hidden only for `body.room-open` (`src/console.css`). `showSection` in `src/console-page.js` still sets the current label.

10. **Done, unit-tested.** `consolePayload` in `src/server.js` no longer awaits `attachRecordingStarts`; it fires `void attachRecordingStarts` after the payload object is built. Rooms that already have `startedAt` are skipped. `openMeetingRoom` in `src/typed-path.js` stores `startedAt` from the join payload, and `copyOpenedRoom` / `absorbOpenedRoom` keep it. Test: “the room list does not wait for Recall” in `test/console-media.test.js`.

## Round 14 visual list

No Playwright remeasure and no before/after images were added to the PR.

### A. Breakages

1. **Partly done.** `View >` text in `src/console-page.js` (`addRoomCard` and the other row builders) is a chevron svg with `aria-label="View"`. CSS hides `[data-col="action"]` / `.row-view` at `max-width: 1100px`. Not measured at `1097`.

2. **Partly done.** `paintActivity` in `src/console-page.js` puts time, room suffix, Undo, and Retry in `.activity-meta` and drops the leading `·` on the time. At `max-width: 700px`, `.activity-copy` clamps to two lines and the meta row sits under the sentence. `.activity-feed::before` is one rail; per-group `::before` is hidden. Not checked at `640`, so a broken rail is still possible.

3. **Partly done.** At `max-width: 700px`, people rows are a column flex and the header is hidden (`src/console.css`). The column test asserts the rooms cell is under the name at `<= 700`. No screenshot.

4. **Partly done.** At `max-width: 1100px`, `.shell` is one column and `.rail-wrap` is the off-canvas drawer. The rail toggle in `src/console-page.js` uses `matchMedia("(max-width: 1100px)")` for `nav-open`. Not clicked through at `768` or `1097`.

### B. Control scale

**Partly done.** `:root` defines `--control-h: 32px`, `--control-sm: 28px`, `--control-xs: 24px`. The base `button` min-height, sign-in primary, underline tabs, chat field, history select, Undo/Retry, and `.tl-restart` reference them (`src/console.css`). Not every control was audited, and sizes were not measured.

### C. Room page

**Partly done.** Inside the existing Recall split (`src/console-page.js`, `src/console.css`):

- Title: `body.room-open #file-title.page-title` is `1.5rem`. Not compared with other H1s.
- Transcript search: `#transcript-search` `padding-left: 36px`. Not checked for overlap.
- Right-hand Raw tab button removed. Left Raw remains. `file-raw-side` is still written by `renderFile`.
- `renderFacts` now pushes no rows and hides `#file-facts`. Started and the decision count are gone; the hairline item has nothing to draw. This is the likely broken state.
- Participants and artifact headings share `13px` / `600`.
- `paintCallout` adds a title and icon. `.callout-bad` places Retry in column 2. Not checked.
- Artifact view/download links are svg `.icon-btn` at `--control-sm`.
- `#file-outcome` min-height cleared. Not checked.
- Settings heading and `.room-set .set-copy strong` share `13px` / `600`.
- History tab calls `paintActivity` for that room with `showRoom: false`.
- Decisions tab adds `statusLabel` as a badge, including Clashing.
- `#files-empty` is an `.empty-state`. `renderFiles` toggles it.
- Activity tab (`renderWaiting`) still does not strip a room phrase from the sentence itself. Only the suffix is omitted when `showRoom` is false.
- The `at m:ss` control is a separate text node with one space. The double-space bug was not rechecked.

### D. Chat

**Partly done.** `src/console-page.js`: the empty state keeps one line (“Nothing has been asked yet.”). A clash renders only the warn callout titled “These decisions clash”, then cites. Cite text uses `relativeWhen` when `spokenAt` is present (`rankDecisions` in `src/room-match.js` now returns `spokenAt`). `#chat` gets bottom padding at `<= 1100px`. Composer-versus-chips at `640` was not opened.

### E. Other pages

**Partly done.**

- Account: `#top-name` is `display: none`. Details Role row removed. Card role remains (`#account-page-role`). Avatar uses solid `--primary`. Lede describes the page. Not checked.
- Status: `.conn-state` is a pill. Slack’s extra note is `class="sr"`. Rows were not compared.
- Decisions at `1920`: wider nowrap room track, as in item 6. Row heights were not measured.
- History: time sits in `.activity-meta` with a min-width; the leading `·` on the clock is gone. A `.chip-rule` separates Company/You from the kind chips. Not measured at `1920`.
- People: chip `max-width: 12rem` removed. People footer is always hidden in `paintPeople`, so the pager is gone even when a count would help. Not checked for leftover padding.
- Loading: `showHomeSkeleton` toggles `body.is-reading`, which skeletons the sidebar account. `#loading` is a 4-tile plus row grid. `#onboard-reading` is hidden so one `13px` “Reading the account.” remains. `#read-error.still-loading` is absolutely positioned. Not compared at `640` and `1920`.
- Shell: `.main` / `#home` max-width is `80rem`. Home `paintRooms` shows five rooms and `#home-all-rooms` when there are more. Sidebar brand includes the blue `S` tile. Room titles no longer get `.mono` in `addRoomCard`. `roomCount` uses `". Filed as "`. `a.room` top border is cleared. None of this was measured. `hiring-sync` is normal font only when it was the mono room id.

## Do not assume

- Browser verification of A–E did not happen.
- `src/landing.js` was not edited.
- `.local/` was not committed.
