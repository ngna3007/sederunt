/**
 * Introduction. A narrow-camera ribbon bundle behind one promise,
 * then a stepped record of what a person can ask, open, and file.
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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500&amp;family=Inter:wght@400;500&amp;display=swap">
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html { overflow-x: clip; background: #050003; }
    body {
      margin: 0;
      background: #050003;
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
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 54px;
    }
    .nav a { text-decoration: none; }
    .nav-name {
      color: #ffffff;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 500;
      font-size: 20px;
      letter-spacing: -0.03em;
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
    .hero-copy, .hero-side, .hero-actions { min-width: 0; }
    .hero-copy { align-self: end; max-width: 680px; }
    .hero-side { align-self: end; max-width: 460px; margin-top: 36px; }
    .hero-side .lede {
      margin-top: 0;
      max-width: none;
      color: #ffffff;
      font-size: clamp(17px, 1.35vw, 22px);
      line-height: 1.45;
      font-weight: 500;
    }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
    .hero-actions .btn {
      flex: 1 1 168px;
      min-width: 0;
      min-height: 64px;
      padding: 0 14px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    a.btn.quiet {
      background: rgba(22, 8, 18, 0.62);
      color: #ffffff;
      backdrop-filter: blur(10px);
    }
    h1, h2, .roster li, .who {
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      letter-spacing: -0.03em;
    }
    h1, h2 { margin: 0; line-height: 0.96; }
    h1 { font-size: clamp(3.1rem, 6vw, 5.25rem); max-width: min(11em, 100%); color: #ffffff; }
    h2 { font-size: clamp(2.4rem, 4.6vw, 3.6rem); max-width: 12em; color: #172b76; }
    .mark {
      background: linear-gradient(90deg, #ff488b, #e33adb);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .lede { margin-top: 18px; max-width: 34rem; color: rgba(255, 255, 255, 0.92); }
    .cta { margin-top: 22px; }
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
    a.btn.filled { background: #ff488b; color: #101421; }
    a.btn:hover { filter: brightness(0.97); }
    a:focus-visible { outline: 2px solid #ff488b; outline-offset: 2px; }
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
      overflow: hidden;
      margin-top: clamp(3.5rem, 2.8944rem + 2.4845vw, 6rem);
      margin-bottom: clamp(3.5rem, 2.8944rem + 2.4845vw, 6rem);
      color: #ffffff;
    }
    .pass-row {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      width: max-content;
      height: 40px;
      margin: 0 auto;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 500;
      letter-spacing: -0.04em;
      white-space: nowrap;
    }
    .pass-row span {
      display: flex;
      flex: 0 0 100px;
      align-items: center;
      justify-content: center;
      width: 100px;
      height: 40px;
      font-size: 16px;
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
      background: #ff488b;
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
    .journey, .faq, .close { width: 100%; padding: 72px 20px 28px; }
    .close { padding-bottom: 96px; }
    .journey-head h2, .journey-to {
      max-width: 10em;
      font-size: clamp(3.2rem, 6.4vw, 5.6rem);
    }
    .journey-to {
      margin: 0;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      letter-spacing: -0.03em;
      line-height: 0.96;
      color: #172b76;
    }
    .journey-rule {
      width: 1px;
      height: 72px;
      margin: 22px 0;
      background: repeating-linear-gradient(to bottom, rgba(23, 43, 118, 0.45) 0 1px, transparent 1px 6px);
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
    .step { padding: 48px 0 28px; }
    .step-kicker {
      color: rgba(23, 43, 118, 0.5);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .step h3 {
      margin: 12px 0 0;
      max-width: 12em;
      font-family: Outfit, Inter, sans-serif;
      font-weight: 300;
      font-size: clamp(2.2rem, 4vw, 3.4rem);
      letter-spacing: -0.03em;
      line-height: 0.96;
      color: #172b76;
    }
    .step p, .bridge, .aside, .faq-item p {
      margin-top: 14px;
      max-width: 34rem;
      color: rgba(23, 43, 118, 0.78);
      font-weight: 400;
    }
    .files { display: grid; gap: 10px; margin-top: 22px; max-width: 360px; }
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
      gap: 10px;
      max-width: 760px;
      margin-top: 28px;
    }
    .roster li {
      display: inline-flex;
      align-items: center;
      height: 44px;
      padding: 0 16px;
      border-radius: 7px;
      background: #ffffff;
      color: #172b76;
      border: 1px solid rgba(23, 43, 118, 0.12);
      font-weight: 500;
      font-size: 16px;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .term {
      margin: 36px 0 0;
      max-width: 880px;
      background: #101421;
      color: #f4efe6;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(16, 20, 33, 0.16);
    }
    .term-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      min-height: 46px;
      padding: 0 18px;
      color: rgba(244, 239, 230, 0.62);
      font-size: 13px;
      font-weight: 500;
      border-bottom: 1px solid rgba(244, 239, 230, 0.12);
    }
    .term-body { display: grid; gap: 14px; padding: 22px 22px 26px; }
    .prompt, .answer { margin: 0; }
    .prompt {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 15px;
      line-height: 1.55;
      font-weight: 400;
      color: #f4efe6;
    }
    .amber { color: #e6a15a; }
    .answer { max-width: 40rem; font-weight: 400; color: rgba(244, 239, 230, 0.92); }
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
    .faq { padding-top: 48px; }
    .faq h2 { margin-bottom: 28px; }
    .faq-list { display: grid; gap: 12px; max-width: 51.125rem; }
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
      font-weight: 400;
      line-height: 1.45;
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
    .hero h1, .hero .lede, .hero .cta {
      animation: rise 0.9s cubic-bezier(0, 0, 0.2, 1) both;
    }
    .hero .lede { animation-delay: 0.08s; }
    .hero .cta { animation-delay: 0.14s; }
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
      .hero-actions { flex-direction: column; }
    }
    @media (min-width: 640px) {
      .pass-row { height: 52px; }
      .pass-row span { flex-basis: 136px; width: 136px; height: 52px; font-size: 20px; }
    }
    @media (hover: hover) and (pointer: fine) {
      .stage, .hero { cursor: pointer; }
      a, a * { cursor: pointer; }
    }
    @media (hover: none), (pointer: coarse) {
      .hold-cursor { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; }
    }
    @media (min-width: 720px) {
      .hero, .journey, .faq, .close { padding-left: 40px; padding-right: 40px; }
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
      .journey-body {
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr);
        column-gap: 64px;
        align-items: start;
      }
      .rail {
        position: sticky;
        top: 0;
        align-self: start;
        flex-direction: column;
        justify-content: center;
        gap: 46px;
        height: 100svh;
        margin: 0;
        padding: 0 0 0 16px;
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
      .step { min-height: 78vh; display: flex; flex-direction: column; justify-content: center; }
      .who { grid-template-columns: 1fr 1fr; gap: 0; max-width: 920px; }
      .who p + p { padding-left: 40px; border-left: 1px solid rgba(23, 43, 118, 0.14); }
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
      <a class="nav-name" href="/">Sederunt</a>
      <a class="nav-record btn" href="/record">Record</a>
    </nav>
    <div class="hero-copy">
      <h1>Keep the decision<br>from the <span class="mark">meeting.</span></h1>
    </div>
    <div class="hero-side">
      <p class="lede">The upload fails twice in standup. Ask tomorrow, from the agent you already use. Nothing is filed until you say yes.</p>
      <p class="cta hero-actions">
        <a class="btn filled" href="/record">Open the record</a>
        <a class="btn quiet" href="#file">How a yes files</a>
      </p>
    </div>
  </header>
  <div class="band">
    <div class="band-line"></div>
    <section class="pass" aria-label="Agents">
      <p class="pass-row">
        <span>Claude Code</span>
        <span>Cursor</span>
        <span>Codex</span>
        <span>Copilot</span>
        <span>Gemini</span>
        <span>Windsurf</span>
        <span>OpenCode</span>
        <span>Claude Code</span>
        <span>Cursor</span>
        <span>Codex</span>
        <span>Copilot</span>
        <span>Gemini</span>
        <span>Windsurf</span>
        <span>OpenCode</span>
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
        <h2>From the thread</h2>
        <div class="journey-rule" aria-hidden="true"></div>
        <p class="journey-to">to the <span class="mark">task.</span></p>
      </div>
      <div class="journey-body">
        <nav class="rail" aria-label="What you can do">
          <a href="#keep" aria-current="true"><i class="sq"></i>Keep</a>
          <a href="#ask"><i class="sq"></i>Ask</a>
          <a href="#open"><i class="sq"></i>Open</a>
          <a href="#hold"><i class="sq"></i>Hold</a>
          <a href="#file"><i class="sq"></i>File</a>
        </nav>
        <div class="steps">
          <article class="step" id="keep">
            <p class="step-kicker">&gt; keep</p>
            <h3>The point stays.</h3>
            <p>In #eng, Mina takes the retry. The cap is three. The same point can be said in a call, or posted as an announcement. Tomorrow you can ask who has it?</p>
          </article>
          <article class="step" id="ask">
            <p class="step-kicker">&gt; ask</p>
            <h3>Ask from the agent you already use.</h3>
            <p class="bridge">Claude Code, Cursor, Codex, or any agent that speaks MCP.</p>
            <ul class="roster">
              <li>Claude Code</li>
              <li>Cursor</li>
              <li>Codex</li>
              <li>Copilot</li>
              <li>Gemini</li>
              <li>Windsurf</li>
              <li>OpenCode</li>
            </ul>
            <figure class="term">
              <div class="term-bar">
                <span>Claude Code</span>
                <span>~/acme</span>
              </div>
              <div class="term-body">
                <p class="prompt"><span class="amber">&gt;</span> what did we lock for the retry, and where is the note?</p>
                <p class="answer"><span class="amber">&#9673;</span> Mina owns it. The cap is three. The note is pricing.pdf, from Friday's announcement.</p>
                <p class="answer"><span class="amber">&#9673;</span> I have not filed it. Say yes and I will file that one task.</p>
              </div>
            </figure>
            <p class="bridge">Cursor and Codex give the same answer.</p>
          </article>
          <article class="step" id="open">
            <p class="step-kicker">&gt; open</p>
            <h3>The announcement keeps its file.</h3>
            <p>Friday's announcement says pricing is final. The sentence is what gets remembered. The files stay separate, and the sentence names them.</p>
            <ul class="files">
              <li><span class="file-kind">PDF</span> pricing.pdf</li>
              <li><span class="file-kind">PNG</span> diagram.png</li>
            </ul>
          </article>
          <article class="step" id="hold">
            <p class="step-kicker">&gt; hold</p>
            <h3>Newest does not win.</h3>
            <div class="who">
              <p>Mina</p>
              <p>Jules</p>
            </div>
            <p class="bridge">The later name does not erase the earlier one. You choose which one is current.</p>
          </article>
          <article class="step" id="file">
            <p class="step-kicker">&gt; file</p>
            <h3>Yes files one task.</h3>
            <p>Say yes, and that one task is filed. The cap, the named file, and the rest of the thread stay as they are.</p>
            <p class="aside">One yes files that task in Linear, or puts it on the calendar.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="faq" id="faq" aria-label="Questions">
      <h2>Questions</h2>
      <div class="faq-list">
        <details class="faq-item" open>
          <summary>What can I ask tomorrow?</summary>
          <p>Who owns the work, what was decided, and which file the announcement named. The source can be a Slack thread, a call, or the announcement itself.</p>
        </details>
        <details class="faq-item">
          <summary>Does a question file anything?</summary>
          <p>A question files nothing. It can quote the thread, the call, or the file name.</p>
        </details>
        <details class="faq-item">
          <summary>Where does the PDF go?</summary>
          <p>The announcement is a sentence Sederunt keeps. The PDF and the image are separate files, and the sentence names them. A later question returns that sentence. It does not open the file by itself.</p>
        </details>
        <details class="faq-item">
          <summary>What if two people claim the same work?</summary>
          <p>Both stay. The later claim does not delete the earlier one. You choose which one is current.</p>
        </details>
        <details class="faq-item">
          <summary>What does yes do?</summary>
          <p>Yes files one task. One yes covers that write, and nothing else moves.</p>
        </details>
      </div>
    </section>

    <section class="close">
      <h2>Nothing is filed until you say yes.</h2>
      <p class="cta"><a class="btn filled" href="/record">Open the record</a></p>
    </section>
  </div>
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

    const railLinks = Array.from(document.querySelectorAll(".rail a"));
    const steps = Array.from(document.querySelectorAll(".step"));
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
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const ground = new THREE.Color("#050003");
    const bodyColor = new THREE.Color(0.23, 0, 0.12);
    const pathLightColor = new THREE.Color(0.99, 0.82, 1);

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
      scene.fog = new THREE.Fog("#050003", 3.5, 5);
      scene.environmentIntensity = 0.12;

      const backdropScene = new THREE.Scene();
      const backdropCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
      backdropCamera.position.z = 1;
      const backdropMaterial = new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uColorA: { value: new THREE.Color("#000000") },
          uColorB: { value: new THREE.Color("#2D0B23") },
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
      const key = new THREE.DirectionalLight(new THREE.Color(1, 0.5, 0.97), 6);
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
        color: new THREE.Color("#ff9ee5"),
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
        color: new THREE.Color("#f5a3de"),
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

      function overChrome(event) {
        const target = event.target;
        return Boolean(target && target.closest && target.closest("a, .sheet"));
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
        holdCursor.classList.toggle("is-hidden", overChrome(event) && !hold.playing);
      }
      if (holdListenersEnabled(reduce)) {
        window.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || overChrome(event)) return;
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
