function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Words on the main screen: the note, the allow, the status, and a Linear id.
 * Account ids and keys are not rendered, even if a caller left them on the item.
 */
export function renderPage(session) {
  const items = session.items || [];
  const pending = session.pending ? renderPending(session) : "";
  const record = items.length
    ? items.map((item) => renderItem(item)).join("\n")
    : `<p class="empty">No notes yet.</p>`;
  const recordButton = session.pending ? "plain" : "filled";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sederunt</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500&amp;family=Inter:wght@400;500&amp;display=swap">
  <style>
    :root { color-scheme: light; }
    html { overflow-x: clip; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #ffffff;
      color: #172b76;
      font-family: Inter, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      overflow-x: clip;
    }
    .stage {
      display: grid;
      gap: 28px;
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 16px 48px;
    }
    h1 {
      margin: 0;
      max-width: 11ch;
      color: #172b76;
      font-family: Outfit, Inter, sans-serif;
      font-size: 2.75rem;
      line-height: 0.96;
      font-weight: 300;
      letter-spacing: -0.03em;
    }
    p { margin: 0; text-wrap: pretty; }
    .rule { margin-top: 16px; max-width: 34rem; }
    #allow { margin-top: 20px; }
    .pending { margin-top: 20px; }
    .text + .text,
    .issue-line + .issue-line,
    .text + .issue-line,
    .issue-line + .text { margin-top: 5px; }
    .issue-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
    }
    .issue-line strong {
      min-width: 5rem;
      font-weight: 500;
    }
    dl { margin: 12px 0 0; }
    dl div {
      display: grid;
      grid-template-columns: 6.5rem minmax(0, 1fr);
      column-gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(23, 43, 118, 0.14);
    }
    dl div:first-child { border-top: 1px solid rgba(23, 43, 118, 0.14); }
    dt, dd { margin: 0; font-weight: 500; }
    dt { color: rgba(23, 43, 118, 0.62); }
    strong { font-weight: 500; font-variant-numeric: tabular-nums; }
    a { color: #172b76; }
    .yes { margin-top: 12px; }
    .record { margin: 0; }
    article + article {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(23, 43, 118, 0.14);
    }
    .panel-wrap { position: relative; min-width: 0; }
    .panel {
      position: relative;
      z-index: 1;
      background: #f7f8fc;
      border: 1px solid rgba(23, 43, 118, 0.12);
      border-radius: 16px;
      padding: 20px 16px 24px;
    }
    .compose {
      display: grid;
      gap: 12px;
      margin-top: 28px;
    }
    .pending form { margin-top: 12px; }
    label { font-weight: 400; }
    textarea {
      width: 100%;
      min-height: 7.5rem;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid #cfd7e7;
      border-radius: 7px;
      background: #ffffff;
      color: #101421;
      font: inherit;
      resize: vertical;
    }
    button {
      appearance: none;
      min-height: 48px;
      min-width: 44px;
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
      cursor: pointer;
    }
    button.filled {
      background: #ff488b;
      color: #101421;
    }
    button:hover { filter: brightness(0.97); }
    textarea:focus-visible,
    button:focus-visible,
    a:focus-visible {
      outline: 2px solid #ff488b;
      outline-offset: 2px;
    }
    @keyframes arrive {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    #items article { animation: arrive 150ms cubic-bezier(0, 0, 0.2, 1); }
    @media (prefers-reduced-motion: reduce) {
      #items article { animation: none; }
      button { filter: none; }
    }
    @media (min-width: 800px) {
      .stage {
        grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
        column-gap: 48px;
        align-items: start;
        padding: 56px 40px 72px;
      }
      h1 { font-size: 3.5rem; }
      .panel { padding: 28px 28px 32px; }
      .compose { margin-top: 32px; }
    }
    @media (min-width: 1100px) {
      h1 { font-size: 4.5rem; }
    }
  </style>
</head>
<body>
  <div class="stage">
    <header class="intro">
      <h1>Sederunt</h1>
      <p class="rule">A ticket is filed only after yes, and only when Linear returns an id.</p>
      <p id="allow">Allow is off.</p>
      ${pending}
    </header>
    <div class="panel-wrap">
      <section class="panel">
        <section class="record" id="items">
          ${record}
        </section>
        <form class="compose" method="post" action="/api/typed">
          <label for="text">Note, question, or ticket</label>
          <textarea id="text" name="text" required></textarea>
          <div><button class="${recordButton}" type="submit">Record</button></div>
        </form>
      </section>
    </div>
  </div>
</body>
</html>
`;
}

function pendingIndex(session) {
  if (!session.pending) return -1;
  let found = -1;
  session.items.forEach((item, index) => {
    if (item.kind === "ticket" && !item.issueId && item.text === session.pending.title) found = index;
  });
  return found;
}

function renderPending(session) {
  const index = pendingIndex(session);
  const item = index >= 0
    ? session.items[index]
    : { status: "recorded", text: session.pending.title, issueId: null };
  return `<section class="pending">
    ${renderText(item.text)}
    ${renderFacts({ status: item.status, issueId: null })}
    <p class="yes">Yes files this write only.</p>
    <form method="post" action="/api/typed">
      <input type="hidden" name="text" value="yes">
      <button class="filled" type="submit">${escapeHtml(writeLabel(session.pending))}</button>
    </form>
  </section>`;
}

function writeLabel(pending) {
  if (pending?.tool === "linear.create_issue" || /file the venue ticket/i.test(pending?.title || "")) {
    return "File venue ticket";
  }
  return "File this write";
}

function renderItem(item) {
  return `<article>
    ${renderText(item.text)}
    ${renderFacts(item)}
  </article>`;
}

function renderText(text) {
  return String(text)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => renderLine(line))
    .join("\n");
}

const ISSUE_STATUSES = ["In Progress", "Backlog", "Todo", "Done", "Duplicate", "Canceled", "Cancelled"];

function renderLine(line) {
  const issue = splitIssueLine(line);
  if (!issue) return `<p class="text">${escapeHtml(line)}</p>`;
  const state = issue.state ? `<span>${escapeHtml(issue.state)}</span>` : "";
  return `<p class="issue-line"><strong>${escapeHtml(issue.id)}</strong><span>${escapeHtml(issue.title)}</span>${state}</p>`;
}

function splitIssueLine(line) {
  const match = /^ROW-\d+\s+/.exec(line);
  if (!match) return null;
  const id = match[0].trim();
  let title = line.slice(match[0].length).trim();
  let state = "";
  for (const word of ISSUE_STATUSES) {
    if (title.endsWith(` ${word}`)) {
      state = word;
      title = title.slice(0, -word.length).trim();
      break;
    }
  }
  return { id, title, state };
}

function renderFacts(item) {
  const linear = item.issueId
    ? `<div><dt>Linear</dt><dd><strong>${issueLink(item.issueId)}</strong></dd></div>`
    : "";
  return `<dl>
    <div><dt>Status</dt><dd>${escapeHtml(item.status)}</dd></div>
    ${linear}
  </dl>`;
}

function issueLink(issueId) {
  const safe = escapeHtml(issueId);
  if (!/^ROW-\d+$/.test(issueId)) return safe;
  const href = `https://linear.app/rowan3007/issue/${issueId}`;
  return `<a href="${href}">${safe}</a>`;
}
