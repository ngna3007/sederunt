/**
 * Introduction. A narrow-camera ribbon bundle behind one promise,
 * then a stepped record of join, act, remember, multi-tenant, and portable.
 * The pointer eases the camera. Holding plays the ribbons forward.
 * Releasing scrubs them back and opens a fisheye. This page does not post.
 */
export function renderLanding() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sederunt</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500&amp;family=Inter:wght@400;500&amp;display=swap">
  <style>
    :root { color-scheme: light; }
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
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.183.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.183.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <canvas id="field" aria-hidden="true"></canvas>
  <div class="hold-cursor" id="hold-cursor" aria-hidden="true">
    <svg class="hold-cursor-svg" viewBox="0 0 150 150">
      <circle class="hold-cursor-ring" cx="75" cy="75" r="71"></circle>
      <circle class="hold-cursor-progress" cx="75" cy="75" r="71"></circle>
    </svg>
    <div class="hold-cursor-marks">
      <div class="hold-cursor-bar"></div>
      <div class="hold-cursor-bar"></div>
    </div>
    <span class="hold-cursor-text">Click and hold</span>
  </div>
  <div class="stage">
  <header class="hero">
    <nav class="nav">
      <a class="nav-name" href="/"><svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.25 16.25h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.15" cy="16.25" r="1.45" fill="#8ebcff"/></svg>Sederunt</a>
      <div class="nav-cluster">
        <div class="nav-links">
          <a href="#join">Use cases</a>
          <a href="https://github.com/ngna3007/sederunt/tree/main/docs" target="_blank" rel="noopener noreferrer">Docs</a>
          <a href="https://github.com/ngna3007/sederunt" target="_blank" rel="noopener noreferrer">Github</a>
        </div>
        <a class="btn nav-wallet" href="#connect">Connect wallet</a>
      </div>
      <button type="button" class="nav-menu" aria-expanded="false" aria-controls="nav-panel">
        <span class="nav-menu-label">Menu</span>
        <svg class="nav-menu-icon" viewBox="0 0 11 11" aria-hidden="true"><rect width="4" height="4" rx="2" fill="currentColor"/><rect width="4" height="4" x="7" rx="2" fill="currentColor"/><rect width="4" height="4" y="7" rx="2" fill="currentColor"/><rect width="4" height="4" x="7" y="7" rx="2" fill="currentColor"/></svg>
      </button>
      <div class="nav-scrim"></div>
      <div class="nav-panel" id="nav-panel">
        <a href="#join">Use cases</a>
        <a href="https://github.com/ngna3007/sederunt/tree/main/docs" target="_blank" rel="noopener noreferrer">Docs</a>
        <a href="https://github.com/ngna3007/sederunt" target="_blank" rel="noopener noreferrer">Github</a>
        <a class="btn nav-wallet" href="#connect">Connect wallet</a>
      </div>
    </nav>
    <div class="hero-copy">
      <h1>Join the room.<br>Remember the <span class="mark">decision.</span></h1>
    </div>
    <div class="hero-side">
      <p class="lede">Said in the room.<br>Asked back tomorrow.</p>
    </div>
  </header>
  <div class="band">
    <div class="band-line"></div>
    <section class="pass" aria-label="Walrus and Tatum">
      <p class="pass-row">
        <span class="pass-logo" role="img" aria-label="Walrus Memory"><svg class="pass-mark" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 117 54" fill="#FAF8F5"> <path d="M28.3903 11.5264C28.7187 10.4962 29.1856 9.61723 29.7844 8.88316C30.3865 8.15232 31.098 7.56958 31.919 7.1446C32.74 6.71639 33.6125 6.50391 34.5301 6.50391C35.8662 6.50391 37.0027 6.90313 37.946 7.70159C38.8861 8.50004 39.6073 9.53674 40.116 10.8052H40.4444V6.66488H45.1418V23.0847H40.4444V18.9443H40.116C39.6138 20.216 38.8894 21.2495 37.946 22.048C37.0059 22.8464 35.8662 23.2457 34.5301 23.2457C33.6093 23.2457 32.7464 23.0332 31.9351 22.605C31.1238 22.1768 30.4155 21.5972 29.8005 20.8664C29.1888 20.1356 28.7155 19.2502 28.3871 18.2231C28.0587 17.1929 27.8945 16.0757 27.8945 14.8748C27.8945 13.6739 28.0587 12.5535 28.3871 11.5264H28.3903ZM33.004 16.5683C33.1907 17.0834 33.4547 17.5309 33.7928 17.9141C34.1341 18.2972 34.5365 18.5998 35.0098 18.8188C35.4798 19.0377 35.9885 19.1472 36.5359 19.1472C37.0832 19.1472 37.6209 19.0377 38.078 18.8188C38.5384 18.5998 38.9312 18.3036 39.2596 17.9334C39.588 17.5599 39.8552 17.1156 40.0645 16.6037C40.2738 16.0886 40.3768 15.5155 40.3768 14.878C40.3768 14.2405 40.2738 13.6707 40.0645 13.1523C39.8552 12.6372 39.588 12.1961 39.2596 11.8226C38.9312 11.4492 38.5384 11.1562 38.078 10.9373C37.6176 10.7183 37.1025 10.6089 36.5359 10.6089C35.9692 10.6089 35.4798 10.7183 35.0098 10.9373C34.5397 11.1562 34.1341 11.4588 33.7928 11.8419C33.4515 12.2251 33.1907 12.6726 33.004 13.1877C32.8173 13.7029 32.7239 14.2663 32.7239 14.8812C32.7239 15.4962 32.8173 16.0564 33.004 16.5747V16.5683Z" fill="#FAF8F5"></path> <path d="M47.7012 0H52.5305V23.0875H47.7012V0Z" fill="#FAF8F5"></path> <path d="M55.0896 6.6681H59.7516V10.8085H60.1798C60.5533 9.55928 61.2229 8.5419 62.1985 7.7531C63.174 6.96431 64.5359 6.54898 66.2873 6.50391V11.6617H64.8095C63.9789 11.6617 63.2545 11.7615 62.6428 11.9579C62.031 12.1543 61.5223 12.4569 61.1167 12.8626C60.711 13.2682 60.4084 13.7866 60.212 14.424C60.0156 15.0583 59.9158 15.8471 59.9158 16.7872V23.0911H55.0864V6.6681H55.0896Z" fill="#FAF8F5"></path> <path d="M68.1353 6.66728H72.9292V15.2378C72.9292 16.5095 73.1739 17.4625 73.6697 18.0935C74.1623 18.7278 74.877 19.0465 75.8204 19.0465C76.2582 19.0465 76.68 18.9596 77.0857 18.7825C77.4913 18.6087 77.8616 18.3189 78.2028 17.91C78.5441 17.5044 78.821 16.9635 79.0399 16.2841C79.2589 15.608 79.3683 14.7516 79.3683 13.7246V6.66406H84.2299V23.0839H79.5325V18.9789H79.1043C78.9079 19.6132 78.6439 20.1959 78.3155 20.7175C77.9871 21.2423 77.5879 21.6962 77.1179 22.0794C76.6478 22.4625 76.1101 22.7651 75.5081 22.9841C74.906 23.203 74.2653 23.3125 73.586 23.3125C72.7747 23.3125 72.0374 23.1805 71.3709 22.9164C70.7045 22.6524 70.1346 22.2307 69.6645 21.6512C69.1945 21.0716 68.821 20.3311 68.5474 19.4361C68.2737 18.5378 68.1385 17.4657 68.1385 16.2165V6.66406L68.1353 6.66728Z" fill="#FAF8F5"></path> <path d="M90.934 17.6338C91.0209 18.4226 91.3332 19.015 91.8709 19.4078C92.4054 19.8038 93.2231 19.997 94.3178 19.997C94.6687 19.997 94.9939 19.9648 95.303 19.8972C95.6088 19.8328 95.8761 19.7394 96.1079 19.6171C96.3397 19.498 96.5264 19.337 96.6681 19.1406C96.8097 18.9442 96.8806 18.7124 96.8806 18.4516C96.8806 18.1651 96.8194 17.9526 96.7003 17.8109C96.5779 17.6692 96.4202 17.5372 96.2238 17.4149C96.0274 17.2958 95.8149 17.2024 95.5831 17.1348C95.3513 17.0672 95.084 17.0028 94.7782 16.9384L91.8226 16.4458C91.1884 16.3364 90.5509 16.1722 89.9166 15.9532C89.2824 15.7343 88.7125 15.4445 88.2103 15.0807C87.708 14.7169 87.2959 14.2501 86.9804 13.6673C86.6616 13.0878 86.5039 12.3924 86.5039 11.5843C86.5039 10.554 86.7164 9.69115 87.1446 8.9925C87.5728 8.29386 88.1298 7.73366 88.8188 7.31833C89.5077 6.90301 90.2804 6.60681 91.1336 6.43295C91.9868 6.25588 92.8497 6.16895 93.7254 6.16895C95.1066 6.16895 96.2656 6.32671 97.2057 6.64545C98.1459 6.96418 98.9185 7.38594 99.5206 7.91073C100.123 8.43552 100.577 9.05046 100.882 9.74911C101.188 10.4478 101.398 11.1818 101.507 11.9513H96.6133C96.5489 11.2752 96.2849 10.744 95.8245 10.3576C95.3674 9.97448 94.6623 9.78453 93.7222 9.78453C93.3938 9.78453 93.0911 9.80706 92.8175 9.84891C92.5438 9.89399 92.2959 9.98092 92.077 10.1129C91.858 10.2449 91.6809 10.4091 91.5522 10.6055C91.4202 10.8019 91.3558 11.0337 91.3558 11.2945C91.3558 11.4909 91.4041 11.6776 91.5039 11.8515C91.6037 12.0286 91.7357 12.1638 91.8999 12.2604C92.0641 12.3602 92.254 12.4407 92.4762 12.5051C92.6951 12.5694 92.9366 12.6371 93.1974 12.7015L96.2849 13.2584C96.9417 13.3679 97.5921 13.5257 98.2392 13.7349C98.8831 13.9442 99.4691 14.2372 99.9971 14.6203C100.525 15.0034 100.934 15.4735 101.227 16.0337C101.52 16.5939 101.671 17.2765 101.671 18.0846C101.671 19.0472 101.481 19.8811 101.098 20.5797C100.715 21.2784 100.19 21.8547 99.5238 22.3054C98.8574 22.7529 98.0782 23.0878 97.1929 23.3067C96.3075 23.5256 95.348 23.6351 94.3178 23.6351C92.9591 23.6351 91.784 23.4773 90.7859 23.1586C89.7878 22.8399 88.9572 22.4085 88.2907 21.8611C87.6243 21.3138 87.1092 20.6763 86.7486 19.939C86.3848 19.2082 86.1626 18.4355 86.0757 17.6242H90.9372V17.6338H90.934Z" fill="#FAF8F5"></path> <path d="M9.77783 18.8855L10.9304 6.66406H16.5132L17.6658 18.8855L18.3129 19.0111C18.9311 17.5655 20.9594 12.9358 21.3876 6.66728H27.4307L22.8976 23.0871H15.029L13.8989 14.8772H13.5576L12.4275 23.0871H4.54925L0 6.66728H6.05601C6.48421 12.939 8.50932 17.5655 9.1307 19.0111L9.77783 18.8855Z" fill="#FAF8F5"></path> <path d="M0.00965832 30.8481H2.27623V34.5925H2.50483C2.70122 33.9582 2.97488 33.4012 3.32581 32.9183C3.67674 32.4386 4.07597 32.02 4.52349 31.6691C4.97101 31.3182 5.47005 31.0574 6.01738 30.8803C6.5647 30.7065 7.14422 30.6163 7.75916 30.6163C9.02767 30.6163 10.0837 30.9769 10.9272 31.7013C11.7707 32.4225 12.3342 33.4753 12.6175 34.8533H12.8461C13.0425 34.1739 13.3161 33.5783 13.6671 33.0632C14.018 32.548 14.4269 32.1102 14.8969 31.7496C15.367 31.389 15.8886 31.1089 16.4552 30.9125C17.0251 30.7161 17.6271 30.6163 18.2614 30.6163C19.0695 30.6163 19.7939 30.7547 20.4282 31.0252C21.0624 31.2989 21.6098 31.711 22.0701 32.2551C22.5305 32.8024 22.8783 33.4753 23.1197 34.2737C23.3612 35.0722 23.4803 36.0091 23.4803 37.0812V47.2583H21.1172V37.4096C21.1172 35.7902 20.7888 34.6021 20.132 33.8488C19.4752 33.0922 18.5673 32.7155 17.4082 32.7155C16.7514 32.7155 16.1429 32.8475 15.5859 33.1083C15.029 33.3723 14.5525 33.7586 14.1564 34.2737C13.7637 34.7889 13.4514 35.4457 13.2196 36.2441C12.991 37.0426 12.8751 37.9891 12.8751 39.0838V47.2583H10.5763V37.4096C10.5763 35.7902 10.2543 34.6021 9.6072 33.8488C8.96006 33.0922 8.04892 32.7155 6.86412 32.7155C6.40372 32.7155 5.91112 32.8024 5.38633 32.9795C4.86154 33.1533 4.37218 33.4785 3.92466 33.9486C3.47714 34.4186 3.10367 35.0658 2.80747 35.8867C2.51126 36.7077 2.36316 37.7734 2.36316 39.087V47.2615H0V30.8449L0.00965832 30.8481Z" fill="#FAF8F5"></path> <path d="M26.5546 35.6098C26.9602 34.5602 27.5172 33.6523 28.2288 32.8861C28.9403 32.1198 29.787 31.5177 30.7722 31.0799C31.7574 30.642 32.8295 30.4231 33.9886 30.4231C35.1476 30.4231 36.2262 30.642 37.221 31.0799C38.2159 31.5177 39.0723 32.1198 39.7838 32.8861C40.4953 33.6523 41.0523 34.5602 41.458 35.6098C41.8636 36.6594 42.0665 37.8088 42.0665 39.058V39.9788H28.3414C28.4284 40.8545 28.6248 41.6369 28.9306 42.3258C29.2365 43.0148 29.6486 43.6072 30.1605 44.0998C30.6756 44.5924 31.2713 44.9691 31.9506 45.2331C32.6299 45.4971 33.3736 45.6259 34.1817 45.6259C35.5823 45.6259 36.7252 45.3265 37.6138 44.7244C38.4992 44.1224 39.1077 43.2853 39.4361 42.2132H41.899C41.6801 43.002 41.3517 43.736 40.9139 44.4121C40.476 45.0914 39.9351 45.671 39.288 46.1507C38.6409 46.6336 37.8939 47.0103 37.0375 47.284C36.1843 47.5576 35.2313 47.6961 34.1817 47.6961C32.9132 47.6961 31.7671 47.4772 30.7497 47.0393C29.7323 46.6014 28.8662 45.9994 28.1547 45.2331C27.4432 44.4669 26.8959 43.5589 26.5127 42.5094C26.1296 41.4598 25.9396 40.3104 25.9396 39.0612C25.9396 37.812 26.1425 36.6658 26.5481 35.613L26.5546 35.6098ZM39.6389 38.1372C39.5938 37.3484 39.4296 36.6111 39.1463 35.9221C38.863 35.2331 38.4734 34.6246 37.9808 34.0998C37.4882 33.575 36.9023 33.1597 36.2229 32.8506C35.5436 32.5448 34.7999 32.3902 33.9918 32.3902C33.1837 32.3902 32.4432 32.5448 31.7767 32.8506C31.1103 33.1565 30.5275 33.5686 30.0382 34.0805C29.5456 34.5957 29.156 35.2009 28.8727 35.9028C28.5894 36.6047 28.4252 37.3484 28.3801 38.134H39.6421L39.6389 38.1372Z" fill="#FAF8F5"></path> <path d="M44.7288 30.8481H46.9954V34.5925H47.224C47.4204 33.9582 47.694 33.4012 48.0449 32.9183C48.3959 32.4386 48.7951 32.02 49.2426 31.6691C49.6902 31.3182 50.1892 31.0574 50.7365 30.8803C51.2838 30.7065 51.8634 30.6163 52.4783 30.6163C53.7468 30.6163 54.8028 30.9769 55.6464 31.7013C56.4899 32.4225 57.0533 33.4753 57.3366 34.8533H57.5652C57.7616 34.1739 58.0353 33.5783 58.3862 33.0632C58.7371 32.548 59.146 32.1102 59.6161 31.7496C60.0862 31.389 60.6077 31.1089 61.1744 30.9125C61.7442 30.7161 62.3463 30.6163 62.9805 30.6163C63.7886 30.6163 64.5131 30.7547 65.1473 31.0252C65.7816 31.2989 66.3289 31.711 66.7893 32.2551C67.2497 32.8024 67.5974 33.4753 67.8389 34.2737C68.0803 35.0722 68.1995 36.0091 68.1995 37.0812V47.2583H65.8363V37.4096C65.8363 35.7902 65.5079 34.6021 64.8511 33.8488C64.1943 33.0922 63.2864 32.7155 62.1274 32.7155C61.4706 32.7155 60.8621 32.8475 60.3051 33.1083C59.7481 33.3723 59.2716 33.7586 58.8756 34.2737C58.4828 34.7889 58.1705 35.4457 57.9387 36.2441C57.7101 37.0426 57.5942 37.9891 57.5942 39.0838V47.2583H55.2954V37.4096C55.2954 35.7902 54.9735 34.6021 54.3263 33.8488C53.6792 33.0922 52.7681 32.7155 51.5833 32.7155C51.1229 32.7155 50.6303 32.8024 50.1055 32.9795C49.5807 33.1533 49.0913 33.4785 48.6438 33.9486C48.1963 34.4186 47.8228 35.0658 47.5266 35.8867C47.2304 36.7077 47.0823 37.7734 47.0823 39.087V47.2615H44.7191V30.8449L44.7288 30.8481Z" fill="#FAF8F5"></path> <path d="M71.2913 35.6421C71.7066 34.5925 72.2861 33.6781 73.0298 32.899C73.7736 32.1231 74.6589 31.5146 75.6892 31.0767C76.7162 30.6389 77.856 30.4199 79.1052 30.4199C80.3544 30.4199 81.4651 30.6389 82.505 31.0767C83.545 31.5146 84.4368 32.1231 85.1805 32.899C85.9242 33.6749 86.5037 34.5957 86.9191 35.6582C87.3344 36.7206 87.5437 37.8636 87.5437 39.0902C87.5437 40.3169 87.3344 41.4212 86.9191 42.4708C86.5037 43.5203 85.9242 44.4347 85.1805 45.2106C84.4368 45.9865 83.545 46.595 82.505 47.0329C81.4651 47.4708 80.3318 47.6897 79.1052 47.6897C77.8785 47.6897 76.7452 47.4708 75.7085 47.0329C74.6686 46.595 73.7768 45.9865 73.0331 45.2106C72.2893 44.4347 71.7098 43.5203 71.2945 42.4708C70.8792 41.4212 70.6699 40.2815 70.6699 39.0548C70.6699 37.8282 70.8759 36.6916 71.2945 35.6388L71.2913 35.6421ZM73.4902 41.6176C73.7961 42.4064 74.2178 43.0889 74.7555 43.6684C75.2932 44.248 75.9307 44.6987 76.6776 45.0142C77.4213 45.333 78.2327 45.4907 79.1084 45.4907C79.9841 45.4907 80.789 45.333 81.5231 45.0142C82.2571 44.6955 82.8978 44.248 83.4451 43.6684C83.9925 43.0889 84.4175 42.4032 84.7265 41.6176C85.0324 40.8288 85.1869 39.9756 85.1869 39.058C85.1869 38.1404 85.0324 37.2583 84.7265 36.4792C84.4207 35.7032 83.9925 35.0239 83.4451 34.4444C82.8978 33.8649 82.2571 33.4173 81.5231 33.0986C80.789 32.7831 79.9841 32.6221 79.1084 32.6221C78.2327 32.6221 77.4213 32.7799 76.6776 33.0986C75.9339 33.4173 75.2932 33.8649 74.7555 34.4444C74.2178 35.0239 73.7961 35.7032 73.4902 36.4792C73.1844 37.2551 73.0298 38.1147 73.0298 39.058C73.0298 40.0014 73.1844 40.832 73.4902 41.6176Z" fill="#FAF8F5"></path> <path d="M90.1714 30.8478H92.438V35.249H92.6666C93.1463 33.8259 94.0027 32.7152 95.2262 31.9167C96.4528 31.1183 98.0594 30.7191 100.052 30.7191V33.2142H98.9029C97.8308 33.2142 96.9003 33.3527 96.1115 33.6231C95.3227 33.8968 94.6627 34.3282 94.1251 34.9206C93.5874 35.513 93.1882 36.2567 92.9274 37.1518C92.6634 38.05 92.5346 39.1221 92.5346 40.3681V47.2644H90.1714V30.8478Z" fill="#FAF8F5"></path> <path d="M106.881 47.2646L100.677 30.848H103.108L108.822 45.8866L114.569 30.848H117L108.265 53.9291H105.835L108.362 47.2646H106.881Z" fill="#FAF8F5"></path> </svg></span>
        <span class="pass-logo" role="img" aria-label="Walrus Console"><svg class="pass-mark" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 49" fill="#FAF8F5"> <path d="M111.908 31.6072C113.086 31.6072 114.175 31.8188 115.167 32.2449C116.162 32.671 117.013 33.2698 117.723 34.0418C118.432 34.8171 118.988 35.7278 119.393 36.7722C119.797 37.8197 119.999 38.96 119.999 40.2029L119.996 40.2097V41.2215H106.571C106.661 42.0255 106.85 42.7564 107.146 43.4099C107.441 44.0635 107.827 44.615 108.309 45.0603C108.787 45.5056 109.349 45.8544 109.994 46.1043C110.639 46.3541 111.342 46.4792 112.106 46.4793C113.439 46.4793 114.521 46.2005 115.35 45.6463C116.178 45.0888 116.747 44.3327 117.052 43.3748H119.868C119.65 44.1373 119.328 44.8522 118.901 45.5154C118.474 46.1785 117.934 46.7519 117.279 47.2293C116.624 47.7097 115.867 48.0909 115.003 48.3728C114.139 48.6579 113.173 48.7986 112.104 48.7986C110.816 48.7986 109.66 48.5879 108.633 48.1619C107.605 47.7358 106.738 47.1362 106.028 46.364C105.319 45.5887 104.773 44.6789 104.391 43.6345C104.005 42.5869 103.816 41.446 103.816 40.2029C103.816 38.9601 104.018 37.8165 104.423 36.7722C104.827 35.7246 105.389 34.8139 106.108 34.0418C106.831 33.2696 107.682 32.671 108.665 32.2449C109.648 31.8188 110.73 31.6072 111.908 31.6072ZM8.25195 31.6101C9.36295 31.6101 10.3748 31.7736 11.2803 32.1004C12.1857 32.4272 12.9758 32.889 13.6533 33.4881C14.3274 34.0871 14.8926 34.8111 15.3389 35.6599C15.7884 36.5089 16.1 37.4475 16.2734 38.4695H13.5215C13.2164 37.0534 12.6058 35.9644 11.6875 35.2019C10.7692 34.4395 9.62323 34.0584 8.24902 34.0584C7.44307 34.0584 6.70095 34.212 6.02344 34.5164C5.34609 34.8207 4.76169 35.2532 4.27051 35.8074C3.77935 36.3648 3.39093 37.0118 3.1084 37.7517C2.82263 38.4918 2.68164 39.3315 2.68164 40.2029C2.68164 41.0742 2.8259 41.8846 3.1084 42.6375C3.39094 43.3903 3.7793 44.0442 4.27051 44.5984C4.76169 45.1558 5.3461 45.5851 6.02344 45.8894C6.69774 46.197 7.43986 46.3484 8.24902 46.3484C9.62645 46.3484 10.7724 45.9663 11.6875 45.2039C12.6026 44.4414 13.2164 43.3524 13.5215 41.9363H16.2734C16.0968 42.9615 15.7851 43.8969 15.3389 44.7459C14.8925 45.5949 14.3308 46.3196 13.6533 46.9187C12.9791 47.5178 12.1857 47.9787 11.2803 48.3054C10.3748 48.6322 9.36616 48.7957 8.25195 48.7957C7.05114 48.7957 5.94331 48.5781 4.92871 48.1424C3.91407 47.7066 3.04068 47.101 2.30859 46.3289C1.57649 45.5567 1.01103 44.6468 0.606445 43.6023C0.201883 42.5547 0 41.4235 0 40.2029C3.08003e-06 38.9822 0.208836 37.8479 0.623047 36.8035C1.03726 35.7591 1.60876 34.849 2.34082 34.0769C3.07289 33.3049 3.94034 32.6992 4.94531 32.2635C5.95015 31.8279 7.05133 31.6102 8.25195 31.6101ZM26.7119 31.6101C27.9577 31.6102 29.0977 31.8278 30.1348 32.2635C31.1718 32.6991 32.0611 33.3049 32.8027 34.0769C33.5444 34.849 34.1286 35.7591 34.5557 36.8035C34.9827 37.8511 35.1953 38.9822 35.1953 40.2029C35.1953 41.4236 34.9827 42.5579 34.5557 43.6023C34.1286 44.6467 33.5444 45.5568 32.8027 46.3289C32.0611 47.1009 31.1718 47.7067 30.1348 48.1424C29.0977 48.5781 27.9352 48.7956 26.7119 48.7957C25.4887 48.7957 24.3583 48.578 23.3213 48.1424C22.2842 47.7067 21.3913 47.1009 20.6367 46.3289C19.8822 45.5568 19.298 44.6467 18.8838 43.6023C18.4696 42.5547 18.2607 41.4236 18.2607 40.2029C18.2607 38.9822 18.4724 37.8479 18.8994 36.8035C19.3265 35.7591 19.9106 34.849 20.6523 34.0769C21.3941 33.3048 22.2772 32.6992 23.3047 32.2635C24.3322 31.8277 25.4661 31.6101 26.7119 31.6101ZM80.6309 31.6101C81.8767 31.6101 83.0166 31.8278 84.0537 32.2635C85.0907 32.6991 85.98 33.3049 86.7217 34.0769C87.4634 34.8491 88.0485 35.759 88.4756 36.8035C88.9026 37.8511 89.1143 38.9823 89.1143 40.2029C89.1143 41.4235 88.9026 42.5579 88.4756 43.6023C88.0485 44.6468 87.4634 45.5567 86.7217 46.3289C85.98 47.1009 85.0907 47.7067 84.0537 48.1424C83.0166 48.5781 81.8542 48.7957 80.6309 48.7957C79.4076 48.7957 78.2773 48.578 77.2402 48.1424C76.2031 47.7066 75.3102 47.101 74.5557 46.3289C73.8011 45.5568 73.2169 44.6467 72.8027 43.6023C72.3885 42.5547 72.1797 41.4236 72.1797 40.2029C72.1797 38.9822 72.3913 37.8479 72.8184 36.8035C73.2454 35.7591 73.8296 34.849 74.5713 34.0769C75.313 33.3048 76.1962 32.6992 77.2236 32.2635C78.2511 31.8277 79.385 31.6101 80.6309 31.6101ZM62.4658 31.6072C63.7306 31.6072 64.7996 31.7512 65.6729 32.033C66.5462 32.3149 67.2754 32.7127 67.8662 33.2254C68.4569 33.7379 68.903 34.3368 69.208 35.0222C69.513 35.7109 69.6994 36.4575 69.7637 37.2615H67.0801C66.9484 36.1756 66.5269 35.3205 65.8174 34.699C65.1078 34.0775 63.9902 33.7664 62.4619 33.7664C61.9581 33.7664 61.4735 33.8146 61.0049 33.9138C60.5329 34.0132 60.1184 34.1706 59.7588 34.3885C59.3992 34.6063 59.1099 34.8753 58.8916 35.1892C58.6733 35.5064 58.5645 35.8717 58.5645 36.2849C58.5645 36.6981 58.6538 37.041 58.8271 37.3133C59.0005 37.5856 59.2321 37.8102 59.5146 37.9832C59.7971 38.1561 60.1247 38.2901 60.4971 38.3894C60.8695 38.4887 61.2389 38.5822 61.6113 38.6687L64.9512 39.2547C65.5611 39.3636 66.1743 39.5173 66.7842 39.7127C67.394 39.908 67.9366 40.1772 68.4053 40.5135L68.4121 40.5076C68.8809 40.8472 69.2632 41.2732 69.5586 41.7986C69.854 42.324 70.0019 42.9648 70.002 43.7273C70.002 44.5347 69.8313 45.2464 69.4941 45.8679C69.157 46.4893 68.6942 47.0182 68.1035 47.4539C67.5128 47.8894 66.8098 48.2226 65.9912 48.45C65.1757 48.6774 64.2637 48.7927 63.2588 48.7927C62.0579 48.7927 60.9817 48.6676 60.0312 48.4177C59.0809 48.1678 58.2683 47.7896 57.5908 47.2898C56.9135 46.7901 56.377 46.1782 55.9854 45.4607C55.5937 44.7431 55.363 43.9128 55.2988 42.9773H58.0146C58.1238 44.1531 58.6061 45.0571 59.457 45.6883C60.3079 46.3225 61.5727 46.6364 63.2549 46.6365C63.7783 46.6365 64.2801 46.5823 64.7617 46.4734C65.2432 46.3645 65.6736 46.207 66.0557 45.9988C66.4375 45.7906 66.7457 45.5186 66.9736 45.1824C67.2016 44.846 67.3174 44.4482 67.3174 43.99C67.3174 43.5767 67.2271 43.24 67.0537 42.9773C66.8804 42.7149 66.6494 42.4941 66.3672 42.3084C66.0846 42.1226 65.7503 41.9749 65.3682 41.866C64.9861 41.7571 64.588 41.6674 64.1738 41.6033L60.834 41.0135C60.1791 40.8821 59.5563 40.7186 58.9688 40.5232C58.3781 40.3278 57.8546 40.0559 57.3955 39.7068C56.9364 39.3576 56.5698 38.9283 56.2969 38.4158C56.0207 37.9064 55.8857 37.278 55.8857 36.5379C55.8857 35.7978 56.0435 35.1282 56.3613 34.5291C56.676 33.9332 57.1253 33.414 57.7031 32.9783C58.281 32.5426 58.9684 32.2059 59.7646 31.9656C60.561 31.7285 61.4608 31.6072 62.4658 31.6072ZM97.8086 46.0662H102.892V48.3728H90.042V46.0662H95.125V27.7078H90.042V25.4011H97.8086V46.0662ZM46.7168 31.8054C47.6993 31.8055 48.557 31.9689 49.2891 32.2957C50.0178 32.6224 50.6369 33.0971 51.1377 33.7185L51.1348 33.7088C51.6357 34.3303 52.0152 35.0864 52.2656 35.9802C52.516 36.874 52.6406 37.8993 52.6406 39.0525V48.3631H49.9561V39.575C49.956 37.6783 49.5835 36.3068 48.8418 35.4578C48.1002 34.6091 47.0506 34.1835 45.6992 34.1834C45.1983 34.1834 44.6356 34.2787 44.0127 34.4773C43.3898 34.676 42.8116 35.0352 42.2754 35.5574C41.7425 36.0796 41.2904 36.7947 40.918 37.698C40.5488 38.6047 40.3623 39.7419 40.3623 41.1131V48.367H37.6777V32.0301H40.2979V36.2459H40.5264C40.7672 35.5508 41.0947 34.9231 41.5088 34.3689C41.923 33.8147 42.3984 33.3529 42.9346 32.9812C43.4707 32.6129 44.0579 32.3242 44.7031 32.116C45.3453 31.9077 46.0168 31.8054 46.7168 31.8054ZM26.7119 34.0584C25.8803 34.0584 25.1157 34.212 24.4189 34.5164C23.7192 34.8239 23.1092 35.2464 22.5859 35.7908C22.0626 36.3355 21.6576 36.9832 21.375 37.7361C21.0893 38.489 20.9482 39.3315 20.9482 40.2029C20.9482 41.0742 21.0925 41.8847 21.375 42.6375C21.6576 43.3904 22.0626 44.0441 22.5859 44.5984C23.1093 45.1558 23.726 45.5851 24.4355 45.8894C25.1451 46.1969 25.9158 46.3484 26.7441 46.3484C27.5724 46.3484 28.3363 46.1937 29.0361 45.8894C29.7329 45.5851 30.3467 45.1527 30.8701 44.5984C31.3934 44.041 31.7976 43.3903 32.0801 42.6375C32.3658 41.8846 32.5078 41.0967 32.5078 40.2029C32.5078 39.3091 32.3626 38.4858 32.0801 37.7361C31.7975 36.9832 31.3935 36.3355 30.8701 35.7908C30.3468 35.2462 29.73 34.8207 29.0205 34.5164C28.311 34.212 27.5434 34.0584 26.7119 34.0584ZM80.6309 34.0584C79.7992 34.0584 79.0347 34.212 78.3379 34.5164C77.6382 34.8239 77.0281 35.2464 76.5049 35.7908C75.9815 36.3355 75.5765 36.9832 75.2939 37.7361C75.0082 38.489 74.8672 39.3315 74.8672 40.2029C74.8672 41.0742 75.0115 41.8847 75.2939 42.6375C75.5765 43.3904 75.9815 44.0441 76.5049 44.5984C77.0283 45.1559 77.6449 45.5851 78.3545 45.8894C79.0641 46.197 79.8347 46.3484 80.6631 46.3484C81.4913 46.3484 82.2552 46.1937 82.9551 45.8894C83.6519 45.5851 84.2657 45.1527 84.7891 44.5984C85.3124 44.041 85.7175 43.3903 86 42.6375C86.2856 41.8847 86.4268 41.0966 86.4268 40.2029C86.4268 39.3092 86.2825 38.4857 86 37.7361C85.7174 36.9832 85.3124 36.3355 84.7891 35.7908C84.2657 35.2462 83.649 34.8207 82.9395 34.5164C82.2298 34.212 81.4625 34.0584 80.6309 34.0584ZM111.914 33.8015C111.15 33.8016 110.45 33.9464 109.817 34.2283C109.185 34.5102 108.639 34.8973 108.18 35.3875C107.721 35.8777 107.361 36.4449 107.098 37.0857C106.834 37.7265 106.671 38.4091 106.606 39.1267H117.254C117.209 38.4091 117.045 37.7297 116.763 37.0857C116.477 36.445 116.108 35.8776 115.648 35.3875C115.189 34.8974 114.643 34.5102 114.011 34.2283C113.375 33.9432 112.678 33.8015 111.914 33.8015Z" fill="#FAF8F5"></path> <path d="M40.5718 10.7522H40.2443C39.737 9.48983 39.0177 8.45819 38.0801 7.66363C37.1393 6.86907 36.0058 6.47179 34.6733 6.47179C33.7582 6.47179 32.888 6.68325 32.0692 7.10936C31.2504 7.53227 30.5408 8.11217 29.9403 8.83945C29.3431 9.56993 28.8775 10.4446 28.55 11.4698H28.5468C28.2193 12.4919 28.0555 13.6068 28.0555 14.8018C28.0555 15.9969 28.2193 17.1086 28.5468 18.1339C28.8743 19.1559 29.3463 20.037 29.9564 20.7642C30.5697 21.4915 31.2761 22.0682 32.0853 22.4943C32.8944 22.9204 33.755 23.1319 34.6733 23.1319C36.0058 23.1319 37.1425 22.7346 38.0801 21.9401C39.0209 21.1455 39.7434 20.1171 40.2443 18.8515H40.5718V22.9717H45.2566V6.63198H40.5718V10.7522ZM40.1929 16.5223C39.9842 17.0317 39.7177 17.4739 39.3902 17.8455C39.0627 18.214 38.6709 18.5087 38.2118 18.7266C37.7558 18.9444 37.2196 19.0534 36.6737 19.0534C36.1279 19.0534 35.6205 18.9444 35.1517 18.7266C34.6797 18.5087 34.2783 18.2076 33.938 17.8263C33.6008 17.445 33.3375 16.9997 33.1513 16.4871V16.4935C32.9651 15.9777 32.8719 15.4202 32.8719 14.8083C32.8719 14.1963 32.9651 13.6356 33.1513 13.123C33.3375 12.6104 33.5976 12.1651 33.938 11.7838C34.2783 11.4025 34.6829 11.1014 35.1517 10.8835C35.6205 10.6657 36.1086 10.5567 36.6737 10.5567C37.2388 10.5567 37.7526 10.6657 38.2118 10.8835C38.6709 11.1014 39.0627 11.3929 39.3902 11.7646C39.7177 12.1362 39.9842 12.5752 40.1929 13.0878C40.4016 13.6036 40.5044 14.1707 40.5044 14.805C40.5044 15.4394 40.4016 16.0097 40.1929 16.5223Z" fill="#FAF8F5"></path> <path d="M52.625 0H47.8085V22.9749H52.625V0Z" fill="#FAF8F5"></path> <path d="M60.2542 10.7554H59.8271V6.63519H55.1745V22.9781H59.9909V16.7049C59.9909 15.7694 60.0904 14.9845 60.2863 14.3533C60.4822 13.7189 60.784 13.2031 61.1886 12.7994C61.5932 12.3957 62.1005 12.0946 62.7106 11.8991C63.3207 11.7037 64.0431 11.6044 64.8716 11.6044H66.3454V6.47179C64.5986 6.51664 63.2404 6.92994 62.2675 7.71489C61.2946 8.49984 60.6267 9.51226 60.2542 10.7554Z" fill="#FAF8F5"></path> <path d="M79.392 13.6582C79.392 14.6802 79.2829 15.5324 79.0645 16.2053C78.8462 16.8813 78.57 17.4195 78.2297 17.8232C77.8893 18.2301 77.5201 18.5184 77.1155 18.6915C76.7109 18.8677 76.2903 18.9542 75.8536 18.9542C74.9128 18.9542 74.1999 18.637 73.7086 18.0058C73.2142 17.3779 72.9701 16.4295 72.9701 15.164V6.63531H68.1922V16.138C68.1922 17.3811 68.3271 18.448 68.6 19.3418C68.8729 20.2325 69.2454 20.9694 69.7142 21.5461C70.183 22.1228 70.7513 22.5425 71.416 22.8052C72.0807 23.0679 72.816 23.1993 73.6252 23.1993C74.3027 23.1993 74.9417 23.0904 75.5421 22.8725C76.1426 22.6546 76.6788 22.3535 77.1476 21.9722C77.6164 21.591 78.0145 21.1392 78.3421 20.617C78.6696 20.098 78.9329 19.5181 79.1287 18.8869H79.5558V22.9718H84.2406V6.6321H79.392V13.6582Z" fill="#FAF8F5"></path> <path d="M68.1892 6.63602H68.1932V6.6321L68.1892 6.63602Z" fill="#FAF8F5"></path> <path d="M99.9644 14.5487C99.4378 14.1674 98.8534 13.8759 98.2112 13.6676C97.5658 13.4593 96.9172 13.3024 96.2622 13.1934L93.1828 12.6392C92.9228 12.5751 92.6819 12.5078 92.4636 12.4437C92.242 12.3796 92.0526 12.2996 91.8888 12.2002C91.7251 12.1041 91.5934 11.9696 91.4939 11.7933C91.3943 11.6203 91.3462 11.4345 91.3462 11.2391C91.3462 10.9796 91.4104 10.7489 91.542 10.5534C91.6705 10.358 91.8471 10.1946 92.0654 10.0633C92.2838 9.93189 92.531 9.84539 92.804 9.80053C93.0769 9.75888 93.3787 9.73646 93.7062 9.73646C94.6438 9.73646 95.347 9.92548 95.803 10.3067C96.2622 10.6912 96.5254 11.2198 96.5897 11.8927H101.47C101.361 11.1269 101.152 10.3965 100.847 9.70122C100.542 9.00598 100.09 8.39404 99.4892 7.87181C98.8887 7.34958 98.1181 6.92987 97.1805 6.61269C96.2429 6.2955 95.0869 6.13852 93.7094 6.13852C92.8361 6.13852 91.9755 6.22502 91.1246 6.40123C90.2737 6.57424 89.5031 6.869 88.8159 7.2823C88.1288 7.69559 87.5733 8.25307 87.1462 8.94831C86.7192 9.64355 86.5073 10.5022 86.5073 11.5274C86.5073 12.3316 86.6646 13.0236 86.9825 13.6003C87.2972 14.1802 87.7082 14.6448 88.2091 15.0068C88.71 15.3689 89.2783 15.6572 89.9109 15.8751C90.5434 16.0929 91.1792 16.2563 91.8118 16.3653L94.7594 16.8554C95.0645 16.9195 95.331 16.9836 95.5622 17.0509C95.7934 17.1182 96.0053 17.2111 96.2011 17.3296C96.397 17.4514 96.5544 17.5827 96.6764 17.7237C96.7952 17.8647 96.8562 18.0761 96.8562 18.3613C96.8562 18.6208 96.7855 18.8515 96.6443 19.0469C96.503 19.2423 96.3167 19.4025 96.0856 19.5211C95.8544 19.6428 95.5879 19.7357 95.2828 19.7998C94.9746 19.8671 94.6503 19.8991 94.3003 19.8991C93.2085 19.8991 92.3929 19.7069 91.8599 19.3128C91.3237 18.9219 91.0122 18.3324 90.9255 17.5475V17.5379H86.0802C86.1669 18.3452 86.3885 19.1142 86.7513 19.8415C87.1109 20.5751 87.6247 21.2095 88.2893 21.7542C88.954 22.2988 89.7824 22.7281 90.7778 23.0453C91.7732 23.3625 92.9452 23.5195 94.3003 23.5195C95.3278 23.5195 96.2846 23.4106 97.1676 23.1927C98.0507 22.9748 98.8277 22.6416 99.4924 22.1963C100.157 21.7478 100.68 21.1743 101.063 20.479C101.445 19.7838 101.634 18.954 101.634 17.996C101.634 17.1919 101.483 16.5126 101.191 15.9552C100.899 15.3977 100.491 14.9299 99.9644 14.5487Z" fill="#FAF8F5"></path> <path d="M18.4993 18.9189L17.8539 18.794L16.7044 6.6321H11.1366L9.98707 18.794L9.34167 18.9189C8.72195 17.4804 6.70226 12.8764 6.2752 6.63531H0.235382L4.77247 22.975H12.6297L13.7567 14.8052H14.0971L15.2241 22.975H23.0717L27.5928 6.63531H21.5658C21.1387 12.8732 19.1158 17.4804 18.4993 18.9189Z" fill="#FAF8F5"></path> </svg></span></span>
        <span class="pass-logo" role="img" aria-label="Tatum"><svg class="pass-mark pass-mark-word" viewBox="0 0 145 28" fill="#FAF8F5" fill-rule="evenodd" aria-hidden="true"><path d="M25.6945 12.3499H16.6396V27.8798H25.6945V12.3499Z"/><path d="M38.1905 0H21.5513V7.76498H38.1905V0Z"/><path d="M16.6392 4.08618H0V11.8511H16.6392V4.08618Z"/><path d="M66.5883 9.02124H70.1852L78.6018 27.9857H74.974L72.8899 23.1906H63.6273L61.5371 27.9857H58.1407L66.5883 9.02124ZM123.615 9.02989H127.255L134.325 21.8996H134.44L141.523 9.02989H144.854V27.9943H141.418V15.5051H141.276L134.338 27.9943H134.162L127.255 15.5051H127.098V27.9943H123.615V9.02989ZM51.8669 27.9943H48.3842V14.6751H41.1284V11.8568H51.8669V27.9943ZM51.8669 11.8568V9.03854H60.9627V11.8568H51.8669ZM78.7377 9.02989V11.5744H85.2864V28.0001H88.7691V11.5744H95.3208V9.02989H78.7377ZM114.359 24.1792C114.442 23.9761 114.477 23.759 114.463 23.5421V9.02989H117.959V23.3894C117.959 26.1298 115.952 28.0001 113.019 28.0001H104.892C101.956 28.0001 99.9521 26.1241 99.9521 23.3894V9.02989H103.435V23.5421C103.421 23.759 103.456 23.9761 103.539 24.1792C103.622 24.3823 103.749 24.5667 103.914 24.7203C104.078 24.8739 104.276 24.9932 104.494 25.0703C104.711 25.1473 104.944 25.1805 105.176 25.1674H112.722C112.954 25.1805 113.187 25.1473 113.405 25.0703C113.622 24.9932 113.82 24.8739 113.985 24.7203C114.149 24.5667 114.277 24.3823 114.359 24.1792ZM71.658 20.3722H64.887L68.2247 12.7329H68.3419L71.658 20.3722Z"/></svg></span>
      </p>
    </section>
  </div>
  <div class="dots-clip">
    <div class="dots-pad">
      <div class="dots">${"<span></span>".repeat(100)}</div>
    </div>
  </div>
  </div>

  <div class="sheet">
    <section class="journey">
      <div class="journey-head">
        <div class="journey-split">
          <p class="journey-side">One stored decision, ready when you ask.</p>
          <h2>Keep the record.<br>Read it <span class="mark">back.</span></h2>
        </div>
        <p class="journey-kicker"><i aria-hidden="true"></i>Why Sederunt</p>
      </div>
      <div class="journey-body">
        <nav class="rail" aria-label="What you can do">
          <div class="rail-pin">
          <a href="#join" aria-current="true"><i class="sq"></i>Join</a>
          <a href="#act"><i class="sq"></i>Act</a>
          <a href="#remember"><i class="sq"></i>Remember</a>
          <a href="#tenants"><i class="sq"></i>Multi-tenant</a>
          <a href="#portable"><i class="sq"></i>Portable</a>
          </div>
        </nav>
        <div class="steps">
          <article class="step" id="join">
            <p class="step-kicker">&gt; join</p>
            <figure class="clip">
              <video src="/clips/join.mp4" muted playsinline preload="metadata" aria-hidden="true"></video>
              <button type="button" class="clip-replay" aria-label="Replay"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M8.5 4.5H12.5V0.5M12.16 8.5C11.34 10.83 9.11 12.5 6.5 12.5C3.19 12.5 0.5 9.81 0.5 6.5C0.5 3.19 3.19 0.5 6.5 0.5C8.99 0.5 11.12 2.01 12.03 4.17" stroke="black" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
            </figure>
            <h3>Join your chat channel.</h3>
            <p>Take part in the channel you already use, and answer there.</p>
            <div class="step-pair">
              <p>Join the chat channel you use</p>
              <i aria-hidden="true"></i>
              <p>Answer in that same channel</p>
            </div>
          </article>
          <article class="step" id="act">
            <p class="step-kicker">&gt; act</p>
            <figure class="clip">
              <video src="/clips/implement.mp4" muted playsinline preload="metadata" aria-hidden="true"></video>
              <button type="button" class="clip-replay" aria-label="Replay"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M8.5 4.5H12.5V0.5M12.16 8.5C11.34 10.83 9.11 12.5 6.5 12.5C3.19 12.5 0.5 9.81 0.5 6.5C0.5 3.19 3.19 0.5 6.5 0.5C8.99 0.5 11.12 2.01 12.03 4.17" stroke="black" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
            </figure>
            <h3>Act in the tools you use.</h3>
            <p>Take one confirmed action from the <strong>request</strong> to the <strong>tool</strong>.</p>
            <div class="step-pair">
              <p>Interact with apps and tools using MCP</p>
              <i aria-hidden="true"></i>
              <p>Confirm one action before it is sent</p>
            </div>
          </article>
          <article class="step" id="remember">
            <p class="step-kicker">&gt; remember</p>
            <figure class="clip">
              <video src="/clips/remember.mp4" muted playsinline preload="metadata" aria-hidden="true"></video>
              <button type="button" class="clip-replay" aria-label="Replay"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M8.5 4.5H12.5V0.5M12.16 8.5C11.34 10.83 9.11 12.5 6.5 12.5C3.19 12.5 0.5 9.81 0.5 6.5C0.5 3.19 3.19 0.5 6.5 0.5C8.99 0.5 11.12 2.01 12.03 4.17" stroke="black" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
            </figure>
            <h3>Hear what was decided.</h3>
            <p>Ask, and you get the decision in <strong>words</strong>. The file stays <strong>where you stored it</strong>.</p>
            <div class="step-pair">
              <p>Ask what was decided</p>
              <i aria-hidden="true"></i>
              <p>Get the decision in words</p>
            </div>
          </article>
          <article class="step" id="tenants">
            <p class="step-kicker">&gt; multi-tenant</p>
            <figure class="clip">
              <video src="/clips/tenants.mp4" muted playsinline preload="metadata" aria-hidden="true"></video>
              <button type="button" class="clip-replay" aria-label="Replay"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M8.5 4.5H12.5V0.5M12.16 8.5C11.34 10.83 9.11 12.5 6.5 12.5C3.19 12.5 0.5 9.81 0.5 6.5C0.5 3.19 3.19 0.5 6.5 0.5C8.99 0.5 11.12 2.01 12.03 4.17" stroke="black" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
            </figure>
            <h3>Ask in the group that heard it.</h3>
            <p>Only people in that meeting or channel can ask about it.</p>
            <div class="step-pair">
              <p>It stays with the group</p>
              <i aria-hidden="true"></i>
              <p>Or the people invited</p>
            </div>
          </article>
          <article class="step" id="portable">
            <p class="step-kicker">&gt; portable</p>
            <figure class="claude-terminal">
              <div class="claude-terminal-header">
                <div class="claude-terminal-window-buttons" aria-hidden="true"><i></i><i></i><i></i></div>
                <span class="claude-terminal-title"><svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path fill="#8d8b84" d="M0 1.2A1.2 1.2 0 0 1 1.2 0h3.1l1.2 1.4h5.3A1.2 1.2 0 0 1 12 2.6v6.2A1.2 1.2 0 0 1 10.8 10H1.2A1.2 1.2 0 0 1 0 8.8V1.2Z"/></svg>Claude Code</span>
              </div>
              <div class="claude-terminal-body">
                <div class="claude-terminal-hello">
                  <b>Claude Code <small>v2.1.101</small></b>
                  <div class="claude-terminal-welcome">
                    <div class="claude-terminal-welcome-main">
                      <strong>Welcome back John Doe!</strong>
                      <svg class="claude-terminal-mark" viewBox="0 0 16 10" aria-hidden="true"><path fill="#D97757" d="M2 0H14V2H2ZM2 2H4V4H2ZM5 2H11V4H5ZM12 2H14V4H12ZM0 4H16V6H0ZM2 6H14V8H2ZM3 8H4V10H3ZM5 8H6V10H5ZM10 8H11V10H10ZM12 8H13V10H12Z"/></svg>
                      <p class="claude-terminal-meta">Opus 4.6 (1M context) · Claude Max ·<br>john.doe@example.com's Organization<br>~/sederunt</p>
                    </div>
                    <div class="claude-terminal-tips">
                      <p><b>Tips for getting started</b>Run /init to create a CLAUDE.md</p>
                      <p><b>Recent activity</b>No recent activity</p>
                    </div>
                  </div>
                </div>
                <div class="claude-terminal-prompt"><span class="claude-terminal-ask">what did we agree to show when the record is empty?</span></div>
                <div class="claude-terminal-tool">
                  <div class="claude-terminal-tool-row"><span class="claude-terminal-tool-mark">●</span><span class="claude-terminal-tool-name">Sederunt</span><span class="claude-terminal-tool-fn">recall</span><span class="claude-terminal-tool-status">running</span></div>
                  <div class="claude-terminal-tool-out">⎿ found the decision</div>
                </div>
                <div class="claude-terminal-line"><span class="claude-terminal-bullet">●</span> <span class="claude-terminal-stream">We agreed an empty record should say there are no notes yet, and not guess. I have not filed it, so say yes and I will file that one task.</span></div>
                <div class="claude-terminal-input" aria-hidden="true"><span>&gt;</span><i></i></div>
                <div class="claude-terminal-shortcuts">? for shortcuts</div>
              </div>
            </figure>
            <h3>Ask from the agent you already use.</h3>
            <p>Keep the same recall in <strong>Claude Code</strong>, Cursor, Codex, or <strong>any agent that speaks MCP</strong>.</p>
            <div class="step-pair">
              <p>Ask from the agent you have open</p>
              <i aria-hidden="true"></i>
              <p>Read the recall in that session</p>
            </div>
            <ul class="roster">
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#D97757" d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg><span>Claude Code</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/></svg><span>Cursor</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"/></svg><span>Codex</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"/></svg><span>Copilot</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3186FF" d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/></svg><span>Gemini</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.78 5.004h-.228a2.187 2.187 0 00-2.18 2.196v4.912c0 .98-.804 1.775-1.76 1.775a1.818 1.818 0 01-1.472-.773L13.168 5.95a2.197 2.197 0 00-1.81-.95c-1.134 0-2.154.972-2.154 2.173v4.94c0 .98-.797 1.775-1.76 1.775-.57 0-1.136-.289-1.472-.773L.408 5.098C.282 4.918 0 5.007 0 5.228v4.284c0 .216.066.426.188.604l5.475 7.889c.324.466.8.812 1.351.938 1.377.316 2.645-.754 2.645-2.117V11.89c0-.98.787-1.775 1.76-1.775h.002c.586 0 1.135.288 1.472.773l4.972 7.163a2.15 2.15 0 001.81.95c1.158 0 2.151-.973 2.151-2.173v-4.939c0-.98.787-1.775 1.76-1.775h.194c.122 0 .22-.1.22-.222V5.225a.221.221 0 00-.22-.222z"/></svg><span>Windsurf</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#111111" fill-rule="evenodd" d="M22 24H2V0h20zM17 4.8H7v14.4h10z"/></svg><span>OpenCode</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg><span>Grok Build</span></li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section class="faq" id="faq" aria-label="FAQs">
      <h2>FAQs</h2>
      <div class="faq-list">
        <details class="faq-item" open>
          <summary>What is Sederunt?</summary>
          <p>Sederunt joins a channel or a meeting, keeps the decision, and answers later from the agent you already use.</p>
        </details>
        <details class="faq-item">
          <summary>Where does it listen?</summary>
          <p>A channel, a meeting, or an announcement. It can answer in the room. An announcement can name a file.</p>
        </details>
        <details class="faq-item">
          <summary>What comes back when I ask?</summary>
          <p>The sentence that was kept, including who decided and which files were named. The files sit in Walrus Console. The answer does not open the file by itself.</p>
        </details>
        <details class="faq-item">
          <summary>What if a fact is missing?</summary>
          <p>Sederunt asks the person who made the request. It does not guess in the channel.</p>
        </details>
        <details class="faq-item">
          <summary>What if two people claim the same work?</summary>
          <p>Both stay. The later name does not erase the earlier one. You choose which one is current.</p>
        </details>
        <details class="faq-item">
          <summary>Who else can recall it?</summary>
          <p>Only people in that meeting or channel can ask about it, if the bot was there to hear it.</p>
        </details>
        <details class="faq-item">
          <summary>What does yes do?</summary>
          <p>Yes files one task in Linear. One yes covers that write, and nothing else moves.</p>
        </details>
      </div>
    </section>

  </div>
  <footer class="site-foot">
    <div class="foot-grid">
      <div>
        <h3>Discover</h3>
        <ul>
          <li><a href="#join">Join</a></li>
          <li><a href="#act">Act</a></li>
          <li><a href="#remember">Remember</a></li>
          <li><a href="#tenants">Multi-tenant</a></li>
          <li><a href="#portable">Portable</a></li>
        </ul>
      </div>
      <div>
        <h3>Build</h3>
        <ul>
          <li><a href="#faq">FAQs</a></li>
          <li><a href="https://walrus.xyz/products/walrus-memory/" target="_blank" rel="noopener noreferrer">Walrus Memory <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true"><path d="M9 0H0V1H9V0Z" fill="currentColor"></path><path d="M8.3 0L0 8.3L0.7 9L9 0.7L8.3 0Z" fill="currentColor"></path><path d="M9 0H8V9H9V0Z" fill="currentColor"></path></svg></a></li>
          <li><a href="https://walrus.xyz/products/walrus-console/" target="_blank" rel="noopener noreferrer">Walrus Console <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true"><path d="M9 0H0V1H9V0Z" fill="currentColor"></path><path d="M8.3 0L0 8.3L0.7 9L9 0.7L8.3 0Z" fill="currentColor"></path><path d="M9 0H8V9H9V0Z" fill="currentColor"></path></svg></a></li>
        </ul>
      </div>
      <div class="foot-mark">
        <p class="foot-name"><svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.25 16.25h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.15" cy="16.25" r="1.45" fill="#8ebcff"/></svg>Sederunt</p>
        <p class="foot-copy">© 2026 Sederunt.</p>
      </div>
    </div>
  </footer>
  <script type="module">
    import * as THREE from "three";
    import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
    import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
    import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
    import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
    import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
    import {
      HOLD_VIEW,
      createHoldState,
      pressHold,
      releaseHold,
      stepHold,
      pointerAim,
      holdListenersEnabled,
      fisheyeVertex,
      fisheyeFragment,
      introCamProgress,
      stripScroll,
      cameraPose,
      contentHidden,
      camera2Sample,
      dotGrid,
      dotIdleGap,
      pickIdleDots,
      pushDotTrail,
      CAMERA2_BAKE_SECONDS,
      CAMERA2_BAKE_STEPS
    } from "/hold.js";

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const railLinks = Array.from(document.querySelectorAll(".rail a"));
    const steps = Array.from(document.querySelectorAll(".step"));
    const playClip = (clip, on) => {
      const video = clip.querySelector("video");
      if (!video) return;
      if (!on || reduce || clip.classList.contains("is-ended")) {
        video.pause();
        return;
      }
      if (!video.paused) return;
      video.muted = true;
      const playing = video.play();
      if (playing) playing.catch(function () {});
    };
    if ("IntersectionObserver" in window) {
      const clipWatch = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          playClip(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.5);
        });
      }, { threshold: [0, 0.5, 1] });
      document.querySelectorAll(".clip").forEach((clip) => clipWatch.observe(clip));
    }
    const termStream = document.querySelector(".claude-terminal-stream");
    const termLine = document.querySelector(".claude-terminal-line");
    const termAsk = document.querySelector(".claude-terminal-ask");
    const termTool = document.querySelector(".claude-terminal-tool");
    if (termStream && termLine && termAsk && termTool) {
      const termAnswer = termStream.textContent;
      const termQuestion = termAsk.textContent;
      const termSlot = document.createElement("span");
      termSlot.className = "claude-terminal-slot";
      termStream.parentNode.insertBefore(termSlot, termStream);
      termSlot.appendChild(termStream);
      const termSizer = document.createElement("span");
      termSizer.className = "claude-terminal-sizer";
      termSizer.setAttribute("aria-hidden", "true");
      termSizer.textContent = termAnswer;
      termSlot.appendChild(termSizer);
      termLine.classList.add("is-fixed");
      const askSizer = document.createElement("span");
      askSizer.className = "claude-terminal-ask-sizer";
      askSizer.setAttribute("aria-hidden", "true");
      askSizer.textContent = termQuestion;
      const askLive = document.createElement("span");
      askLive.className = "claude-terminal-ask-live";
      askLive.textContent = termQuestion;
      termAsk.textContent = "";
      termAsk.appendChild(askSizer);
      termAsk.appendChild(askLive);
      termAsk.classList.add("is-fixed");
      let termTimer = 0;
      let termFrame = 0;
      const termStop = () => {
        if (termTimer) clearTimeout(termTimer);
        if (termFrame) cancelAnimationFrame(termFrame);
        termTimer = 0;
        termFrame = 0;
      };
      const termToolSet = (state) => {
        termTool.classList.toggle("is-on", state !== "off");
        termTool.classList.toggle("is-done", state === "done");
      };
      const termShow = (count) => {
        termStream.textContent = termAnswer.slice(0, count);
        termLine.classList.toggle("is-streaming", !reduce && count < termAnswer.length);
      };
      const termType = (full, perMs, write, done) => {
        const started = performance.now();
        const tick = (now) => {
          const count = Math.min(full.length, Math.floor((now - started) / perMs));
          write(count);
          if (count < full.length) termFrame = requestAnimationFrame(tick);
          else done();
        };
        termFrame = requestAnimationFrame(tick);
      };
      const termRun = () => {
        termStop();
        termAsk.classList.remove("is-typing");
        if (reduce) {
          askLive.textContent = termQuestion;
          termToolSet("done");
          termShow(termAnswer.length);
          return;
        }
        askLive.textContent = "";
        termShow(0);
        termToolSet("off");
        termAsk.classList.add("is-typing");
        termType(termQuestion, 38, (count) => {
          askLive.textContent = termQuestion.slice(0, count);
        }, () => {
          termAsk.classList.remove("is-typing");
          termTimer = setTimeout(() => {
            termToolSet("run");
            termTimer = setTimeout(() => {
              termToolSet("done");
              termTimer = setTimeout(() => {
                termType(termAnswer, 18, termShow, () => {
                  termTimer = setTimeout(termRun, 16000);
                });
              }, 420);
            }, 1100);
          }, 520);
        });
      };
      if ("IntersectionObserver" in window) {
        const termWatch = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) termRun();
            else {
              termStop();
              termAsk.classList.remove("is-typing");
              termLine.classList.remove("is-streaming");
              termToolSet("done");
              askLive.textContent = termQuestion;
              termStream.textContent = termAnswer;
            }
          });
        }, { threshold: 0.45 });
        termWatch.observe(termLine.closest(".claude-terminal"));
      } else termRun();
    }
    if (railLinks.length && steps.length && "IntersectionObserver" in window) {
      const markRail = (id) => {
        railLinks.forEach((link) => {
          if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      };
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) markRail(entry.target.id);
        });
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
      steps.forEach((step) => spy.observe(step));
    }

    const canvas = document.getElementById("field");
    const dotField = document.querySelector(".dots");
    if (dotField) {
      const dots = Array.from(dotField.querySelectorAll("span"));
      dots.forEach((dot) => dot.setAttribute("data-dot", ""));
      let isIdle = true;
      let idleTimeoutId = null;
      let idleIntervalId = null;
      let trailQueue = [];
      const trailTimeouts = new Set();

      function applyDotGrid() {
        const measured = dotField.getBoundingClientRect().width;
        const grid = dotGrid(measured || window.innerWidth);
        dotField.style.setProperty("--cols", String(grid.columns));
        dotField.style.gridTemplateColumns = "repeat(" + grid.columns + ", 1fr)";
        dots.forEach((dot, index) => {
          dot.hidden = index >= grid.count;
        });
      }

      function clearAllTrailTimeouts() {
        trailTimeouts.forEach((id) => clearTimeout(id));
        trailTimeouts.clear();
        trailQueue.forEach((dot) => dot.classList.remove("is-active", "is-trail"));
        trailQueue = [];
      }

      function clearIdleHighlights() {
        dots.forEach((dot) => {
          if (!dot.classList.contains("is-trail")) dot.classList.remove("is-active");
        });
      }

      function tickIdle() {
        if (!isIdle) return;
        const visible = dots.filter((dot) => !dot.hidden);
        if (!visible.length) return;
        clearIdleHighlights();
        pickIdleDots(visible, Math.random).forEach((dot) => dot.classList.add("is-active"));
      }

      function scheduleNextIdleTick() {
        if (!isIdle) return;
        idleIntervalId = setTimeout(() => {
          idleIntervalId = null;
          tickIdle();
          scheduleNextIdleTick();
        }, dotIdleGap(Math.random));
      }

      function enterIdleMode() {
        isIdle = true;
        clearAllTrailTimeouts();
        if (idleIntervalId === null) scheduleNextIdleTick();
      }

      function clearIdleTimeout() {
        if (idleTimeoutId !== null) {
          clearTimeout(idleTimeoutId);
          idleTimeoutId = null;
        }
      }

      function startIdleTimeout() {
        clearIdleTimeout();
        idleTimeoutId = setTimeout(() => {
          idleTimeoutId = null;
          enterIdleMode();
        }, 1800);
      }

      function stopIdle() {
        isIdle = false;
        clearIdleTimeout();
        if (idleIntervalId !== null) {
          clearTimeout(idleIntervalId);
          idleIntervalId = null;
        }
        dots.forEach((dot) => dot.classList.remove("is-active"));
      }

      function addTrailAt(x, y) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !dotField.contains(hit)) return;
        const dot = hit.closest("[data-dot]");
        if (!dot) return;
        const step = pushDotTrail(trailQueue, dot, 45);
        if (!step.added) return;
        if (step.dropped) step.dropped.classList.remove("is-active", "is-trail");
        trailQueue = step.queue;
        dot.classList.add("is-active", "is-trail");
        const timeoutId = setTimeout(() => {
          trailTimeouts.delete(timeoutId);
          const index = trailQueue.indexOf(dot);
          if (index !== -1) trailQueue.splice(index, 1);
          dot.classList.remove("is-active", "is-trail");
        }, 2400);
        trailTimeouts.add(timeoutId);
      }

      applyDotGrid();
      window.addEventListener("resize", applyDotGrid);
      window.addEventListener("mousemove", (event) => {
        const rect = dotField.getBoundingClientRect();
        const x = event.clientX;
        const y = event.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        startIdleTimeout();
        addTrailAt(x, y);
      }, { passive: true });
      if ("IntersectionObserver" in window) {
        const watcher = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry && entry.isIntersecting) startIdleTimeout();
          else {
            stopIdle();
            clearAllTrailTimeouts();
          }
        });
        watcher.observe(dotField);
      } else {
        startIdleTimeout();
      }
    }
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    document.querySelectorAll(".clip").forEach(function (clip) {
      const video = clip.querySelector("video");
      const replay = clip.querySelector(".clip-replay");
      if (!video || !replay) return;
      video.addEventListener("ended", function () {
        clip.classList.add("is-ended");
      });
      replay.addEventListener("click", function () {
        clip.classList.remove("is-ended");
        video.muted = true;
        video.currentTime = 0;
        const playing = video.play();
        if (playing) playing.catch(function () {});
      });
    });
    const scrambleGlyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_/#%&";
    function scrambleLabel(node, text) {
      if (reduce) {
        node.textContent = text;
        return;
      }
      const count = text.length;
      const rate = count / 600;
      let started = 0;
      if (node._scrambleFrame) cancelAnimationFrame(node._scrambleFrame);
      const tick = (now) => {
        if (!started) started = now;
        const done = Math.min(count, Math.floor((now - started) * rate));
        let next = "";
        for (let index = 0; index < count; index += 1) {
          const glyph = text[index];
          if (glyph === " ") next += " ";
          else if (index < done) next += glyph;
          else next += scrambleGlyphs[(Math.random() * scrambleGlyphs.length) | 0];
        }
        node.textContent = next;
        if (done < count) node._scrambleFrame = requestAnimationFrame(tick);
        else node.textContent = text;
      };
      node._scrambleFrame = requestAnimationFrame(tick);
    }
    document.querySelectorAll(".nav-links a, .nav-cluster .nav-wallet").forEach((link) => {
      const text = link.textContent;
      link.addEventListener("mouseenter", () => scrambleLabel(link, text));
    });
    const navBar = document.querySelector(".nav");
    const navMenu = document.querySelector(".nav-menu");
    const navLabel = document.querySelector(".nav-menu-label");
    const navPanel = document.querySelector(".nav-panel");
    const navScrim = document.querySelector(".nav-scrim");
    if (navBar && navMenu && navLabel && navPanel) {
      const setNav = (open) => {
        navBar.classList.toggle("is-open", open);
        navMenu.setAttribute("aria-expanded", open ? "true" : "false");
        if (navLabel._scrambleFrame) cancelAnimationFrame(navLabel._scrambleFrame);
        navLabel.textContent = open ? "Close" : "Menu";
      };
      navMenu.addEventListener("click", () => setNav(!navBar.classList.contains("is-open")));
      navLabel.addEventListener("mouseenter", () => scrambleLabel(navLabel, navLabel.textContent));
      navPanel.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setNav(false)));
      if (navScrim) navScrim.addEventListener("click", () => setNav(false));
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setNav(false);
      });
    }
    const ground = new THREE.Color("#081428");
    const bodyColor = new THREE.Color(0.07, 0.16, 0.40);
    const pathLightColor = new THREE.Color(0.74, 0.86, 1.00);

    function span(value, start, end, from, to) {
      if (Math.abs(end - start) < 1e-6) return from;
      const amount = Math.min(1, Math.max(0, (value - start) / (end - start)));
      return from + (to - from) * amount;
    }

    function ease4(amount) {
      const t = Math.min(1, Math.max(0, amount));
      return t < 0.5 ? 8 * t * t * t * t : 1 - ((-2 * t + 2) ** 4) / 2;
    }

    function joinLines(lines) {
      return lines.join("\\n") + "\\n";
    }

    function patchBody(material) {
      const uniforms = {
        uClearColor: { value: ground.clone() },
        uColor: { value: bodyColor.clone() },
        uEmissive: { value: new THREE.Color(0, 0, 0) },
        uNoiseScale: { value: 0.3 },
        uNoiseBalance: { value: -0.4 },
        uNoiseContrast: { value: 0 },
        uNoiseAmplitude: { value: 0.4 }
      };
      material.userData.uniforms = uniforms;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = "varying vec3 vLocalPosition;\\n" + shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\\n vLocalPosition = position;"
        );
        shader.fragmentShader = joinLines([
          "varying vec3 vLocalPosition;",
          "uniform vec3 uClearColor;",
          "uniform vec3 uColor;",
          "uniform vec3 uEmissive;",
          "uniform float uNoiseScale;",
          "uniform float uNoiseBalance;",
          "uniform float uNoiseContrast;",
          "uniform float uNoiseAmplitude;",
          "float hash31(vec3 p){",
          "  p = fract(p * 0.1031);",
          "  p += dot(p, p.yzx + 33.33);",
          "  return fract((p.x + p.y) * p.z);",
          "}"
        ]) + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          joinLines([
            "vec3 p = vLocalPosition * uNoiseScale;",
            "float n1 = hash31(p);",
            "float n2 = hash31(p * 2.7) * 0.4;",
            "float n = (n1 + n2) / 1.4;",
            "float spots = smoothstep(uNoiseBalance, uNoiseBalance + (uNoiseContrast + 0.5), n);",
            "float darken = mix(uNoiseAmplitude, 1.0, spots);",
            "vec3 mixedColor = mix(uClearColor, uColor, darken);",
            "vec4 diffuseColor = vec4(mixedColor, opacity);"
          ])
        ).replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\\n totalEmissiveRadiance += uEmissive;"
        );
      };
    }

    function patchPath(material) {
      const uniforms = {
        uTime: { value: 0 },
        uPulseSpeed: { value: 0.19 },
        uPulseSize: { value: 0.025 },
        uPulseSmooth: { value: 0.015 },
        uPathLightMinInterval: { value: 0.2 },
        uPathLightMaxInterval: { value: 1 },
        uPathLightPulseDuration: { value: 0.8 },
        uPathLightMaxZDistance: { value: 7.5 }
      };
      material.userData.uniforms = uniforms;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = joinLines([
          "attribute vec4 a_params;",
          "varying vec2 vUv2;",
          "varying vec4 vParams;",
          "varying float vViewDepth;"
        ]) + shader.vertexShader
          .replace("#include <uv_vertex>", "#include <uv_vertex>\\n vUv2 = uv; vParams = a_params;")
          .replace("#include <project_vertex>", "#include <project_vertex>\\n vViewDepth = -mvPosition.z;");
        shader.fragmentShader = joinLines([
          "uniform float uTime;",
          "uniform float uPulseSpeed;",
          "uniform float uPulseSize;",
          "uniform float uPulseSmooth;",
          "uniform float uPathLightMinInterval;",
          "uniform float uPathLightMaxInterval;",
          "uniform float uPathLightPulseDuration;",
          "uniform float uPathLightMaxZDistance;",
          "varying vec2 vUv2;",
          "varying vec4 vParams;",
          "varying float vViewDepth;",
          "float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }"
        ]) + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          joinLines([
            "float offset = vParams.y;",
            "float intervalRand = vParams.z;",
            "float speed = vParams.w;",
            "float interval = mix(uPathLightMinInterval, uPathLightMaxInterval, intervalRand);",
            "float t = uTime * (uPulseSpeed * speed) + offset * interval;",
            "float ci = floor(t / interval);",
            "float hA = hash11(ci + offset * 100.0);",
            "float trigA = ci * interval + hA * (interval * 0.4);",
            "float progA = clamp((t - trigA) / uPathLightPulseDuration, 0.0, 1.0);",
            "float fadeA = smoothstep(0.0, uPulseSize, progA) * smoothstep(0.0, uPulseSize, 1.0 - progA);",
            "float yA = vUv2.y - progA;",
            "float pulseA = smoothstep(0.0, uPulseSmooth, yA + uPulseSize) * smoothstep(0.0, uPulseSmooth, uPulseSize - yA) * fadeA;",
            "float ciPrev = ci - 1.0;",
            "float hB = hash11(ciPrev + offset * 100.0);",
            "float trigB = ciPrev * interval + hB * (interval * 0.4);",
            "float progB = clamp((t - trigB) / uPathLightPulseDuration, 0.0, 1.0);",
            "float fadeB = smoothstep(0.0, uPulseSize, progB) * smoothstep(0.0, uPulseSize, 1.0 - progB);",
            "float yB = vUv2.y - progB;",
            "float pulseB = smoothstep(0.0, uPulseSmooth, yB + uPulseSize) * smoothstep(0.0, uPulseSmooth, uPulseSize - yB) * fadeB;",
            "float basePulse = max(pulseA, pulseB);",
            "float visibility = uPathLightMaxZDistance <= 0.0 ? 1.0 : step(vViewDepth, uPathLightMaxZDistance);",
            "vec4 diffuseColor = vec4(diffuse, opacity * basePulse * visibility);"
          ])
        );
      };
    }

    function patchReveal(material, circle) {
      const uniforms = circle
        ? { uRevealMin: { value: 0.72 }, uRevealMax: { value: 1 } }
        : { uRevealStep: { value: 0.892 } };
      material.userData.uniforms = uniforms;
      material.defines = { USE_UV: "" };
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        const header = circle
          ? "uniform float uRevealMin;\\nuniform float uRevealMax;\\n"
          : "uniform float uRevealStep;\\n";
        const mask = circle
          ? joinLines([
            "float revealMask = step(uRevealMin, vUv.y) * step(vUv.y, uRevealMax);",
            "vec4 diffuseColor = vec4( diffuse, opacity * revealMask );"
          ])
          : joinLines([
            "float revealMask = step(vUv.y, uRevealStep);",
            "if (revealMask <= 0.0) discard;",
            "vec4 diffuseColor = vec4( diffuse, opacity * revealMask );"
          ]);
        shader.fragmentShader = header + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          mask
        );
      };
    }

    function softDisc() {
      const disc = document.createElement("canvas");
      disc.width = 64;
      disc.height = 64;
      const ctx = disc.getContext("2d");
      const paint = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      paint.addColorStop(0, "rgba(255,255,255,1)");
      paint.addColorStop(0.45, "rgba(255,255,255,0.7)");
      paint.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = paint;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(disc);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(ground, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ReinhardToneMapping;
      renderer.toneMappingExposure = 1;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog("#081428", 3.5, 5);
      scene.environmentIntensity = 0.12;

      const backdropScene = new THREE.Scene();
      const backdropCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
      backdropCamera.position.z = 1;
      const backdropMaterial = new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uColorA: { value: new THREE.Color("#000000") },
          uColorB: { value: new THREE.Color("#1A4E96") },
          uCenter: { value: new THREE.Vector2(0.2, 0.77) },
          uOffset: { value: 0.08 },
          uSoftness: { value: 0.95 },
          uSpread: { value: 6.6 },
          uNoiseAmount: { value: 0.05 },
          uNoiseScale: { value: 11.68 },
          uDither: { value: 1.34 },
          uOpacity: { value: 1 }
        },
        vertexShader: joinLines([
          "varying vec2 vUv;",
          "void main() {",
          "  vUv = uv;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}"
        ]),
        fragmentShader: joinLines([
          "uniform vec3 uColorA;",
          "uniform vec3 uColorB;",
          "uniform vec2 uCenter;",
          "uniform float uOffset;",
          "uniform float uSoftness;",
          "uniform float uSpread;",
          "uniform float uNoiseAmount;",
          "uniform float uNoiseScale;",
          "uniform float uDither;",
          "uniform float uOpacity;",
          "varying vec2 vUv;",
          "float hash31(vec3 p) {",
          "  float n = dot(p, vec3(127.1, 311.7, 74.7));",
          "  return fract(sin(n) * 43758.5453123);",
          "}",
          "float valueNoise3D(vec3 p) {",
          "  vec3 i = floor(p);",
          "  vec3 f = fract(p);",
          "  vec3 u = f * f * (3.0 - 2.0 * f);",
          "  float a = hash31(i);",
          "  float b = hash31(i + vec3(1.0, 0.0, 0.0));",
          "  float c = hash31(i + vec3(0.0, 1.0, 0.0));",
          "  float d = hash31(i + vec3(1.0, 1.0, 0.0));",
          "  float e = hash31(i + vec3(0.0, 0.0, 1.0));",
          "  float ff = hash31(i + vec3(1.0, 0.0, 1.0));",
          "  float g = hash31(i + vec3(0.0, 1.0, 1.0));",
          "  float h = hash31(i + vec3(1.0, 1.0, 1.0));",
          "  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, ff, u.x), mix(g, h, u.x), u.y), u.z);",
          "}",
          "void main() {",
          "  float baseGradient = length((vUv - uCenter)) * 2.0;",
          "  float gradientWithOffset = clamp(baseGradient + uOffset, 0.0, 1.0);",
          "  float soft = max(uSoftness, 0.0001);",
          "  float softened = clamp((gradientWithOffset - 0.5) / soft + 0.5, 0.0, 1.0);",
          "  float noise = valueNoise3D(vec3(vUv * uNoiseScale, 0.0)) * 2.0 - 1.0;",
          "  float t = clamp(softened + noise * uNoiseAmount, 0.0, 1.0);",
          "  t = pow(t, uSpread);",
          "  vec3 color = mix(uColorA, uColorB, t);",
          "  float ditherSeed = vUv.x * 12.9898 + vUv.y * 78.233;",
          "  float ditherNoise = fract(sin(ditherSeed) * 43758.5453) - 0.5;",
          "  color += vec3(ditherNoise * uDither * (1.0 / 255.0));",
          "  gl_FragColor = vec4(color, clamp(uOpacity, 0.0, 1.0));",
          "}"
        ])
      });
      backdropScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMaterial));
      const backdropTarget = new THREE.WebGLRenderTarget(8, 8, {
        depthBuffer: false,
        generateMipmaps: false
      });
      backdropTarget.texture.colorSpace = THREE.NoColorSpace;
      function paintBackdrop() {
        backdropTarget.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(backdropTarget);
        renderer.clear();
        renderer.render(backdropScene, backdropCamera);
        renderer.setRenderTarget(previous);
      }
      paintBackdrop();
      scene.background = backdropTarget.texture;
      const rig = new THREE.Group();
      const camera = new THREE.PerspectiveCamera(HOLD_VIEW.fov, window.innerWidth / window.innerHeight, 0.1, 80);
      const cameraBaseZ = 6.55;
      camera.position.set(-0.15, 0.04, cameraBaseZ);
      rig.add(camera);
      scene.add(rig);
      camera.lookAt(1.45, 0.02, 0);
      let viewCamera = camera;
      let cameraParent = rig;

      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      RectAreaLightUniformsLib.init();
      const key = new THREE.DirectionalLight(new THREE.Color(0.42, 0.66, 1.00), 6);
      key.position.set(-86.96, 30.43, 19.57);
      scene.add(key);
      const stripFar = new THREE.RectAreaLight("#ffffff", 13, 35.9, 0.7);
      stripFar.position.set(-0.67, -3.43, 39.63);
      stripFar.lookAt(63.28, -69.8, -0.38);
      scene.add(stripFar);
      const stripNear = new THREE.RectAreaLight("#ffffff", 4.4, 0.8, 1.5);
      stripNear.position.set(-0.27, -0.97, 5.63);
      stripNear.rotation.set(0.21, -2.46, -0.01);
      scene.add(stripNear);
      const stripTop = new THREE.RectAreaLight("#ffffff", 47.8, 1.7, 1);
      stripTop.position.set(0, 0.94, 26.09);
      stripTop.rotation.set(-1.5, 0, 0);
      scene.add(stripTop);
      const draco = new DRACOLoader();
      draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.183.0/examples/jsm/libs/draco/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      const main = await loader.loadAsync("/models/CEREBRIUM_part1_11_optimization.glb");
      const paths = await loader.loadAsync("/models/CEREBRIUM_part2_4_optimization.glb");
      main.scene.add(paths.scene);
      scene.add(main.scene);
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        side: THREE.DoubleSide
      });
      patchBody(bodyMaterial);
      const pathMaterial = new THREE.MeshBasicMaterial({
        color: pathLightColor,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
        opacity: 1
      });
      patchPath(pathMaterial);
      const pathRevealMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        transparent: true,
        side: THREE.DoubleSide
      });
      patchReveal(pathRevealMaterial, false);
      const circleRevealMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        transparent: true,
        side: THREE.DoubleSide
      });
      patchReveal(circleRevealMaterial, true);
      let lightIndex = 0;
      main.scene.traverse((obj) => {
        if (obj.isPerspectiveCamera) {
          viewCamera = obj;
          viewCamera.fov = HOLD_VIEW.fov;
          viewCamera.near = 0.1;
          viewCamera.far = 80;
          viewCamera.updateProjectionMatrix();
        }
        if (obj.name === "CAM") cameraParent = obj;
        if (!obj.isMesh) return;
        if (obj.name.includes("Cube")) {
          obj.visible = false;
          return;
        }
        if (obj.name === "path_reveal") {
          obj.material = pathRevealMaterial;
          obj.renderOrder = 1;
          return;
        }
        if (obj.name === "circle_reveal") {
          obj.material = circleRevealMaterial;
          obj.renderOrder = 1;
          return;
        }
        if (obj.name.toLowerCase().includes("light")) {
          obj.geometry = obj.geometry.clone();
          const count = obj.geometry.attributes.position.count;
          const params = new Float32Array(count * 4);
          const offset = lightIndex / 7;
          const intervalRand = 0.5 + Math.random() * 0.5;
          for (let i = 0; i < count; i++) {
            params[i * 4] = 0.75;
            params[i * 4 + 1] = offset;
            params[i * 4 + 2] = intervalRand;
            params[i * 4 + 3] = 1;
          }
          obj.geometry.setAttribute("a_params", new THREE.BufferAttribute(params, 4));
          obj.material = pathMaterial;
          obj.renderOrder = 2;
          obj.frustumCulled = false;
          lightIndex += 1;
          return;
        }
        obj.material = bodyMaterial;
      });
      const dustCount = 1000;
      const dustBase = new Float32Array(dustCount * 3);
      const dustSeeds = new Float32Array(dustCount);
      for (let i = 0; i < dustCount; i++) {
        dustBase[i * 3] = (Math.random() - 0.5) * 4;
        dustBase[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
        dustBase[i * 3 + 2] = -1 + (Math.random() - 0.5) * 14.5;
        dustSeeds[i] = Math.random() * 6.28318;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustBase.slice(), 3));
      const dustMaterial = new THREE.PointsMaterial({
        color: new THREE.Color("#a8c0ee"),
        size: 0.1,
        map: softDisc(),
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      const dust = new THREE.Points(dustGeo, dustMaterial);
      dust.frustumCulled = false;
      scene.add(dust);
      const lineCount = 250;
      const lineBase = new Float32Array(lineCount * 2);
      const linePositions = new Float32Array(lineCount * 6);
      for (let i = 0; i < lineCount; i++) {
        const x = (Math.random() - 0.5) * 13.5;
        const y = (Math.random() - 0.5) * 13;
        const z = 19.4 + (Math.random() - 0.5) * 54.3;
        lineBase[i * 2] = x;
        lineBase[i * 2 + 1] = y;
        linePositions[i * 6] = x;
        linePositions[i * 6 + 1] = y;
        linePositions[i * 6 + 2] = z;
        linePositions[i * 6 + 3] = x;
        linePositions[i * 6 + 4] = y;
        linePositions[i * 6 + 5] = z - 2;
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color("#c9d8f6"),
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const wind = new THREE.LineSegments(lineGeo, lineMaterial);
      wind.frustumCulled = false;
      scene.add(wind);
      let mixer = null;
      let clipDuration = HOLD_VIEW.clipDuration;
      if (main.animations[0]) {
        clipDuration = main.animations[0].duration || clipDuration;
        mixer = new THREE.AnimationMixer(main.scene);
        const action = mixer.clipAction(main.animations[0]);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixer.setTime(0);
      }
      draco.dispose();

      const camera2 = viewCamera.clone();
      camera2.fov = viewCamera.fov;
      camera2.near = viewCamera.near;
      camera2.far = viewCamera.far;
      camera2.updateProjectionMatrix();
      const camera2Parent = new THREE.Group();
      camera2Parent.add(camera2);
      scene.add(camera2Parent);
      const camera2Frames = [];
      const bakeDuration = Math.min(CAMERA2_BAKE_SECONDS, clipDuration);
      const bakeSteps = CAMERA2_BAKE_STEPS;
      if (mixer && bakeDuration > 0) {
        for (let step = 0; step <= bakeSteps; step += 1) {
          mixer.setTime((step / bakeSteps) * bakeDuration);
          main.scene.updateMatrixWorld(true);
          camera2Frames.push({
            position: viewCamera.getWorldPosition(new THREE.Vector3()),
            quaternion: viewCamera.getWorldQuaternion(new THREE.Quaternion())
          });
        }
        mixer.setTime(0);
      }
      const revealSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(revealSize);
      const revealTarget = new THREE.WebGLRenderTarget(
        Math.max(1, revealSize.x),
        Math.max(1, revealSize.y),
        { type: THREE.HalfFloatType, depthBuffer: true }
      );

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, viewCamera));
      composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        HOLD_VIEW.bloomStrength,
        HOLD_VIEW.bloomRadius,
        HOLD_VIEW.bloomThreshold
      ));
      const fisheyePass = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          tReveal: { value: revealTarget.texture },
          uRadius: { value: 0 },
          uStrength: { value: 0 },
          uAspect: { value: window.innerWidth / window.innerHeight },
          uTime: { value: 0 }
        },
        vertexShader: fisheyeVertex(),
        fragmentShader: fisheyeFragment()
      });
      fisheyePass.enabled = false;
      composer.addPass(fisheyePass);
      composer.addPass(new OutputPass());

      const aim = { x: 0, y: 0 };
      let scrollTarget = 0;
      let scrollY = 0;
      const pointer = { x: 0, y: 0, clientX: 0, clientY: 0 };
      let hold = createHoldState();
      let lastNow = 0;
      const holdCursor = document.getElementById("hold-cursor");
      const progressRing = holdCursor ? holdCursor.querySelector(".hold-cursor-progress") : null;
      const ringLength = Math.PI * 2 * 71;
      if (progressRing) {
        progressRing.style.strokeDasharray = String(ringLength);
        progressRing.style.strokeDashoffset = String(ringLength);
      }
      let cursorX = 0;
      let cursorY = 0;
      let cursorSeen = false;
      let ringStarted = 0;

      function inHoldZone(event) {
        const target = event.target;
        if (!target || !target.closest) return false;
        if (!target.closest(".hero")) return false;
        if (target.closest("a, button, .nav")) return false;
        return true;
      }
      function endHold() {
        hold = releaseHold(hold);
        document.documentElement.classList.remove("is-holding");
        if (holdCursor) holdCursor.classList.remove("is-holding");
        if (progressRing) progressRing.style.strokeDashoffset = String(ringLength);
      }
      function onPointer(event) {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
        pointer.clientX = event.clientX;
        pointer.clientY = event.clientY;
        if (!finePointer || !holdCursor) return;
        if (!cursorSeen) {
          cursorX = event.clientX;
          cursorY = event.clientY;
          cursorSeen = true;
          holdCursor.classList.add("is-visible");
        }
        holdCursor.classList.toggle("is-hidden", !inHoldZone(event) && !hold.playing);
      }
      if (holdListenersEnabled(reduce)) {
        window.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || !inHoldZone(event)) return;
          hold = pressHold(hold);
          ringStarted = performance.now();
          document.documentElement.classList.add("is-holding");
          document.documentElement.classList.add("is-scene");
          if (holdCursor) {
            holdCursor.classList.add("is-holding");
            holdCursor.classList.remove("is-hidden");
          }
        });
        window.addEventListener("pointerup", endHold);
        window.addEventListener("pointercancel", endHold);
        window.addEventListener("pointermove", onPointer);
      }

      function fogSpan(open, elapsed) {
        let near = span(open, 0.09, 0.135, 3.5, 3.5);
        let far = span(open, 0.09, 0.135, 5, 7.5);
        near = span(open, 0.135, 0.2, near, 3);
        far = span(open, 0.135, 0.2, far, 5.5);
        near = span(open, 0.2, 0.566, near, 4.25);
        far = span(open, 0.2, 0.566, far, 6.5);
        near = span(open, 0.566, 0.566, near, 4.25);
        far = span(open, 0.566, 0.761, far, 8.25);
        near = span(open, 0.566, 1, near, 5.5);
        far = span(open, 0.566, 1, far, 9);
        near += Math.sin(elapsed * 1.5 + 0.5) * 0.11 + Math.sin(elapsed * 2.7975 + 1.4) * 0.06 + Math.sin(elapsed * 5.3925 + 2.9) * 0.03;
        far += Math.sin(elapsed * 1.5 + 0.25) * 0.11 + Math.sin(elapsed * 3.1275 + 0.8) * 0.06 + Math.sin(elapsed * 4.8225 + 3.2) * 0.03;
        if (near > far) {
          const swap = near;
          near = far;
          far = swap;
        }
        if (far - near < 0.02) far = near + 0.02;
        return { near: near, far: far };
      }

      function draw(now) {
        const time = now * 0.001;
        const dt = lastNow === 0 ? 0 : Math.min(0.05, time - lastNow);
        lastNow = time;
        if (!reduce) hold = stepHold(hold, dt);
        const clipProgress = clipDuration > 0 ? Math.min(1, hold.time / clipDuration) : 0;
        const eased = pointerAim({
          mouseX: pointer.x,
          mouseY: pointer.y,
          particlesOpacity: hold.particlesOpacity,
          clipProgress: clipProgress,
          aim,
          easing: HOLD_VIEW.aimEasing
        });
        aim.x = eased.x;
        aim.y = eased.y;
        if (mixer) mixer.setTime(Math.min(hold.time, clipDuration));
        const camProgress = introCamProgress(time);
        scrollY += (scrollTarget - scrollY) * 0.12;
        const pose = cameraPose({ camProgress, scroll: scrollY, camProgress2: hold.camProgress2 });
        cameraParent.rotation.set(0, 0, 0);
        cameraParent.rotation.x = aim.y;
        cameraParent.rotation.y = aim.x + pose.yaw;
        cameraParent.position.x = pose.x;
        cameraParent.position.y = pose.y;
        document.documentElement.classList.toggle("is-scene", contentHidden(hold, reduce));
        const lit = hold.fisheyeRadius > 0 ? 0 : clipProgress;
        const swing = Math.sin(span(lit, 0, 0.74, 0, 1) * Math.PI);
        key.position.set(
          span(lit, 0, 1, -86.96, -100) - 70.1 * swing,
          span(lit, 0, 1, 30.43, 17.39) + 39.1 * swing,
          span(lit, 0, 1, 19.57, 100) + 43.5 * swing
        );
        const fog = fogSpan(lit, time);
        scene.fog.near = fog.near;
        scene.fog.far = fog.far;
        scene.fog.color.copy(ground);
        pathMaterial.userData.uniforms.uTime.value = time;
        pathMaterial.userData.uniforms.uPathLightMaxZDistance.value = clipProgress >= 0.5 ? 0 : 7.5;
        const revealT = Math.min(1, Math.max(0, (clipProgress - 0.84) / 0.16));
        pathRevealMaterial.userData.uniforms.uRevealStep.value = 0.892 + (1 - 0.892) * ease4(revealT);
        circleRevealMaterial.userData.uniforms.uRevealMin.value = span(clipProgress, 0.783, 1, 0.72, 0);
        circleRevealMaterial.userData.uniforms.uRevealMax.value = span(clipProgress, 0.783, 1, 1, 0.725);
        dustMaterial.opacity = hold.particlesOpacity * 0.075;
        const dustAttr = dustGeo.getAttribute("position");
        for (let i = 0; i < dustCount; i++) {
          dustAttr.setXYZ(
            i,
            dustBase[i * 3] + Math.sin(time * 1.23 + dustSeeds[i]) * 0.012,
            dustBase[i * 3 + 1] + Math.cos(time * 0.7 + dustSeeds[i]) * 0.02,
            dustBase[i * 3 + 2]
          );
        }
        dustAttr.needsUpdate = true;
        const gate = clipProgress <= 0.325 ? 0 : clipProgress >= 0.375 ? 1 : (clipProgress - 0.325) / 0.05;
        const smooth = gate * gate * (3 - 2 * gate);
        lineMaterial.opacity = hold.lineOpacity * smooth;
        const lineAttr = lineGeo.getAttribute("position");
        const lineFloor = 19.4 - 27.15;
        for (let i = 0; i < lineCount; i++) {
          const shifted = lineFloor + ((lineBase[i * 2] * 0 + 19.4 + (i / lineCount - 0.5) * 54.3 - time * 1.6) - lineFloor);
          const wrapped = lineFloor + ((shifted - lineFloor) % 54.3 + 54.3) % 54.3;
          const x = lineBase[i * 2];
          const y = lineBase[i * 2 + 1];
          lineAttr.setXYZ(i * 2, x, y, wrapped);
          lineAttr.setXYZ(i * 2 + 1, x, y, wrapped - 2);
        }
        lineAttr.needsUpdate = true;
        if (finePointer && holdCursor && cursorSeen) {
          cursorX += (pointer.clientX - cursorX) * 0.2;
          cursorY += (pointer.clientY - cursorY) * 0.2;
          holdCursor.style.transform = "translate(" + cursorX + "px," + cursorY + "px) translate(-50%, -50%)";
          if (hold.playing && progressRing) {
            const filled = Math.min(1, (performance.now() - ringStarted) / 9000);
            progressRing.style.strokeDashoffset = String(ringLength * (1 - filled));
          }
        }
        fisheyePass.enabled = hold.fisheyeActive;
        fisheyePass.uniforms.uRadius.value = hold.fisheyeRadius;
        fisheyePass.uniforms.uStrength.value = hold.fisheyeActive ? 1 : 0;
        fisheyePass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
        fisheyePass.uniforms.uTime.value = time;
        if (hold.fisheyeActive && camera2Frames.length) {
          const sample = camera2Sample(camera2Frames.length, hold.camera2Time, bakeDuration);
          const fromFrame = camera2Frames[sample.index];
          const toFrame = camera2Frames[sample.next];
          camera2.position.lerpVectors(fromFrame.position, toFrame.position, sample.alpha);
          camera2.quaternion.slerpQuaternions(fromFrame.quaternion, toFrame.quaternion, sample.alpha);
          camera2Parent.rotation.copy(cameraParent.rotation);
          camera2Parent.position.copy(cameraParent.position);
          camera2Parent.updateMatrixWorld(true);
          const previousTarget = renderer.getRenderTarget();
          renderer.setRenderTarget(revealTarget);
          renderer.clear();
          renderer.render(scene, camera2);
          renderer.setRenderTarget(previousTarget);
          fisheyePass.uniforms.tReveal.value = revealTarget.texture;
        }
        composer.render();
      }

      function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        viewCamera.aspect = width / height;
        viewCamera.updateProjectionMatrix();
        camera2.aspect = width / height;
        camera2.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);
        renderer.getDrawingBufferSize(revealSize);
        revealTarget.setSize(Math.max(1, revealSize.x), Math.max(1, revealSize.y));
        paintBackdrop();
      }
      resize();
      window.addEventListener("resize", resize);

      const sheet = document.querySelector(".sheet");
      const stage = document.querySelector(".stage");
      function readScroll() {
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const scrollY = window.scrollY || 0;
        scrollTarget = stripScroll(scrollY, rect.top + scrollY, rect.height, window.innerHeight);
      }
      readScroll();
      window.addEventListener("scroll", readScroll, { passive: true });

      if (reduce) {
        document.querySelectorAll(".clip").forEach(function (clip) {
          const node = clip.querySelector("video");
          if (node) node.pause();
          clip.classList.add("is-ended");
        });
        draw(2800);
      } else {
        const loop = (now) => {
          const open = !sheet || sheet.getBoundingClientRect().top > 24;
          if (open && document.visibilityState !== "hidden") draw(now);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch (error) {
      console.error(error);
    }
  </script>
</body>
</html>
`;
}
