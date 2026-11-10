/**
 * The meeting camera. Output Media always shows this page, so the tile is
 * the brand field with the guest's name. Cream on #081428 is the same pair
 * used for type on the dark field. White paper read as a blank avatar.
 * The page polls for a spoken clip. A new clip waits until the current one ends.
 * A stop clears the clip that is playing and anything waiting behind it.
 * A stop from an older poll does not cut a clip a newer poll already started.
 * A clip queued after that stop still plays. The poll ticket is the time it started, so a reloaded page is not stuck behind the previous count.
 * A bare okay is not a stop. The page does not guess from loudness.
 */
const CAMERA_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sederunt</title>
<style>
  html, body { margin: 0; height: 100%; background: #081428; color: #faf8f5; }
  body { display: flex; align-items: center; justify-content: center; }
  #guest {
    max-width: 100%;
    margin: 0;
    padding: 0 48px 12px;
    overflow-wrap: anywhere;
    font-family: system-ui, "Source Sans 3", sans-serif;
    font-size: 64px;
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: 0;
    text-align: center;
    border-bottom: 2px solid transparent;
  }
  #guest.speaking { border-bottom-color: #faf8f5; }
  #voice { position: absolute; width: 0; height: 0; }
</style>
</head>
<body>
<p id="guest"></p>
<audio id="voice"></audio>
<script>
var params = new URLSearchParams(location.search);
var guest = document.getElementById("guest");
var voice = document.getElementById("voice");
guest.textContent = params.get("name") || "";
var ear = params.get("ear") || "";
if (!/^[a-f0-9]{32,64}$/.test(ear)) ear = "";
var playing = false;
var objectUrl = "";
var queue = [];
var pollTicket = 0;
var playedTicket = 0;
var heardAt = 0;

function nextTicket() {
  var now = Date.now();
  var ticket = now > pollTicket ? now : pollTicket + 1;
  pollTicket = ticket;
  return ticket;
}

function mark(on) {
  guest.className = on ? "speaking" : "";
}

function stopTalking() {
  queue = [];
  voice.onended = null;
  voice.pause();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
  voice.removeAttribute("src");
  try { voice.load(); } catch (error) {}
  playing = false;
  mark(false);
}

function startClip(blob) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  voice.src = objectUrl;
  playing = true;
  mark(true);
  voice.onended = function () {
    if (queue.length) {
      startClip(queue.shift());
      return;
    }
    stopTalking();
  };
  voice.play().catch(function () {
    queue = [];
    playing = false;
    mark(false);
  });
}

function playClip(blob) {
  if (playing) {
    queue.push(blob);
    return;
  }
  startClip(blob);
}

function poll() {
  if (!ear) return;
  var ticket = nextTicket();
  fetch("/meeting/voice?ear=" + encodeURIComponent(ear) + "&n=" + ticket, { cache: "no-store" }).then(function (response) {
    var at = Number(response.headers.get("x-sederunt-at")) || 0;
    var stop = response.headers.get("x-sederunt-hold") === "stop";
    if (!response.ok || response.status === 204) return { at: at, stop: stop, blob: null };
    return response.blob().then(function (blob) { return { at: at, stop: stop, blob: blob }; });
  }).then(function (result) {
    if (!result) return;
    if (result.blob && result.blob.size) {
      if (ticket < playedTicket) return;
      if (result.at && result.at < heardAt) return;
      playedTicket = ticket;
      if (result.at) heardAt = result.at;
      playClip(result.blob);
      return;
    }
    if (result.stop && ticket >= playedTicket && (!result.at || result.at >= heardAt)) {
      if (result.at) heardAt = result.at;
      stopTalking();
    }
  }).catch(function () {});
}

if (ear) setInterval(poll, 300);
</script>
</body>
</html>
`;

/** The camera page. The product title stays Sederunt. The script reads the guest name. */
export function renderCameraPage() {
  return CAMERA_TEMPLATE;
}

export const CAMERA_PAGE = renderCameraPage();
