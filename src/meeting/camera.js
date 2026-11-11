import { echoShare, utteranceToCommit } from "./agent.js";
import { directRequest } from "./voice.js";
import { lineWaitsForMore } from "./speech-gate.js";

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
  ${utteranceToCommit.toString()}
  ${directRequest.toString()}
  ${echoShare.toString()}
  ${lineWaitsForMore.toString()}
  var params = new URLSearchParams(location.search);
  var guest = document.getElementById("guest");
  var voice = document.getElementById("voice");
  var tileName = params.get("name") || "";
  guest.textContent = tileName;
  var ear = params.get("ear") || "";
  if (!/^[a-f0-9]{32,64}$/.test(ear)) ear = "";
  var botName = "Adam";
  var participantId = "";
  var people = {};
  var direct = false;
  var rosterKnown = false;
  var floorSpeaker = "";
  var floorUntil = 0;
  var lineText = "";
  var lineSpeaker = "";
  var lineParticipant = "";
  var lineWoke = false;
  var committed = null;
  var lastWordAt = 0;
  var playStarted = 0;
  var recentSpeech = [];
  var turnTimer = 0;
  var turnOpen = false;
  var stopAudio = function () {};
  var controllers = [];
  var queue = [];
  var pumping = false;
  var wsWait = 500;
  var socket;
  var socketPosts = 0;
  var turnStartedAt = 0;
  var busyFlagged = false;
  var lastBeat = "";
  var turnController = null;
  // Past the server's own 25 s turn cap, so a slow answer ends with its own done event first.
  var TURN_CAP_MS = 32000;
  // A follow-up question ("What should the issue say?") waits this long. If the asker
  // keeps talking, the rest of their line is the answer and the question is dropped
  // (Nov 11 dry run, bot b38fa40d: Recall split the request at the comma).
  var ASK_HOLD_MS = 1500;
  var heldAsk = null;
  var stats = { asksHeld: 0, asksDropped: 0, msgs: 0, opened: 0, own: 0, echo: 0, commits: 0, asked: 0, skipped: 0, busy: 0, done: 0, errors: 0, stuck: 0, sentences: 0, spoken: 0, speakRetries: 0, speakFailed: 0, socketOpens: 0, socketCloses: 0 };

  function letters(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function unfinished(text) {
    var value = String(text || "").trim();
    if (!value || /\\?$/.test(value)) return false;
    if (lineWaitsForMore(value)) return true;
    var words = value.toLowerCase().replace(/['’]/g, "").replace(/[.,!]+$/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    var tail = words[words.length - 1] || "";
    return tail === "about" || tail === "the" || tail === "and" || tail === "what" || tail === "who" || tail === "when" || tail === "where" || tail === "why" || tail === "how" || tail === "which";
  }

  function endOfTurn(text, quietMs) {
    if (!String(text || "").trim() || !(quietMs >= 0)) return false;
    if (/\\?$/.test(String(text || "").trim())) return quietMs >= 700;
    return quietMs >= (unfinished(text) ? 2500 : 1200);
  }

  function shouldRespond(text, speaker, now, claimedId) {
    var said = String(text || "").trim();
    if (!said) return false;
    var who = letters(speaker);
    if (who && who === letters(botName)) return false;
    if (participantId && claimedId && String(claimedId) === String(participantId)) return false;
    if (direct && directRequest(said)) return true;
    var clock = typeof now === "number" ? now : Date.now();
    if (new RegExp("\\\\b(" + letters(botName) + "|adam|maple)\\\\b", "i").test(said)) return true;
    if (who && who === letters(floorSpeaker) && clock < floorUntil) return true;
    return false;
  }

  function notePerson(id, name) {
    var key = id == null || id === "" ? "" : String(id);
    if (!key) return;
    if (participantId && key === String(participantId)) return;
    if (letters(name) && letters(name) === letters(botName)) return;
    people[key] = 1;
    if (!rosterKnown) direct = Object.keys(people).length === 1;
  }

  function noteSpoken(text, now) {
    var clock = typeof now === "number" ? now : Date.now();
    var kept = [];
    var index = 0;
    for (index = 0; index < recentSpeech.length; index += 1) {
      if (clock - recentSpeech[index].at < 15000) kept.push(recentSpeech[index]);
    }
    kept.push({ text: String(text || ""), at: clock });
    recentSpeech = kept.slice(-12);
  }

  function spokenNow(now) {
    var clock = typeof now === "number" ? now : Date.now();
    var parts = [];
    var index = 0;
    for (index = 0; index < recentSpeech.length; index += 1) {
      if (clock - recentSpeech[index].at < 15000) parts.push(recentSpeech[index].text);
    }
    return parts.join(" ");
  }

  function noteEcho() {
    if (!ear) return;
    fetch("/api/meeting/agent/log", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ echo: true })
    }).catch(function () {});
  }

  function noteGate(gate, text) {
    if (!ear) return;
    var words = String(text || "").split(/\\s+/).filter(Boolean).length;
    fetch("/api/meeting/agent/log", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ gate: gate, words: words, floor: Date.now() < floorUntil, direct: direct })
    }).catch(function () {});
  }

  function noteAnswer(speaker, now, asked) {
    var clock = typeof now === "number" ? now : Date.now();
    floorSpeaker = speaker || "";
    floorUntil = clock + (asked ? 90000 : 20000);
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

  /** Close a turn that never ended. Audio already queued keeps playing. */
  function unstickTurn() {
    turnOpen = false;
    turnStartedAt = 0;
    if (turnController) {
      try { turnController.abort(); } catch (error) {}
      turnController = null;
    }
    if (guest.dataset.state === "thinking" || guest.dataset.state === "tool") setState(playStarted ? "speaking" : "listening");
    if (!ear) return;
    fetch("/api/meeting/agent/cancel", { method: "POST", headers: headers() }).catch(function () {});
  }

  function wokeIn(text) {
    return new RegExp("\\\\b(" + letters(botName) + "|adam|maple)\\\\b", "i").test(String(text || ""));
  }

  function joinLine(left, right) {
    var prior = String(left || "");
    var next = String(right || "");
    if (!prior) return next;
    if (!next) return prior;
    var lead = prior.toLowerCase();
    var tail = next.toLowerCase();
    if (tail.indexOf(lead) === 0) return next;
    if (lead.indexOf(tail) === 0) return prior;
    var size = 0;
    var cap = lead.length < tail.length ? lead.length : tail.length;
    for (var i = cap; i > 0; i -= 1) {
      if (lead.slice(lead.length - i) === tail.slice(0, i)) {
        size = i;
        break;
      }
    }
    if (size > 0) return prior + next.slice(size);
    return prior + " " + next;
  }

  function onTranscript(message) {
    var heard = utteranceToCommit(committed, message, { name: botName, participantId: participantId });
    if (!heard) {
      stats.own += 1;
      return;
    }
    if (echoShare(heard.text, spokenNow()) >= 0.6) {
      stats.echo += 1;
      noteEcho();
      return;
    }
    if (heard.open) stats.opened += 1;
    notePerson(heard.participantId, heard.speaker);
    if (heard.barge && playStarted && Date.now() - playStarted >= 300) barge(wokeIn(heard.text) ? "name" : "word");
    if (!heard.open) return;
    var who = letters(heard.speaker || "");
    var same = lineText && who === letters(lineSpeaker || "");
    if (same) {
      lineText = joinLine(lineText, heard.text);
      if (wokeIn(heard.text)) lineWoke = true;
    } else {
      lineText = heard.text;
      lineWoke = wokeIn(heard.text);
    }
    lineSpeaker = heard.speaker || lineSpeaker;
    lineParticipant = heard.participantId || lineParticipant;
    lastWordAt = Date.now();
    if (heldAsk && heldAsk.who && heldAsk.who === letters(heard.speaker || "")) {
      heldAsk = null;
      stats.asksDropped += 1;
    }
  }

  function maybeCommit() {
    if (turnOpen && turnStartedAt && Date.now() - turnStartedAt > TURN_CAP_MS) {
      // A turn that never ends must not keep the page deaf for the rest of the call.
      stats.stuck += 1;
      unstickTurn();
    }
    if (!lineText || !lastWordAt) return;
    if (!endOfTurn(lineText, Date.now() - lastWordAt)) return;
    if (turnOpen) {
      if (!busyFlagged) {
        busyFlagged = true;
        stats.busy += 1;
      }
      return;
    }
    busyFlagged = false;
    stats.commits += 1;
    var text = lineText;
    var speaker = lineSpeaker;
    var claimed = lineParticipant;
    var woke = lineWoke;
    lineText = "";
    lineWoke = false;
    lastWordAt = 0;
    var ownName = letters(speaker) && letters(speaker) === letters(botName);
    var ownId = participantId && claimed && String(claimed) === String(participantId);
    if (ownName || ownId) {
      committed = { text: text, speaker: speaker };
      return;
    }
    if (!woke && !shouldRespond(text, speaker, Date.now(), claimed)) {
      stats.skipped += 1;
      noteGate("skip", text);
      return;
    }
    committed = { text: text, speaker: speaker };
    ask(text, speaker, claimed);
  }

  function ask(text, speaker, claimed) {
    if (!ear) return;
    stats.asked += 1;
    turnStartedAt = Date.now();
    turnOpen = true;
    setState("thinking");
    clearTimeout(turnTimer);
    turnTimer = setTimeout(function () {
      if (guest.dataset.state === "thinking") cancelTurn();
    }, 6000);
    var controller = track(new AbortController());
    turnController = controller;
    fetch("/api/meeting/agent/turn", {
      method: "POST",
      headers: headers(),
      signal: controller.signal,
      body: JSON.stringify({ text: text, speaker: speaker, participantId: claimed, turn_id: String(Date.now()), people: Object.keys(people) })
    }).then(function (response) {
      if (!response.ok || !response.body) throw new Error("turn");
      return readEvents(response.body, text, speaker, controller);
    }).catch(function () {
      stats.errors += 1;
      if (guest.dataset.state === "thinking") setState("listening");
      turnOpen = false;
    });
  }

  function readEvents(body, userText, speaker, owner) {
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
            if (payload.text && payload.ask && !played.length) {
              holdAsk(payload.text, speaker, owner);
            } else if (payload.text) {
              stats.sentences += 1;
              played.push(payload.text);
              noteSpoken(payload.text, Date.now());
              noteAnswer(speaker, Date.now(), /\\?\\s*$/.test(String(payload.text)));
              enqueue(payload.text);
            }
          }
          if (event === "tool_started") setState("tool");
          if (event === "done") stats.done += 1;
          if (event === "error") stats.errors += 1;
          if (event === "done" || event === "error") {
            turnOpen = false;
            // A turn that ends with nothing to say goes back to listening now, not
            // after the 6 s thinking timer (which also sent a needless cancel).
            // Only the current turn's stream may do this: a late "done" from an
            // older stream must not clear a newer turn's timer or state.
            if (!played.length && !pumping && !queue.length && (!owner || owner === turnController)) {
              clearTimeout(turnTimer);
              setState("listening");
            }
          }
        }
        return pump();
      });
    }
    return pump();
  }

  /** The asker is still talking after the commit: their next words answer the question. */
  function askerContinued(who, since) {
    return Boolean(who && lineText && letters(lineSpeaker || "") === who && lastWordAt > since);
  }

  function holdAsk(text, speaker, owner) {
    var who = letters(speaker || "");
    var since = turnStartedAt;
    // The floor stays with the asker either way, so the rest of their line is heard.
    noteAnswer(speaker, Date.now(), true);
    if (askerContinued(who, since)) {
      stats.asksDropped += 1;
      return;
    }
    stats.asksHeld += 1;
    var mine = { text: text, who: who, since: since };
    heldAsk = mine;
    setTimeout(function () {
      if (heldAsk !== mine) return;
      heldAsk = null;
      if (owner && owner !== turnController) return;
      if (askerContinued(who, since)) {
        stats.asksDropped += 1;
        return;
      }
      stats.sentences += 1;
      noteSpoken(text, Date.now());
      noteAnswer(speaker, Date.now(), true);
      enqueue(text);
      if (ear) {
        fetch("/api/meeting/agent/log", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ sentences: [text] })
        }).catch(function () {});
      }
    }, ASK_HOLD_MS);
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

  function markPlayback() {
    playStarted = Date.now();
    if (window.__sederunt) window.__sederunt.playbackAt = playStarted;
    if (!ear) return;
    fetch("/api/meeting/agent/log", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ playback: true })
    }).catch(function () {});
  }

  function speakOnce(text, controller) {
    return fetch("/api/meeting/agent/speak", {
      method: "POST",
      headers: headers(),
      signal: controller.signal,
      body: JSON.stringify({ text: text })
    }).then(function (response) {
      return response && response.ok ? response : null;
    }).catch(function () { return null; });
  }

  /** A refused or failed line is asked for once more before it is dropped (Nov 11, bot be88aa49). */
  function enqueue(text) {
    var controller = track(new AbortController());
    var job = speakOnce(text, controller).then(function (response) {
      if (response || controller.signal.aborted) return response;
      stats.speakRetries += 1;
      return new Promise(function (resolve) { setTimeout(resolve, 400); }).then(function () {
        return controller.signal.aborted ? null : speakOnce(text, controller);
      });
    }).then(function (response) {
      if (response) stats.spoken += 1;
      else stats.speakFailed += 1;
      return response;
    });
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
    job.then(function (response) {
      if (!response) {
        playNext();
        return;
      }
      playResponse(response, playNext);
    });
  }

  function playResponse(response, next) {
    var readable = response.body && response.body.getReader;
    if (window.MediaSource && MediaSource.isTypeSupported("audio/mpeg") && readable) {
      try {
        streamMpeg(response, next);
        return;
      } catch (error) {}
    }
    if (!response.arrayBuffer) {
      next();
      return;
    }
    response.arrayBuffer().then(function (bytes) {
      playBytes(bytes, next);
    }).catch(function () { next(); });
  }

  function streamMpeg(response, next) {
    var media = new MediaSource();
    voice.src = URL.createObjectURL(media);
    media.addEventListener("sourceopen", function () {
      var source = media.addSourceBuffer("audio/mpeg");
      var reader = response.body.getReader();
      var started = false;
      var pending = [];
      var collected = [];
      var writing = false;
      var settled = false;
      var playing = false;
      var timer = setTimeout(function () { giveUp(); }, 12000);
      function giveUp() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { voice.pause(); } catch (error) {}
        try { reader.cancel(); } catch (error) {}
        if (playing) {
          next();
          return;
        }
        var total = 0;
        var index = 0;
        for (index = 0; index < collected.length; index += 1) total += collected[index].byteLength || collected[index].length || 0;
        if (!total) {
          next();
          return;
        }
        var merged = new Uint8Array(total);
        var offset = 0;
        for (index = 0; index < collected.length; index += 1) {
          var view = collected[index] instanceof Uint8Array ? collected[index] : new Uint8Array(collected[index]);
          merged.set(view, offset);
          offset += view.byteLength;
        }
        playBytes(merged.buffer, next);
      }
      function writeNext() {
        if (writing || !pending.length) return;
        writing = true;
        var chunk = pending.shift();
        var buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
        var onend = function () {
          source.removeEventListener("updateend", onend);
          writing = false;
          writeNext();
        };
        source.addEventListener("updateend", onend);
        try { source.appendBuffer(buffer); }
        catch (error) {
          writing = false;
          giveUp();
        }
      }
      function finish() {
        if (writing || pending.length) {
          source.addEventListener("updateend", function wait() {
            source.removeEventListener("updateend", wait);
            finish();
          });
          return;
        }
        if (media.readyState === "open") {
          try { media.endOfStream(); } catch (error) {}
        }
        if (!started) giveUp();
      }
      function pull() {
        reader.read().then(function (step) {
          if (step.done) {
            finish();
            return;
          }
          if (step.value) {
            pending.push(step.value);
            collected.push(step.value);
          }
          if (!started && step.value) {
            started = true;
            setState("speaking");
            markPlayback();
            stopAudio = function () {
              try { voice.pause(); } catch (error) {}
              try { reader.cancel(); } catch (error) {}
              clearTimeout(timer);
              playStarted = 0;
            };
            voice.onended = function () {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              playStarted = 0;
              next();
            };
            voice.play().then(function () {
              if (!settled) playing = true;
            }, function () {
              giveUp();
            });
          }
          writeNext();
          pull();
        }).catch(function () { giveUp(); });
      }
      pull();
    });
  }

  function playBytes(bytes, next) {
    var audio = new Uint8Array(bytes);
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
      markPlayback();
      stopAudio = function () {
        try { source.stop(); } catch (error) {}
        playStarted = 0;
      };
      source.onended = function () {
        playStarted = 0;
        next();
      };
      source.start();
    }).catch(function () { next(); });
  }

  function barge(cause) {
    if (!playStarted || Date.now() - playStarted < 300) return;
    if (ear) {
      fetch("/api/meeting/agent/log", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ barge: cause === "name" ? "name" : "word" })
      }).catch(function () {});
    }
    cancelTurn();
  }

  function connectSocket() {
    try { socket = new WebSocket("wss://meeting-data.bot.recall.ai/api/v1/transcript"); }
    catch (error) {
      setTimeout(connectSocket, wsWait);
      wsWait = Math.min(wsWait * 2, 8000);
      return;
    }
    socket.onopen = function () { wsWait = 500; stats.socketOpens += 1; };
    socket.onmessage = function (ev) {
      stats.msgs += 1;
      if (socketPosts < 20 && ear) {
        socketPosts += 1;
        var raw = "";
        try { raw = String(ev.data || "").slice(0, 60000); } catch (error) { raw = ""; }
        if (raw) {
          fetch("/api/meeting/agent/socket", {
            method: "POST",
            headers: headers(),
            body: raw
          }).catch(function () {});
        }
      }
      try { onTranscript(JSON.parse(ev.data)); }
      catch (error) {}
    };
    socket.onerror = function () {};
    socket.onclose = function () {
      stats.socketCloses += 1;
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
      if (!loud && lineText && Date.now() > loudUntil) maybeCommit();
    }, 100);
  }

  setInterval(maybeCommit, 200);

  /** Counts and flags only, never words. Sent when something changed. */
  function beat() {
    if (!ear) return;
    var now = Date.now();
    var row = {};
    for (var key in stats) row[key] = stats[key];
    row.turnOpen = turnOpen;
    row.turnMs = turnOpen && turnStartedAt ? now - turnStartedAt : 0;
    row.waiting = Boolean(lineText);
    row.floor = now < floorUntil;
    row.direct = direct;
    row.people = Object.keys(people).length;
    row.playing = Boolean(playStarted);
    row.state = guest.dataset.state || "";
    var encoded = JSON.stringify(row);
    if (encoded === lastBeat) return;
    lastBeat = encoded;
    fetch("/api/meeting/agent/log", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ beat: row })
    }).catch(function () {});
  }
  setInterval(beat, 5000);
  function applySession(body) {
    if (!body) return;
    if (body.botName) botName = String(body.botName);
    if (body.participantId) participantId = String(body.participantId);
    if (body.direct === true || body.direct === false) {
      rosterKnown = true;
      direct = body.direct === true;
    }
  }

  function pullSession() {
    if (!ear) return;
    fetch("/api/meeting/agent/session", { method: "POST", headers: { "x-meeting-ear": ear } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(applySession)
      .catch(function () {});
  }

  if (ear) {
    pullSession();
    setInterval(pullSession, 2000);
    connectSocket();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(watchLevel).catch(function () {});
    }
  }
  window.__sederunt = {
    shouldRespond: shouldRespond,
    endOfTurn: endOfTurn,
    lineWaitsForMore: lineWaitsForMore,
    noteAnswer: noteAnswer,
    notePerson: notePerson,
    noteSpoken: noteSpoken,
    markPlaying: function (now) { playStarted = typeof now === "number" ? now : Date.now(); },
    stats: function () { return JSON.parse(JSON.stringify(stats)); },
    beat: beat
  };
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
