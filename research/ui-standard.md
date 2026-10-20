# UI standard

Checked 20 Oct 2026. Sources are the live pages and REA's own guide, not a recap.

## What each source is for

| Source | What it actually is | Take | Leave |
| --- | --- | --- | --- |
| [Walrus Memory](https://walrus.xyz/products/walrus-memory/) | The visual reference. Measured live on 20 Oct 2026. | The black ground, the warm off-white type, the hairline product panel, the pill button, and the real product on the first screen. | The marketing tiles, the floating glass squares, and a second campaign page in front of the app. |
| [Walrus docs](https://docs.wal.app/walrus-memory) | A document. Skip link, one idea per section, concrete verbs: remember, recall, analyze. | Name the action. Explain a term once, where it matters. | The docs chrome, the sidebar, the feedback widget. |
| [Dopamint explorer](https://tps.dopamint.fun/explorer) | A live table. Columns are Digest, Resource, dApp, parties, Checkpoint, Time, Action. Empty cells say "Not yet". A quiet word says Connecting. | A record is named fields in a row. An id and a checkpoint use tabular figures. Empty is an honest word. | The TPS ticker and the firehose. Sederunt is not an explorer. |
| [REA](https://github.com/morluto/rea) and [rea.tools](https://rea.tools/) | A paper-like site. The rule is in [website/style-guide.md](https://github.com/morluto/rea/blob/main/website/style-guide.md). No React, no animation library. | The reading test, the measure, the 44px target, reduced motion, native details, one accent. | Catppuccin dark theme, the sun/moon switch, the blinking prompt cursor, the marketing hero. REA is not a component kit. Do not install it. |

Also opened and not copied: [Suiscan](https://suiscan.xyz/mainnet/home) is an object explorer. Use it as the place a public Sui object link goes. Do not reproduce its dashboard.

`research/sederunt-ui.md` still holds for behavior: allow as ordinary text, the field after the record, status in words, no account id. Its white page and Helvetica are retired. FORMAT is retired. The look is the Walrus Memory product page.

## The standard

A person scanning for five seconds sees the subject and the result. After ten seconds they see the next action. That test is from REA's style guide, section "What a reader should understand".

One screen, one job.

- `/` is the introduction. Each step is one screen: the words on the left, the minutes on the right, rising as they enter the view. `/record` is the minutes. The result is the latest status and, when one exists, the id.
- `/chat` is the same gate. The result is the answer. The button says Record.
- `/clash` shows both decisions. The action is keep this one.
- `/connectors` lists Linear and Calendar and whether the allow is on.
- The Recall voice page says that Sederunt can hear, and that an edit waits for an allow.

The page is black `#000000`. Text is `#faf8f5`. Those two values are the computed body color and background on the Walrus Memory page. Body type there is Google Sans Flex at 16px. The campaign headline is Ratch at 72px and weight 425. Sederunt uses that headline face only for the name. The minutes stay at a reading size, about 19px on 25px, so the record is not a poster.

The record sits in a rounded panel with a 1px hairline, the way their product screenshot sits on the right of the headline. On a wide screen the name, the one rule, and the allow line are on the left, and the panel is on the right. Below 800px the panel stacks under the name. A violet glow, `#2F43CB` into `#9550C2`, may sit behind that panel only. It does not cover the page.

The button is a pill: transparent fill, `#faf8f5` label, 26px radius, monospace, at least 44px tall. Their measured button is Google Sans Code, 16px, padding 12px 32px. The label is a verb: `Record`, or `File venue ticket`. One button is the primary. A second button stays the same shape and is quieter.

One strong thing per item: the connector id. Status stays regular weight.

A row is a key and a value, as on the Dopamint table, with our words: Status, Linear, Calendar. No empty id. No account id. No key. Checkpoint time is a value on the item only when the stamp exists. It is not a live feed.

The long Linear dump sits in a native `<details>`, summary "Open issues read from team ROW". The matching lines and "This read created nothing." stay outside it. REA uses `<details>` so the main path stays short and the evidence remains reachable without JavaScript.

Motion is one change: a newly added item fades in over 150ms. `prefers-reduced-motion: reduce` turns that off. Buttons move no pixels on press. No gradient drift, no parallax, no looping cursor, no skeleton shimmer. REA's guide says decorative gradients and scroll effects do not help.

Every control is at least 44 by 44. Focus draws a `#faf8f5` ring on the black control. The core page is a form post, so it works with JavaScript off. Check 1200, 390, and 320.

Empty copy is the field label plus "No notes yet." A missing allow says "Allow is off." A connector that has not answered says "Not yet." Do not invent a friendlier sentence.

## What this is not

FORMAT, Signal-A, and Belgrade Arbor are Awwwards films. They are not the reference. Sederunt should be recognizable as a product in the same family as [Walrus Memory](https://walrus.xyz/products/walrus-memory/): a black tool, a warm off-white sentence, and the real work inside a panel.

## Awwwards, same family

Checked live on 20 Oct 2026. Awwwards Site of the Day is mostly a film. None of these replace the Walrus Memory page.

| Site | Award | What matches | Leave |
| --- | --- | --- | --- |
| [Sui](https://www.sui.io/) ([entry](https://www.awwwards.com/sites/sui)) | SOTD, 23 Jun 2026. Palette `#000000` and `#298DFF`. | Black ground and a short infrastructure sentence. | The tunnel hero, the filled blue button, the loader. Measured body type is gray, not `#faf8f5`. |
| [Cerebrium](https://cerebrium.ai/) ([entry](https://www.awwwards.com/sites/cerebrium)) | SOTD, 10 Sep 2026. Palette `#172B76` and `#902177`. | The blue-violet family of the Walrus glow, and a one-line infra claim. | The 3D ribbons, the pink filled button, the WebGL globe. |
| [Heron AI](https://heronaiapp.com/) ([entry](https://www.awwwards.com/sites/heron-ai)) | SOTD, 12 Oct 2026. Palette `#F15534` and `#282828`. | The job: it proposes, and it edits only after approval. | The paper ground, the house drawing, the orange. |
| [Endex](https://endex.ai/) ([entry](https://www.awwwards.com/sites/endex)) | Honorable Mention, 24 Mar 2025. Awarded palette `#050E15` and `#19D0F4`. | The real work sits in a rounded panel. | The live page is cream `#f9f8f5` with black filled buttons. That is the Walrus palette turned over. |

Also opened and not the reference: [Coder](https://coder.com/) was awarded near-black and is now a pastel gradient. [VoidZero](https://voidzero.dev/) was awarded purple on `#140033` and is now white. [SeedRouter](https://seedrouter.ai/) is a white nominee. The [Walrus](https://www.awwwards.com/sites/walrus) Site of the Day, 18 Sep 2025, is the mint brand site (`#A0EFE5`), not the memory page.

## What REA saw in the code

Checked 20 Oct 2026 with `rea` 6.7.0 against the pages already open in Chrome. `analyze-web-bundle` parses JavaScript. `inspect-web-page` lists same-origin resources. It does not return computed style. Cerebrium's bundle parse ran out of memory on a 1.2MB canvas script, so that site is resource names only.

Walrus Memory analyzed 28 scripts, all parsed. The page is Astro. Named chunks include `ScrollTrigger`, `splitting`, `CodeTerminal`, `FAQAccordion`, `ClientRouter`, and `MobileMenu`. The hero is a headline plus an absolutely positioned product picture. The working example under it is `code-terminal`: tabs at 52px, an 8px radius shell on `#14181b`, and code in Google Sans Code at 15px. Two stylesheets: `_astro/sitemap_xml.EKb7hhHu.css` and `_astro/about.Bnqs5oj1.css`.

Tokens in that CSS:

- `--color-walrus-midnight: #000` and `--color-walrus-tusk: #faf8f5`
- `--font-heading: "Ratch"` and `--font-sans: "Google Sans Flex Variable"`
- `--font-code: "Google Sans Code Variable"` and `--font-mono: "JetBrains Mono"`
- Display L is 4.5rem, line-height 0.95, title weight 425, letter-spacing -0.5px
- The outline button is transparent, tusk text, 26px radius, code face, 16px, padding 12px 32px, tracking 0.04em. On the dark theme the border is `#53575a`, the hover border is tusk, and focus is a 2px tusk ring. Active changes color, not position.
- Their default transition duration is 0.15s. ScrollTrigger, splitting, and `data-animate` are the campaign motion. Sederunt does not take those.
- The violet stops `#2F43CB` and `#9550C2` are in the hero SVG, not in the CSS custom properties.

Ratch is a file on their origin. Sederunt does not ship it. The name uses Google Sans Flex, which is the face they use for text and which Google Fonts serves as a variable font in the 400–500 range, so weight 425 still resolves. Buttons use Google Sans Code.

Sui kept almost no same-origin resources. REA excluded the CDN as another origin, and the one origin script was the Cloudflare challenge. Nothing there changes the black page.

Cerebrium is also Astro. REA listed `BackgroundCanvas` at 1,210,731 bytes, plus GSAP `Scroll`, `CSSPlugin`, `ScrambleTextPlugin`, and `lottie_light`. That is the sculpture. Leave it.

Heron is one Webflow stylesheet of 244,234 bytes and `webflow.js`. Leave the paper, the drawing, and the orange.

Endex is Next.js. One origin stylesheet, font family Inter, and radii that include 8px and 21px. Take the rounded panel of real work. Leave the cream page.
