export function landingStyle() {
  return `    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html { overflow-x: clip; background: #081428; }
    body {
      margin: 0;
      background: #081428;
      color: #ffffff;
      overflow-x: clip;
      font-family: Inter, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }
    a { color: #172b76; }
    p { margin: 0; text-wrap: pretty; }
    ul { margin: 0; padding: 0; list-style: none; }
    .nav {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 54px;
    }
    .nav a { text-decoration: none; }
    .nav-name {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #ffffff;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 500;
      font-size: 26px;
      letter-spacing: -0.015em;
      line-height: 1;
    }
    .brand-mark {
      display: block;
      width: 0.92em;
      height: 0.92em;
      flex: none;
    }
    .nav-cluster {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-left: auto;
    }
    .nav-links {
      display: flex;
      align-items: center;
      height: 54px;
      padding: 0 10px;
      border-radius: 7px;
      background: #22273e73;
      -webkit-backdrop-filter: blur(17.5px);
      backdrop-filter: blur(17.5px);
    }
    .nav-links a {
      display: inline-flex;
      align-items: center;
      flex: none;
      height: 100%;
      padding: 0 14px;
      white-space: nowrap;
      color: #ffffff;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: -0.025em;
      line-height: 1.07;
      text-transform: uppercase;
    }
    .nav-menu, .nav-panel, .nav-scrim { display: none; }
    .nav-menu {
      align-items: center;
      gap: 8px;
      margin-left: auto;
      min-height: 42px;
      padding: 0 14px;
      border: 0;
      border-radius: 7px;
      background: #22273e73;
      color: #ffffff;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: -0.025em;
      line-height: 1;
      text-transform: uppercase;
      -webkit-backdrop-filter: blur(17.5px);
      backdrop-filter: blur(17.5px);
      cursor: pointer;
    }
    .nav-menu-icon { display: block; width: 11px; height: 11px; flex: none; }
    .nav-panel {
      position: absolute;
      top: calc(100% + 10px);
      left: 0;
      right: 0;
      z-index: 2;
      flex-direction: column;
      gap: 2px;
      padding: 16px 16px 14px;
      border-radius: 16px;
      background: #ffffff;
    }
    .nav-panel a:not(.nav-wallet) {
      display: block;
      padding: 10px 8px;
      color: #172b76;
      font-family: Outfit, Inter, sans-serif;
      font-size: 24px;
      font-weight: 500;
      letter-spacing: -0.03em;
      line-height: 1.15;
      text-transform: none;
    }
    .nav-panel .nav-wallet { width: 100%; margin-top: 12px; min-height: 48px; }
    .nav-scrim { position: fixed; inset: 0; z-index: 1; background: rgba(8, 20, 40, 0.55); }
    @media (hover: hover) and (prefers-reduced-motion: no-preference) {
      .nav-links a:hover,
      .nav-wallet:hover,
      .nav-menu:hover { animation: glitch-hover 0.3s linear; }
    }
    @keyframes glitch-hover {
      0%, 100% { transform: translate(0); }
      20% { transform: translate(-2px, 2px); }
      40% { transform: translate(-2px, -2px); }
      60% { transform: translate(2px, 2px); }
      80% { transform: translate(2px, -2px); }
    }
    .nav-record {
      background: rgba(8, 20, 40, 0.62);
      color: #ffffff;
      backdrop-filter: blur(10px);
    }
    #field {
      position: fixed;
      inset: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
    }
    .hero {
      position: relative;
      z-index: 1;
      min-height: 100svh;
      display: grid;
      grid-template-rows: auto 1fr;
      padding: 22px 20px 64px;
    }
    .nav, .hero-copy, .hero-side { position: relative; z-index: 1; }
    .hero-copy, .hero-side { min-width: 0; }
    .hero-copy { align-self: end; max-width: 680px; }
    .hero-side { align-self: end; margin-top: 28px; }
    h1, h2, .roster li, .who {
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      letter-spacing: -0.03em;
    }
    h1, h2 { margin: 0; line-height: 0.96; }
    h1 { font-size: clamp(3.1rem, 6vw, 5.25rem); max-width: min(11em, 100%); color: #ffffff; }
    h2 { font-size: clamp(2.4rem, 4.6vw, 3.6rem); max-width: 12em; color: #172b76; }
    .mark {
      background: linear-gradient(90deg, #8ebcff, #d7e8ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .sheet .mark {
      background: none;
      -webkit-background-clip: border-box;
      background-clip: border-box;
      color: #1d4ed8;
    }
    .lede {
      margin: 0;
      color: #f4f7ff;
      font-family: Outfit, Inter, sans-serif;
      font-size: clamp(1.7rem, 2.15vw, 2.2rem);
      font-weight: 300;
      letter-spacing: -0.04em;
      line-height: 1.08;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 20px;
      border: 0;
      border-radius: 7px;
      background: #cfd7e7;
      color: #172b76;
      font-family: Inter, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 16px;
      font-weight: 500;
      line-height: 24px;
      letter-spacing: 0;
      text-decoration: none;
      white-space: nowrap;
    }
    a.btn:hover { filter: brightness(0.97); }
    .nav-wallet {
      flex: none;
      min-height: 54px;
      padding: 0 20px;
      white-space: nowrap;
      border-radius: 7px;
      background: #cfd7e7;
      color: #172b76;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: -0.025em;
      line-height: 1.07;
      text-transform: uppercase;
    }
    a.nav-wallet:hover { color: #172b76; }
    a:focus-visible, .nav-menu:focus-visible { outline: 2px solid #2458F6; outline-offset: 2px; }
    .stage {
      position: relative;
      z-index: 1;
      display: block;
      padding-bottom: 72px;
      color: #ffffff;
    }
    .band-line {
      width: 100%;
      height: 1px;
      background: #ffffff;
      opacity: 0.2;
    }
    .pass {
      position: relative;
      z-index: 1;
      margin-top: clamp(3.5rem, 2.8944rem + 2.4845vw, 6rem);
      margin-bottom: clamp(3.5rem, 2.8944rem + 2.4845vw, 6rem);
      color: #faf8f5;
    }
    .pass-row {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 32px;
      width: 100%;
      margin: 0 auto;
      padding: 0 20px;
    }
    .pass-logo {
      display: inline-flex;
      align-items: center;
      color: #faf8f5;
      line-height: 0;
    }
    .pass-mark {
      display: block;
      height: 84px;
      width: auto;
    }
    .pass-mark-word {
      height: 46px;
    }
    .dots-clip { overflow: hidden; }
    .dots-pad {
      width: 100%;
      max-width: 125rem;
      margin-inline: auto;
      padding-inline: 15px;
    }
    .dots {
      --cols: 20;
      display: grid;
      grid-template-columns: repeat(20, 1fr);
      place-items: center;
      pointer-events: auto;
      margin-left: -1.25rem;
      margin-right: -1.25rem;
    }
    .dots span {
      position: relative;
      aspect-ratio: 1;
      width: 100%;
      border-radius: 7px;
    }
    .dots span::before,
    .dots span::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
    }
    .dots span::before {
      width: calc(0.25rem * 8.5);
      height: calc(0.25rem * 8.5);
      margin-left: calc((calc(0.25rem * 8.5) * -1) / 2);
      margin-top: calc((calc(0.25rem * 8.5) * -1) / 2);
      border-radius: 7px;
      background: #2458F6;
      mix-blend-mode: screen;
      opacity: 0.85;
      transform: scale(0);
      transition-property: transform;
      transition-duration: 0.2s;
      transition-timing-function: cubic-bezier(0.645, 0.045, 0.355, 1);
    }
    .dots span.is-trail::before { transition-duration: 0.4s; }
    .dots span::after {
      width: 2px;
      height: 2px;
      margin-top: -1px;
      margin-left: -1px;
      border-radius: 100%;
      background: #ffffff;
    }
    .dots span.is-active::before,
    .dots span:hover::before { transform: scale(1); }
    .sheet {
      position: relative;
      z-index: 2;
      background: #ffffff;
      color: #172b76;
      overflow-x: clip;
      margin-top: -60px;
      border-radius: 32px 32px 0 0;
    }
    .journey, .faq { width: 100%; padding: 72px 20px 28px; }
    .journey-kicker {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: clamp(40px, 6vw, 96px) 0 0;
      color: #172b76;
      font-family: Inter, sans-serif;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.14em;
      line-height: 1;
      text-transform: uppercase;
    }
    .journey-kicker i {
      display: block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #172b76;
      flex-shrink: 0;
    }
    .journey-split {
      display: grid;
      gap: 28px;
      align-items: start;
    }
    .journey-side {
      margin: 0;
      max-width: 16em;
      color: #172b76;
      font-family: Outfit, Inter, sans-serif;
      font-size: clamp(1.25rem, 1.8vw, 1.7rem);
      font-weight: 500;
      letter-spacing: -0.03em;
      line-height: 1.35;
      text-align: left;
    }
    .journey-head h2 {
      max-width: 8em;
      margin: 0;
      font-size: clamp(2.6rem, 5vw, 4.7rem);
      font-weight: 300;
      letter-spacing: -0.045em;
      line-height: 0.96;
      text-align: left;
      color: #172b76;
    }
    .journey-body { min-width: 0; }
    .rail {
      display: flex;
      gap: 22px;
      overflow-x: auto;
      margin: 48px 0 8px;
      padding-bottom: 8px;
    }
    .rail a {
      position: relative;
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      min-height: 28px;
      padding-left: 18px;
      color: rgba(23, 43, 118, 0.38);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1;
      text-transform: uppercase;
      text-decoration: none;
      white-space: nowrap;
    }
    .rail a .sq {
      position: absolute;
      top: 50%;
      left: 0;
      width: 3px;
      height: 3px;
      background: rgba(23, 43, 118, 0.45);
      transform: translate(-50%, -50%);
      transition: width 0.2s ease, height 0.2s ease, background 0.2s ease;
    }
    .rail a[aria-current="true"] { color: #172b76; }
    .rail a[aria-current="true"] .sq { width: 9px; height: 9px; background: #172b76; }
    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px 0 40px;
      text-align: center;
    }
    .step-kicker {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      margin: 0;
      padding: 0 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, #dcdaf1, #efe7f2);
      color: #17181c;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 15px;
      font-weight: 400;
      letter-spacing: 0;
      line-height: 1;
      text-transform: none;
    }
    .step h3 {
      margin: 22px 0 0;
      max-width: 16em;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      font-size: clamp(2rem, 3vw, 2.5rem);
      letter-spacing: -0.03em;
      line-height: 0.96;
      color: #172b76;
      text-align: center;
    }
    .step p, .bridge, .aside {
      margin-top: 14px;
      max-width: 37.25rem;
      margin-left: auto;
      margin-right: auto;
      color: rgba(23, 43, 118, 0.55);
      font-size: 18px;
      line-height: 1.5;
      font-weight: 400;
      text-align: center;
    }
    .step p.step-kicker {
      max-width: none;
      font-size: 15px;
      line-height: 1;
    }
    .step p strong, .bridge strong, .aside strong { color: #172b76; font-weight: 650; }
    .steps { width: min(100%, 51.125rem); margin-inline: auto; }
    .step-pair {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      width: 100%;
      max-width: 38.25rem;
      margin: 22px auto 0;
    }
    .step-pair p {
      flex: 1 1 0;
      margin: 0;
      max-width: 16rem;
      color: rgba(23, 43, 118, 0.5);
      font-size: 15px;
      line-height: 1.5;
      font-weight: 400;
      text-align: center;
    }
    .step-pair i {
      display: none;
      width: 1px;
      flex: 0 0 1px;
      align-self: stretch;
      background: repeating-linear-gradient(to bottom, rgba(23, 43, 118, 0.35) 0 1px, transparent 1px 5px);
    }
    .rail-pin { display: contents; }
    .faq-item p {
      max-width: none;
      color: rgba(23, 43, 118, 0.72);
      font-size: 15px;
      font-weight: 400;
      line-height: 1.55;
      text-wrap: wrap;
    }
    .files { display: grid; gap: 10px; margin: 22px auto 0; max-width: 360px; width: 100%; }
    .files li {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 14px;
      border-radius: 12px;
      background: #f7f8fc;
      color: #172b76;
      font-weight: 500;
    }
    .file-kind {
      color: rgba(23, 43, 118, 0.5);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
    }
    .roster {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      max-width: 760px;
      margin-top: 28px;
    }
    .roster li {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 14px;
      border-radius: 7px;
      background: #ffffff;
      color: #172b76;
      border: 1px solid rgba(23, 43, 118, 0.12);
      font-weight: 500;
      font-size: 15px;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .roster svg { width: 18px; height: 18px; flex-shrink: 0; color: #111111; }
    .step p.roster-note {
      margin-top: 12px;
      max-width: 38rem;
      color: rgba(23, 43, 118, 0.45);
      font-size: 14px;
      line-height: 1.45;
      font-weight: 400;
    }
    #remember .roster svg {
      width: auto;
      height: 18px;
    }
    .clip {
      position: relative;
      width: 100%;
      max-width: 51.125rem;
      aspect-ratio: 1120 / 480;
      margin: 22px auto 8px;
      overflow: hidden;
      border-radius: 6px;
      background: #eef1fb;
    }
    .clip video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #eef1fb;
    }
    .clip-replay {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: 2;
      display: none;
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
      transform: translate(-50%, -50%);
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: #ffffff;
      cursor: pointer;
    }
    .clip.is-ended .clip-replay { display: flex; }
    .clip-replay:focus-visible { outline: 2px solid #172b76; outline-offset: 2px; }
    .clip-scene { position: absolute; inset: 0; }
    .clip-art {
      position: absolute;
      top: 50%;
      right: 28px;
      width: min(34%, 220px);
      height: auto;
      transform: translateY(-50%);
    }
    .beat {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 12px;
      margin: 0;
      padding: 28px 42% 28px 36px;
      opacity: 0;
    }
    .beat:last-child { opacity: 1; }
    .beat-k {
      color: rgba(250, 249, 245, 0.55);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .beat-line {
      max-width: 16em;
      color: #faf9f5;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      font-size: clamp(1.7rem, 3.2vw, 2.7rem);
      letter-spacing: -0.03em;
      line-height: 0.98;
    }
    .clip-files { display: grid; gap: 10px; max-width: 360px; }
    .clip-files span {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 14px;
      border-radius: 12px;
      background: rgba(250, 249, 245, 0.08);
      color: #faf9f5;
      font-weight: 500;
      font-size: 16px;
      letter-spacing: 0;
      text-transform: none;
    }
    .clip-files i {
      color: rgba(250, 249, 245, 0.5);
      font-style: normal;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
    }
    .claude-terminal {
      max-width: 51.125rem;
      margin: 22px auto 8px;
      background: #141413;
      border: 1px solid #30302e;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(8, 20, 40, 0.18);
      text-align: left;
    }
    .claude-terminal-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      background: #1c1c1b;
      border-bottom: 1px solid #2a2a28;
    }
    .claude-terminal-window-buttons { display: flex; gap: 0.45rem; }
    .claude-terminal-window-buttons i {
      display: block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #87867f;
    }
    .claude-terminal-window-buttons i:nth-child(1) { background: #ff5f57; }
    .claude-terminal-window-buttons i:nth-child(2) { background: #febc2e; }
    .claude-terminal-window-buttons i:nth-child(3) { background: #28c840; }
    .claude-terminal-title {
      color: #d4d2cb;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      font-weight: 500;
    }
    .claude-terminal-header { position: relative; justify-content: center; }
    .claude-terminal-window-buttons { position: absolute; left: 0.85rem; }
    .claude-terminal-title { display: inline-flex; align-items: center; gap: 0.4rem; color: #b9b7b0; }
    .claude-terminal-title svg { display: block; flex: none; }
    .claude-terminal-body {
      padding: 0 0 0.15rem;
      background: #0e0e0d;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .claude-terminal-hello {
      margin: 0.85rem 0.9rem 0.8rem;
      padding: 0.55rem 0.85rem 0.75rem;
      border: 1px solid #d97757;
      border-radius: 8px;
      text-align: left;
    }
    .claude-terminal-hello > b {
      display: block;
      color: #d97757;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0;
      text-align: left;
    }
    .claude-terminal-hello > b small { margin-left: 0.35rem; font-weight: 400; }
    .claude-terminal-hello > b::after {
      content: "";
      display: block;
      width: 100%;
      height: 1px;
      margin: 0.4rem 0 0;
      background: #d97757;
    }
    .claude-terminal-welcome {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.8fr);
      gap: 0.85rem;
      align-items: start;
    }
    .claude-terminal-welcome-main { text-align: center; min-width: 0; }
    .claude-terminal-welcome-main strong {
      display: block;
      margin-top: 0.7rem;
      color: #faf9f5;
      font-size: 15px;
      font-weight: 600;
    }
    .claude-terminal-mark {
      width: 56px;
      height: 36px;
      display: block;
      margin: 0.55rem auto 0.45rem;
      shape-rendering: crispEdges;
    }
    .claude-terminal-meta {
      margin: 0;
      color: #8d8b84;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.45;
    }
    .claude-terminal-tips {
      min-width: 0;
      margin-top: 0.7rem;
      padding-left: 0.8rem;
      border-left: 1px solid #d97757;
      color: #8d8b84;
      font-size: 12px;
      line-height: 1.4;
    }
    .claude-terminal-tips p { margin: 0 0 0.75rem; }
    .claude-terminal-tips b {
      display: block;
      margin-bottom: 0.12rem;
      color: #faf9f5;
      font-size: 12px;
      font-weight: 600;
    }
    .step p.claude-terminal-meta,
    .step .claude-terminal-tips p {
      max-width: none;
      margin-left: 0;
      margin-right: 0;
      color: #8d8b84;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.45;
      text-align: center;
    }
    .step p.claude-terminal-meta { margin-top: 0; }
    .step .claude-terminal-tips p { margin-top: 0; margin-bottom: 0.75rem; }
    .claude-terminal-prompt,
    .claude-terminal-tool,
    .claude-terminal-line,
    .claude-terminal-input,
    .claude-terminal-shortcuts {
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .claude-terminal-tool { display: none; margin: 0; padding: 0.55rem 1.05rem 0; color: #eceae4; }
    .claude-terminal-tool.is-on { display: block; }
    .claude-terminal-tool-row { display: flex; align-items: baseline; gap: 0.45rem; }
    .claude-terminal-tool-mark,
    .claude-terminal-tool-name { color: #faf9f5; }
    .claude-terminal-tool-name { font-weight: 600; }
    .claude-terminal-tool-fn,
    .claude-terminal-tool-status,
    .claude-terminal-tool-out { color: #8d8b84; }
    .claude-terminal-tool-out { display: none; margin: 0.12rem 0 0 1.15rem; }
    .claude-terminal-tool.is-done .claude-terminal-tool-status { display: none; }
    .claude-terminal-tool.is-done .claude-terminal-tool-mark { color: #3ecf8e; }
    .claude-terminal-tool.is-done .claude-terminal-tool-out { display: block; }
    .claude-terminal-prompt {
      display: flex;
      align-items: flex-start;
      gap: 0.45rem;
      margin: 0;
      padding: 0.48rem 1.05rem;
      background: #2a2a2a;
      color: #faf9f5;
      border-top: 1px solid #3f3f3d;
      border-bottom: 1px solid #3f3f3d;
    }
    .claude-terminal-prompt::before { content: "> "; color: #d97757; flex: none; }
    .claude-terminal-ask { position: relative; flex: 1; min-width: 0; }
    .claude-terminal-ask-sizer { display: block; visibility: hidden; pointer-events: none; }
    .claude-terminal-ask.is-fixed .claude-terminal-ask-live { position: absolute; top: 0; right: 0; left: 0; }
    .claude-terminal-ask.is-typing .claude-terminal-ask-live::after,
    .claude-terminal-line.is-streaming .claude-terminal-stream::after {
      content: "";
      display: inline-block;
      width: 0.52em;
      height: 0.95em;
      margin-left: 1px;
      vertical-align: text-bottom;
      background: #eceae4;
      animation: term-caret 0.85s steps(1) infinite;
    }
    .claude-terminal-line {
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      margin: 0;
      padding: 0.72rem 1.05rem 0.35rem;
      color: #eceae4;
    }
    .claude-terminal-bullet { flex: none; color: #faf9f5; }
    .claude-terminal-slot { position: relative; flex: 1; min-width: 0; }
    .claude-terminal-sizer {
      display: block;
      visibility: hidden;
      pointer-events: none;
      user-select: none;
    }
    .claude-terminal-stream { display: block; min-height: 1.45em; }
    .claude-terminal-line.is-fixed .claude-terminal-stream {
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
    }
    .claude-terminal-input {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-top: 0.45rem;
      padding: 0.42rem 1.05rem;
      background: #2a2a2a;
      color: #faf9f5;
      border-top: 1px solid #3f3f3d;
    }
    .claude-terminal-input span { color: #d97757; }
    .claude-terminal-input i {
      display: block;
      width: 0.55em;
      height: 1.05em;
      background: #c8c6be;
      animation: term-caret 1.05s steps(1) infinite;
    }
    .claude-terminal-shortcuts {
      margin: 0;
      padding: 0.45rem 1.05rem 0.55rem;
      color: #8d8b84;
      font-size: 12px;
    }
    @keyframes term-caret {
      0%, 45% { opacity: 1; }
      45.01%, 100% { opacity: 0; }
    }
    @media (min-width: 720px) {
      .clip { aspect-ratio: 1120 / 480; }
      .step-pair { flex-direction: row; align-items: stretch; gap: 0; }
      .step-pair p { max-width: none; padding: 0 28px; }
      .step-pair i { display: block; }
      #act .step-pair { max-width: none; }
      #act .step-pair p { white-space: nowrap; }
    }
    @media (prefers-reduced-motion: no-preference) {
      .beat { opacity: 0; animation: beat-hold 7.8s linear infinite; }
      .beat:nth-child(1) { animation-name: beat-a; }
      .beat:nth-child(2) { animation-name: beat-b; }
      .beat:nth-child(3) { animation-name: beat-c; }
    }
    @keyframes beat-hold { from { opacity: 0; } to { opacity: 0; } }
    @keyframes beat-a {
      0%, 32.5% { opacity: 1; }
      33.4%, 100% { opacity: 0; }
    }
    @keyframes beat-b {
      0%, 32.5% { opacity: 0; }
      33.4%, 65.8% { opacity: 1; }
      66.7%, 100% { opacity: 0; }
    }
    @keyframes beat-c {
      0%, 65.8% { opacity: 0; }
      66.7%, 100% { opacity: 1; }
    }
    .who {
      display: grid;
      gap: 8px;
      margin-top: 28px;
    }
    .who p {
      margin: 0;
      font-size: clamp(3.4rem, 8vw, 6.5rem);
      line-height: 0.92;
      letter-spacing: -0.045em;
      color: #101421;
    }
    .faq { padding-top: 48px; padding-bottom: 185px; }
    .faq h2 { margin: 0 auto 28px; text-align: center; }
    .faq-list { display: grid; gap: 12px; width: 100%; max-width: 51.125rem; margin-inline: auto; }
    .faq-item {
      border-radius: 12px;
      background: #f7f8fc;
    }
    .faq-item summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 24px;
      color: #172b76;
      font-size: 18px;
      font-weight: 500;
      line-height: 1.35;
      cursor: pointer;
      list-style: none;
    }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary::after {
      content: "";
      flex: 0 0 auto;
      width: 12px;
      height: 12px;
      background:
        linear-gradient(#172b76, #172b76) center / 12px 1px no-repeat,
        linear-gradient(#172b76, #172b76) center / 1px 12px no-repeat;
    }
    .faq-item[open] summary::after {
      background: linear-gradient(#172b76, #172b76) center / 12px 1px no-repeat;
    }
    .faq-item p { margin: 0; padding: 0 24px 22px; }
    .site-foot {
      position: relative;
      z-index: 3;
      margin-top: -25px;
      overflow: hidden;
      border-radius: 24px 24px 0 0;
      background: #000000;
      color: #faf8f5;
      padding: 96px 20px 72px;
    }
    .foot-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px 32px;
      max-width: 1120px;
      margin: 0 auto;
    }
    .site-foot h3 {
      margin: 0 0 20px;
      max-width: none;
      color: #9c9a92;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0.08em;
      line-height: 1;
      text-transform: uppercase;
    }
    .site-foot ul { margin: 0; padding: 0; list-style: none; }
    .site-foot a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      color: #faf8f5;
      font-size: 15px;
      line-height: 1.5;
      text-decoration: none;
    }
    .site-foot a:hover { color: #9c9a92; }
    .foot-mark { display: flex; flex-direction: column; align-items: flex-start; gap: 28px; }
    .foot-name {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      color: #faf8f5;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      font-size: 2rem;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .foot-copy {
      margin: 0;
      color: #73726c;
      font-size: 12px;
      letter-spacing: 0.06px;
      line-height: 1.35;
    }
    .hero h1, .hero .lede {
      animation: rise 0.9s cubic-bezier(0, 0, 0.2, 1) both;
    }
    .hero .lede { animation-delay: 0.08s; }
    .reveal {
      animation: settle linear both;
      animation-timeline: view();
      animation-range: cover 0% cover 28%;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes settle {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: none; }
    }
    .hold-cursor {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 70;
      width: 150px;
      height: 150px;
      margin: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
      will-change: transform, opacity;
    }
    .hold-cursor.is-visible { opacity: 1; }
    .hold-cursor.is-hidden { opacity: 0; }
    .hold-cursor-svg {
      display: block;
      width: 150px;
      height: 150px;
      transform: rotate(-90deg) scale(0.72);
      transform-origin: center;
      transition: transform 0.35s cubic-bezier(0.45, 0, 0.55, 1);
    }
    .hold-cursor.is-visible .hold-cursor-svg { transform: rotate(-90deg) scale(1); transition-delay: 0.1s; }
    .hold-cursor.is-hidden .hold-cursor-svg { transform: rotate(-90deg) scale(0.82); }
    .hold-cursor.is-holding .hold-cursor-svg { transform: rotate(-90deg) scale(0.75); }
    .hold-cursor-ring { fill: none; stroke: #ffffff40; stroke-width: 1; stroke-linecap: round; }
    .hold-cursor-progress { fill: none; stroke: #fffffff2; stroke-width: 1; stroke-linecap: round; }
    .hold-cursor-marks {
      position: absolute;
      top: 15%;
      left: 15%;
      width: 70%;
      height: 70%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: transform 0.35s cubic-bezier(0.45, 0, 0.55, 1);
    }
    .hold-cursor-bar {
      width: 4px;
      height: 4px;
      background: #fffffff2;
      border-radius: 4px;
      transition: width 0.35s cubic-bezier(0.45, 0, 0.55, 1), transform 0.35s cubic-bezier(0.45, 0, 0.55, 1), border-radius 0.35s cubic-bezier(0.45, 0, 0.55, 1);
    }
    .hold-cursor.is-holding .hold-cursor-marks { transform: scale(0.85); }
    .hold-cursor.is-holding .hold-cursor-bar { width: 16px; transform: scaleY(0.5); border-radius: 2px; }
    .hold-cursor-text {
      position: absolute;
      top: calc(100% + 10px);
      left: 0;
      width: 100%;
      color: #fffffff2;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      text-align: center;
      transition: opacity 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
    }
    html.is-holding .hold-cursor-text,
    html.is-scene .hold-cursor-text { opacity: 0; }
    html.is-scene .stage,
    html.is-scene .hero,
    html.is-scene .band,
    html.is-scene .pass,
    html.is-scene .dots,
    html.is-scene .sheet,
    html.is-scene .stage *,
    html.is-scene .sheet * { opacity: 0; pointer-events: none; }
    @media (min-width: 1000px) {
      .dots-pad { padding-inline: 1.25rem; }
      .dots { margin-left: -2.5rem; margin-right: -2.5rem; }
    }
    @media (min-width: 1200px) {
      .dots-pad { padding-inline: 2.5rem; }
    }
    @media (max-width: 719px) {
      .clip-art { right: 16px; width: 92px; }
      .beat { padding: 24px 118px 24px 20px; }
      .nav-cluster { display: none; }
      .nav-menu { display: inline-flex; }
      .nav.is-open { z-index: 6; }
      .nav.is-open .nav-scrim { display: block; }
      .nav.is-open .nav-name,
      .nav.is-open .nav-menu { position: relative; z-index: 2; }
      .nav.is-open .nav-panel { display: flex; z-index: 2; }
      .faq { padding-bottom: 121px; }
      .claude-terminal-welcome { grid-template-columns: 1fr; gap: 0.2rem; }
      .claude-terminal-tips { margin-top: 0.75rem; padding: 0.7rem 0 0; border-left: 0; border-top: 1px solid #d97757; }
    }
    @media (min-width: 1180px) {
      .pass-row { flex-direction: row; gap: clamp(96px, 12vw, 220px); }
      .pass-mark { height: clamp(100px, 8.5vw, 132px); }
      .pass-mark-word { height: clamp(46px, 3.5vw, 58px); }
    }
    @media (hover: hover) and (pointer: fine) {
      .hero { cursor: pointer; }
      .nav { cursor: default; }
      a, a *, button, button * { cursor: pointer; }
    }
    @media (hover: none), (pointer: coarse) {
      .hold-cursor { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; }
    }
    @media (min-width: 720px) {
      .hero, .journey, .faq, .site-foot { padding-left: 40px; padding-right: 40px; }
      .faq { padding-bottom: 209px; }
      .site-foot { margin-top: -49px; border-radius: 48px 48px 0 0; }
      .foot-grid { grid-template-columns: 1fr 1fr 2fr; gap: 48px 64px; }
      .foot-mark { align-items: flex-end; justify-self: end; text-align: right; }
    }
    @media (min-width: 960px) {
      .hero {
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 26rem);
        column-gap: 32px;
        padding-bottom: 96px;
      }
      .nav { grid-column: 1 / -1; }
      .hero-copy { grid-column: 1; grid-row: 2; }
      .hero-side { grid-column: 2; grid-row: 2; max-width: none; margin-top: 0; align-self: end; }
      .journey { padding-top: 112px; }
      .journey-split {
        grid-template-columns: 1fr 1fr;
        column-gap: 20px;
      }
      .journey-body { position: relative; }
      .step { min-height: 78vh; display: flex; flex-direction: column; justify-content: center; }
      .foot-grid { grid-template-columns: 1fr 1fr 2fr; gap: 48px 80px; }
      .foot-mark { align-items: flex-end; }
      .foot-copy { text-align: right; }
      .who { grid-template-columns: 1fr 1fr; gap: 0; max-width: 920px; }
      .who p + p { padding-left: 40px; border-left: 1px solid rgba(23, 43, 118, 0.14); }
    }
    @media (min-width: 1280px) {
      .rail {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 168px;
        height: auto;
        margin: 0;
        overflow: visible;
      }
      .rail::before {
        content: "";
        position: absolute;
        top: 18%;
        bottom: 18%;
        left: 16px;
        width: 1px;
        background: repeating-linear-gradient(to bottom, rgba(23, 43, 118, 0.35) 0 1px, transparent 1px 6px);
      }
      .rail-pin {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 46px;
        position: sticky;
        top: 0;
        height: 100svh;
        padding-left: 16px;
      }
    }
`;
}
