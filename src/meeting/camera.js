/**
 * Output Media shows this page as the meeting camera.
 * The page hears mixed meeting audio, reads the Recall transcript socket,
 * and speaks. It does not poll for clips. The ear is the only credential.
 */
const AGENT_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="connect-src 'self' wss://meeting-data.bot.recall.ai">
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
  #guest[data-state="speaking"] { border-bottom-color: #faf8f5; }
  #voice { position: absolute; width: 0; height: 0; }
</style>
</head>
<body>
<p id="guest" data-state="listening"></p>
<audio id="voice"></audio>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var guest = document.getElementById("guest");
  var voice = document.getElementById("voice");
  var tileName = params.get("name") || "";
  guest.textContent = tileName;
  var ear = params.get("ear") || "";
  if (!/^[a-f0-9]{32,64}$/.test(ear)) ear = "";
  var botName = "Adam";
  var participantId = "";
  var floorSpeaker = "";
  var floorUntil = 0;
  var lineText = "";
  var lineSpeaker = "";
  var lineParticipant = "";
  var lastWordAt = 0;
  var playStarted = 0;
  var turnTimer = 0;
  var turnOpen = false;
  var stopAudio = function () {};
  var controllers = [];
  var queue = [];
  var pumping = false;
  var wsWait = 500;
  var socket;

  function letters(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function unfinished(text) {
    var value = String(text || "").trim();
    if (!value || /\\?$/.test(value)) return false;
    var words = value.toLowerCase().replace(/['’]/g, "").replace(/[.,!]+$/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    var tail = words[words.length - 1] || "";
    return tail === "about" || tail === "the" || tail === "and" || tail === "what" || tail === "who" || tail === "when" || tail === "where" || tail === "why" || tail === "how" || tail === "which";
  }

  function endOfTurn(text, quietMs) {
    if (!String(text || "").trim() || !(quietMs >= 0)) return false;
    return quietMs >= (unfinished(text) ? 2500 : 1200);
  }

  function shouldRespond(text, speaker, now, claimedId) {
    var said = String(text || "").trim();
    if (!said) return false;
    var who = letters(speaker);
    if (who && who === letters(botName)) return false;
    if (participantId && claimedId && String(claimedId) === String(participantId)) return false;
    var clock = typeof now === "number" ? now : Date.now();
    if (new RegExp("\\\\b(" + letters(botName) + "|adam|maple)\\\\b", "i").test(said)) return true;
    if (who && who === letters(floorSpeaker) && clock < floorUntil) return true;
    return false;
  }

  function noteAnswer(speaker, now) {
    floorSpeaker = speaker || "";
    floorUntil = (typeof now === "number" ? now : Date.now()) + 20000;
  }

  function setState(state) {
    guest.dataset.state = state || "listening";
  }

  function headers() {
    return { "content-type": "application/json", "x-meeting-ear": ear };
  }

  function track(controller) {
    controllers.push(controller);
    return controller;
  }

  function abortFetches() {
    controllers.forEach(function (controller) {
      try { controller.abort(); } catch (error) {}
    });
    controllers = [];
  }

  function cancelTurn() {
    clearTimeout(turnTimer);
    turnOpen = false;
    abortFetches();
    stopAudio();
    queue = [];
    pumping = false;
    setState("listening");
    if (!ear) return;
    var controller = track(new AbortController());
    fetch("/api/meeting/agent/cancel", { method: "POST", headers: headers(), signal: controller.signal }).catch(function () {});
  }

  function wordsOf(message) {
    var list = null;
    if (message && message.data && message.data.data && Array.isArray(message.data.data.words)) list = message.data.data.words;
    else if (message && message.data && Array.isArray(message.data.words)) list = message.data.words;
    else if (message && message.transcript && Array.isArray(message.transcript.words)) list = message.transcript.words;
    else if (message && Array.isArray(message.words)) list = message.words;
    return list || [];
  }

  function participantOf(message, word) {
    if (word && word.participant) return word.participant;
    if (message && message.data && message.data.data && message.data.data.participant) return message.data.data.participant;
    if (message && message.data && message.data.participant) return message.data.participant;
    if (message && message.participant) return message.participant;
    return null;
  }

  function onTranscript(message) {
    var words = wordsOf(message).filter(function (word) {
      var who = participantOf(message, word);
      var name = who && who.name ? who.name : "";
      var id = who && who.id != null ? String(who.id) : "";
      if (participantId && id && id === String(participantId)) return false;
      if (name && letters(name) === letters(botName)) return false;
      return true;
    });
    if (!words.length) return;
    var last = participantOf(message, words[words.length - 1]) || {};
    lineSpeaker = last.name || lineSpeaker;
    lineParticipant = last.id == null ? lineParticipant : String(last.id);
    lineText = words.map(function (word) { return typeof word === "string" ? word : (word.text || ""); }).join(" ").replace(/\\s+/g, " ").trim();
    lastWordAt = Date.now();
    if (playStarted && Date.now() - playStarted >= 300) barge();
  }

  function maybeCommit() {
    if (!lineText || !lastWordAt || turnOpen) return;
    if (!endOfTurn(lineText, Date.now() - lastWordAt)) return;
    var text = lineText;
    var speaker = lineSpeaker;
    var claimed = lineParticipant;
    lineText = "";
    lastWordAt = 0;
    if (!shouldRespond(text, speaker, Date.now(), claimed)) return;
    ask(text, speaker, claimed);
  }

  function ask(text, speaker, claimed) {
    if (!ear) return;
    turnOpen = true;
    setState("thinking");
    clearTimeout(turnTimer);
    turnTimer = setTimeout(function () {
      if (guest.dataset.state === "thinking") cancelTurn();
    }, 6000);
    var controller = track(new AbortController());
    fetch("/api/meeting/agent/turn", {
      method: "POST",
      headers: headers(),
      signal: controller.signal,
      body: JSON.stringify({ text: text, speaker: speaker, participantId: claimed, turn_id: String(Date.now()) })
    }).then(function (response) {
      if (!response.ok || !response.body) throw new Error("turn");
      return readEvents(response.body, text, speaker);
    }).catch(function () {
      if (guest.dataset.state === "thinking") setState("listening");
      turnOpen = false;
    });
  }

  function readEvents(body, userText, speaker) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var played = [];
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) return logPlayed(userText, played);
        buffer += decoder.decode(step.value, { stream: true });
        var cut;
        while ((cut = buffer.indexOf("\\n\\n")) !== -1) {
          var block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          var event = "message";
          var data = "";
          block.split("\\n").forEach(function (row) {
            if (row.indexOf("event:") === 0) event = row.slice(6).trim();
            if (row.indexOf("data:") === 0) data += row.slice(5).trim();
          });
          if (event === "sentence") {
            clearTimeout(turnTimer);
            var payload = {};
            try { payload = JSON.parse(data); } catch (error) { payload = {}; }
            if (payload.text) {
              played.push(payload.text);
              noteAnswer(speaker, Date.now());
              enqueue(payload.text);
            }
          }
          if (event === "tool_started") setState("tool");
          if (event === "done" || event === "error") turnOpen = false;
        }
        return pump();
      });
    }
    return pump();
  }

  function logPlayed(userText, sentences) {
    turnOpen = false;
    if (!sentences.length || !ear) return;
    fetch("/api/meeting/agent/log", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ sentences: sentences })
    }).catch(function () {});
  }

  function enqueue(text) {
    var controller = track(new AbortController());
    var job = fetch("/api/meeting/agent/speak", {
      method: "POST",
      headers: headers(),
      signal: controller.signal,
      body: JSON.stringify({ text: text })
    }).then(function (response) {
      return response.ok ? response.arrayBuffer() : null;
    }).catch(function () { return null; });
    queue.push(job);
    if (!pumping) playNext();
  }

  function playNext() {
    var job = queue.shift();
    if (!job) {
      pumping = false;
      if (!turnOpen) setState("listening");
      return;
    }
    pumping = true;
    job.then(function (bytes) {
      if (!bytes) {
        playNext();
        return;
      }
      playBytes(bytes, playNext);
    });
  }

  function playBytes(bytes, next) {
    var audio = new Uint8Array(bytes);
    function fallback() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        next();
        return;
      }
      var ctx = playBytes.ctx || new Ctx();
      playBytes.ctx = ctx;
      ctx.decodeAudioData(audio.buffer.slice(0)).then(function (buffer) {
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        setState("speaking");
        playStarted = Date.now();
        stopAudio = function () {
          try { source.stop(); } catch (error) {}
          playStarted = 0;
        };
        source.onended = function () {
          playStarted = 0;
          next();
        };
        source.start();
        if (window.__sederunt) window.__sederunt.playbackAt = Date.now();
      }).catch(function () { next(); });
    }
    if (window.MediaSource && MediaSource.isTypeSupported("audio/mpeg")) {
      try {
        var media = new MediaSource();
        voice.src = URL.createObjectURL(media);
        media.addEventListener("sourceopen", function () {
          var source = media.addSourceBuffer("audio/mpeg");
          source.addEventListener("updateend", function () {
            if (media.readyState === "open") media.endOfStream();
          });
          source.appendBuffer(audio);
        });
        setState("speaking");
        playStarted = Date.now();
        if (window.__sederunt) window.__sederunt.playbackAt = playStarted;
        stopAudio = function () {
          voice.pause();
          playStarted = 0;
        };
        voice.onended = function () {
          playStarted = 0;
          next();
        };
        voice.play().catch(fallback);
        return;
      } catch (error) {}
    }
    fallback();
  }

  function barge() {
    if (!playStarted || Date.now() - playStarted < 300) return;
    cancelTurn();
  }

  function connectSocket() {
    try { socket = new WebSocket("wss://meeting-data.bot.recall.ai/api/v1/transcript"); }
    catch (error) {
      setTimeout(connectSocket, wsWait);
      wsWait = Math.min(wsWait * 2, 8000);
      return;
    }
    socket.onopen = function () { wsWait = 500; };
    socket.onmessage = function (ev) {
      try { onTranscript(JSON.parse(ev.data)); }
      catch (error) {}
    };
    socket.onerror = function () {};
    socket.onclose = function () {
      setTimeout(connectSocket, wsWait);
      wsWait = Math.min(wsWait * 2, 8000);
    };
  }

  function watchLevel(stream) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var source = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    var samples = new Uint8Array(analyser.fftSize);
    var loudUntil = 0;
    setInterval(function () {
      analyser.getByteTimeDomainData(samples);
      var sum = 0;
      for (var i = 0; i < samples.length; i += 1) {
        var delta = samples[i] - 128;
        sum += delta * delta;
      }
      var loud = Math.sqrt(sum / samples.length) > 12;
      if (loud) loudUntil = Date.now() + 400;
      if (playStarted && Date.now() - playStarted >= 300 && loud) barge();
      if (!loud && lineText && Date.now() > loudUntil) maybeCommit();
    }, 100);
  }

  setInterval(maybeCommit, 200);
  if (ear) {
    fetch("/api/meeting/agent/session", { method: "POST", headers: { "x-meeting-ear": ear } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (body) {
        if (!body) return;
        if (body.botName) botName = body.botName;
        if (body.participantId) participantId = String(body.participantId);
      })
      .catch(function () {});
    connectSocket();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(watchLevel).catch(function () {});
    }
  }
  window.__sederunt = { shouldRespond: shouldRespond, endOfTurn: endOfTurn, noteAnswer: noteAnswer };
})();
</script>
</body>
</html>
`;

const SPIKE_SCRIPT = `<script>
(function () {
  var params = new URLSearchParams(location.search);
  var ear = params.get("ear") || "";
  if (!/^[a-f0-9]{32,64}$/.test(ear)) return;
  function post(message) {
    var body;
    try { body = JSON.stringify(message).slice(0, 60000); }
    catch (error) { return; }
    fetch("/api/meeting/spike/transcript", {
      method: "POST",
      headers: { "content-type": "application/json", "x-meeting-ear": ear },
      body: body
    }).catch(function () {});
  }
  post({ event: "spike-page" });
  var ws;
  try { ws = new WebSocket("wss://meeting-data.bot.recall.ai/api/v1/transcript"); }
  catch (error) { post({ event: "ws-error" }); return; }
  ws.onopen = function () { post({ event: "ws-open" }); };
  ws.onclose = function (ev) { post({ event: "ws-close", code: ev && ev.code }); };
  ws.onerror = function () { post({ event: "ws-error" }); };
  ws.onmessage = function (ev) {
    var message;
    try { message = JSON.parse(ev.data); }
    catch (error) { post({ event: "ws-parse" }); return; }
    post(message);
  };
})();
</script>`;

/** The camera page is the meeting agent. A spike page also logs transcript shape. */
export function renderCameraPage(_name, options = {}) {
  if (options?.spike !== true) return AGENT_PAGE;
  return AGENT_PAGE.replace("</body>", `${SPIKE_SCRIPT}\n</body>`);
}

export const CAMERA_PAGE = renderCameraPage();
