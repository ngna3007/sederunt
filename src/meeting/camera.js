/**
 * The bot's camera. Paper and navy are the existing Sederunt screen.
 * The word sits low so the frame stays mostly empty, which is the quiet face.
 */
const CAMERA_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
<style>
  html, body { margin: 0; height: 100%; background: #f4f3ef; color: #081428; }
  body {
    display: flex;
    align-items: flex-end;
    box-sizing: border-box;
    padding: 10vh 8vw;
    font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif;
  }
  p { margin: 0; font-size: clamp(3rem, 8vw, 6rem); line-height: 0.9; letter-spacing: -0.04em; }
  span {
    display: block;
    width: 0.55rem;
    height: 0.55rem;
    margin-bottom: 1.2rem;
    background: #172b76;
  }
  small {
    display: block;
    margin-top: 0.8rem;
    color: #172b76;
    font-family: "Source Sans 3", "Avenir Next", "Segoe UI", sans-serif;
    font-size: 1.05rem;
    font-weight: 400;
    letter-spacing: 0;
  }
  .quiet-why {
    margin-top: 0.6rem;
    max-width: 28rem;
    color: #172b76;
    font-family: "Source Sans 3", "Avenir Next", "Segoe UI", sans-serif;
    font-size: 1.05rem;
    font-weight: 400;
    line-height: 1.35;
  }
</style>
</head>
<body>
  <p><span></span>{{name}}<small>Quiet until addressed.</small></p>
  <p class="quiet-why">Say this name, or a trigger, and the line is kept.</p>
</body>
</html>
`;

/** The camera page for one guest name. The product title stays Sederunt. */
export function renderCameraPage(name) {
  const label = escapeName(name);
  return CAMERA_TEMPLATE.replace("{{name}}", label);
}

export const CAMERA_PAGE = renderCameraPage("Maple");

function escapeName(name) {
  return String(name || "Maple")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
