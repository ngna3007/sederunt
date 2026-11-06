# Design: Design system

**Status:** active
**Scope:** Console, sign-in, and onboarding (`src/console.css`, `src/console-*.js`). The public landing (`src/landing.js`) and the legacy room page are out of scope.

One stylesheet, one token set, one set of components. Sign-in, the four onboarding steps, and every console page use the same tokens and the same component classes. A raw colour, font size, or weight outside the token block is a bug, and `test/design-tokens.test.js` fails on it.

## Rules

1. **Tokens only.** Raw colours (`#hex`, `rgb()`, `hsl()`) live only inside the `/* @tokens start */ … /* @tokens end */` block at the top of `src/console.css`. Everything else uses `var(--token)`. Markup in `console-*.js` uses tokens too (`tile("O", "var(--brand-outlook)")`). Brand files (`brand-logos.js`, `provider-marks.js`, `sederunt-mark.js`) are the only exception: third-party logos and the Sederunt mark keep their own colours.
2. **Scales only.** `font-size` is a `--text-*` token, `font-weight` is a `--weight-*` token, radii are `--radius-*` tokens, control heights are `--control-*` tokens.
3. **One primary.** Primary actions are blue (`--primary`) everywhere: console, sign-in, onboarding Continue, preset Add. There is no black primary button.
4. **One focus ring.** `:focus-visible` shows `--focus-ring` (3px primary at 35%). Inside a clipped row or a selected state use `--focus-ring-inset`. Never `outline`.
5. **Every `@media` block closes.** The guard test counts braces.
6. **The real logo.** The Sederunt mark comes from `src/sederunt-mark.js` (the same drawing as `public/favicon.svg`). Never redraw it or swap in a letter tile. Flow pages show it at 28px beside the word "Sederunt".

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--background` `--card` `--muted` `--accent` `--border` `--input` `--on-solid` `--scrim` `--skeleton-shine` `--switch-off` | `--card` is white; `--muted` is the hover fill |
| Text | `--foreground` `--muted-foreground` | Both pass AA on `--background`, `--card` and `--muted` |
| Primary | `--primary` `--primary-hover` `--primary-active` `--primary-foreground` `--primary-subtle` `--primary-border` | Actions, links, selection, focus |
| Success | `--success` `--success-subtle` `--success-text` | Connected, OK |
| Warning | `--warning` `--warning-subtle` `--warning-border` `--warning-text` `--warning-strong` | Write tools, partial failures |
| Danger | `--destructive` `--danger-subtle` `--danger-border` `--danger-text` `--danger-strong` | Errors, Delete tools, destructive actions. Use `--danger-text` for red text (AA); `--destructive` is for icons and borders |
| Accent / info | `--accent-subtle` `--accent-text` `--info-subtle` `--info-text` | Add, Read |
| People | `--avatar-0…7`, `--speaker-0…7` | Avatars and transcript speakers |
| Brand tiles | `--brand-tool` `--brand-linear` `--brand-calendar` `--brand-outlook` | Fallback tiles when a full-colour logo is missing |
| Type | `--text-xs` 12, `--text-sm` 13, `--text-base` 14, `--text-lg` 16, `--text-xl` 20, `--text-2xl` 28; `--weight-regular` 400, `--weight-medium` 500, `--weight-semibold` 600; `--leading-tight` 1.25, `--leading-normal` 1.45 | 20 is for sign-in and onboarding titles; 28 for console page titles |
| Space | `--space-1…12` = 4, 8, 12, 16, 20, 24, 32, 48 | 4px grid |
| Controls | `--control-xs` 24, `--control-sm` 28, `--control-h` 32, `--control-lg` 40, `--control-touch` 44 | Console 32; flow pages 40; phones 44 |
| Radius | `--radius-sm` 3, `--radius-md` 4, `--radius` 6, `--radius-lg` 8, `--radius-xl` 10, `--radius-2xl` 12, `--radius-pill`; `--radius-control` = 6, `--radius-card` = 10 | |
| Elevation | `--shadow-xs` `--shadow-card` `--shadow-md` `--shadow-lg` `--ring-surface` | `--shadow-card` for flow cards, `--shadow-md` for menus, `--shadow-lg` for dialogs |
| Focus | `--focus-ring` `--focus-ring-inset` `--focus-ring-danger` | |

## Approved colours

These were signed off and are pinned by tests (`test/p5e-colors.test.js`, `test/design-tokens.test.js`):

- Connector state badges: **Connected** green (`.badge.ok`), **Add** accent blue (`.badge.accent`), **error** red (`.badge.bad`).
- Tool badges: **Read** blue (`.badge.info`), **Write** amber (`.badge.warn`), **Delete** red (`.badge.bad`).

## Components

### Button

`button` (secondary is the default), `button.primary`, `button.ghost`, `button.danger`.

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| Secondary (default) | `--card` | `--foreground` | `--border` | `--muted` |
| Primary | `--primary` | `--primary-foreground` | none | `--primary-hover`, active `--primary-active` |
| Ghost | transparent | `--foreground` | none | `--muted` |
| Danger | `--card` | `--danger-text` | `--danger-border` | `--danger-subtle` |

Height `--control-h` (32) in the console, `--control-sm` (28) for compact row actions, `--control-lg` (40) on sign-in and onboarding, `--control-touch` (44) on phones. Radius `--radius-control`. Weight medium, size `--text-sm`. Disabled is 50% opacity. Onboarding uses `.ob-primary` / `.ob-btn` with the same values as `button.primary` / `button`.

### Badge

`.badge` plus a tone: `.ok`, `.warn`, `.bad`, `.info`, `.accent`. Always filled with the tone's subtle colour and its `-text` colour; never outlined. Pill radius, 22px tall, `--text-xs`, medium weight. Onboarding's `.ob-status.ok` ("Connected") is the same green pill.

### Input

`input`, `textarea`, `select`: `--input` border, `--card` fill, `--radius-control`. 32px in the console, 40px on flow pages, 44px on phones. Focus: `--primary` border plus `--focus-ring`. Invalid: `--destructive` border with `--focus-ring-danger`, and a `.field-error` / `.ob-field-error` line below in `--danger-text`.

### Card

Console cards and panels: `--card` fill, `--border`, `--radius-card`. Flow cards (`.auth-card`, `.ob-card`): the same, plus `--shadow-card`; the title is `--text-xl`, semibold, `--leading-tight`, with the 28px Sederunt lockup above it.

### Dialog

`.dialog` > `.shade` (`--scrim`) + `.panel` (`--card`, `--radius-card`, `--shadow-lg`). The footer holds buttons: secondary on the left of primary; destructive actions use `button.danger`. Dialog buttons are real buttons, not menu items.

### Menu item

Items inside a container (dropdown menus, popovers, action menus, the command palette) are **plain full-width rows**, not buttons.

- Class `.menu-item` (also applied by selector to `.menu button`, `.account-menu button`, `#palette-list button`).
- `width: 100%`, `min-height: var(--control-h)`, `padding: 0 var(--space-2)`, left-aligned, regular weight.
- **No border, no button box, no shadow.** Transparent background at rest.
- Hover and keyboard focus fill the row with `--muted` (the palette's highlighted row too). No outline, no press transform.
- Checked rows (`aria-checked="true"`) use `--primary-subtle` with `--primary` text; a focused checked row adds `--focus-ring-inset`.
- **Danger items** (`.menu-item.danger`, e.g. Sign out) use `--danger-text`, and `--danger-subtle` on hover or focus.
- Separate groups with `.menu-rule`, not borders on the rows.

Applies to: the account menu (Edit profile, Sign out), the workspace switcher, and the command palette (Ctrl+K). Any new menu or popover must use `.menu-item`.

### Alert

`.alert` (danger, the default), `.alert.warn`, `.alert.info`. Subtle fill, matching border, `--radius`, `--text-sm`. Text: `--danger-strong`, `--warning-strong`, `--foreground`. Onboarding's `.ob-alert` and `.ob-note` match `.alert` and `.alert.info`.

### Empty state

Two variants:

- **In a list** (`.empty-state`): no border, centred, 48px top / 16px side padding, `--text-lg` medium title, muted body.
- **Standalone card** (`#home-empty`, `.ob-empty`): `--border`, `--radius-card`, 24–32px padding, same type.

### Focus

`:focus-visible` everywhere uses `--focus-ring`. Tabs: the selected tab keeps its 2px primary underline and adds the ring. Menu rows use the row fill (see Menu item).

## Guards

- `test/design-tokens.test.js`: no raw colours outside the token block or in `console-*.js`; every `var(--x)` is defined; scales and approved colours are fixed; WCAG AA (4.5:1) on every component surface (badges, alerts, buttons, menu rows, field errors); the menu item rule and markup; braces and `@media` blocks close.
- `test/p5e-colors.test.js`: approved badge tones.
- `test/console-pass06.test.js`: the type scale uses tokens only.

## Links

- Upstream: [workspace.md](./workspace.md) (the console shell).
- Audit behind this document: QA notes kept outside the repo.
