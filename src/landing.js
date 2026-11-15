/**
 * Introduction. A narrow-camera ribbon bundle behind one promise,
 * then a stepped record of join, act, remember, multi-tenant, and portable.
 * The pointer eases the camera. Holding plays the ribbons forward.
 * Releasing scrubs them back and opens a fisheye. This page does not post.
 */
import { landingStyle } from "./landing/style.js";
import { landingImportMap } from "./landing/importmap.js";
import { landingMarkup } from "./landing/markup.js";
import { landingScript } from "./landing/script.js";

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
${landingStyle()}  </style>
${landingImportMap()}
</head>
<body>
${landingMarkup()}${landingScript()}
</body>
</html>
`;
}
