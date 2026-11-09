/**
 * The bot's camera. A blank paper frame. The meeting already shows the
 * guest's name, so this page does not repeat it or explain how to wake the bot.
 */
const CAMERA_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
<style>
  html, body { margin: 0; height: 100%; background: #f4f3ef; }
</style>
</head>
<body></body>
</html>
`;

/** The camera page. The product title stays Sederunt. The guest name is the meeting label, not this frame. */
export function renderCameraPage() {
  return CAMERA_TEMPLATE;
}

export const CAMERA_PAGE = renderCameraPage();
