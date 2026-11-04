(function () {
  function seedRooms() {
    return [
      { id: "client-call", workspaceId: "acme", kind: "meeting", title: "Client call", heard: ["Noah", "Mina", "Rowan"], last: "Mina took the call. Noah sent the notes that day.", platform: "google-meet", platformLabel: "Google Meet", channel: "", bot: "Sederunt" },
      { id: "design", workspaceId: "acme", kind: "channel", title: "Design", heard: ["Mina", "Henry"], last: "The palette stays navy.", platform: "slack", platformLabel: "Slack", channel: "#design", bot: "Sederunt" }
    ];
  }

  function seedChat() {
    return [
      { workspaceId: "acme", who: "Rowan", text: "Who is taking the client call?" },
      { workspaceId: "acme", who: "Sederunt", text: "Mina took the call. Noah sent the notes that day." }
    ];
  }

  function seedEvents() {
    return [
      { id: "answer-call", workspaceId: "acme", cut: "group", kind: "answer", state: "answered", title: "Mina took the call. Noah sent the notes that day.", sentence: "Mina took the call. Noah sent the notes that day.", room: "Client call", who: "Noah", fileName: null, proof: "18442211" },
      { id: "file-notes", workspaceId: "acme", cut: "group", kind: "answer", state: "answered", title: "The notes were stored.", sentence: "The notes were stored.", room: "Client call", who: "Mina", fileName: "notes.pdf", proof: "unknown" },
      { id: "sent-eng", workspaceId: "acme", cut: "group", kind: "change", state: "sent", title: "ENG-406 assigned to Rowan.", sentence: "ENG-406 assigned to Rowan.", room: "Client call", who: "Noah", fileName: null, proof: "18442211" },
      { id: "failed-change", workspaceId: "acme", cut: "group", kind: "change", state: "failed", title: "The change is still open.", sentence: "Linear did not accept the change.", room: "This site", who: "Rowan", fileName: null, proof: "unknown" },
      { id: "stopped-fact", workspaceId: "acme", cut: "group", kind: "change", state: "stopped", title: "Nothing was sent.", sentence: "The owner was missing.", room: "Client call", who: "Mina", fileName: null, proof: null },
      { id: "access-henry", workspaceId: "acme", cut: "group", kind: "access", state: "stopped", title: "No decision is shown.", sentence: null, room: "Client call", who: "Henry", fileName: null, proof: null },
      { id: "clash-mina", workspaceId: "acme", cut: "group", kind: "kept", state: "clashing", title: "Mina owns the notes.", sentence: "Mina owns the notes.", room: "Client call", who: "Mina", fileName: null, proof: "18442211" },
      { id: "clash-noah", workspaceId: "acme", cut: "group", kind: "kept", state: "clashing", title: "Noah owns the notes.", sentence: "Noah owns the notes.", room: "Client call", who: "Noah", fileName: null, proof: "18442211" },
      { id: "wait-eng", workspaceId: "acme", cut: "you", kind: "change", state: "waiting", title: "Assign ENG-406 to Rowan.", sentence: "Assign ENG-406 to Rowan.", room: "This site", who: "Rowan", fileName: null, proof: null },
      { id: "wait-review", workspaceId: "acme", cut: "you", kind: "change", state: "waiting", title: "Move the review to Thursday.", sentence: "Move the review to Thursday.", room: "This site", who: "Rowan", fileName: null, proof: null },
      { id: "set-linear", workspaceId: "acme", cut: "you", kind: "setting", state: "recorded", title: "Linear set to Ask.", sentence: "Linear set to Ask.", room: "This site", who: "Rowan", fileName: null, proof: null },
      { id: "private-note", workspaceId: "rowan", cut: "you", kind: "answer", state: "answered", title: "Call the client back tomorrow.", sentence: "Call the client back tomorrow.", room: "Personal", who: "Rowan", fileName: null, proof: null }
    ];
  }

  function createState() {
    return {
      workspaces: [
        { id: "acme", name: "Acme", kind: "company" },
        { id: "rowan", name: "Rowan", kind: "personal" }
      ],
      openId: "acme",
      section: "home",
      historyCut: "group",
      historyKind: "all",
      selectedId: null,
      menu: null,
      modal: "onboarding",
      createDoor: "meeting",
      notice: null,
      preferences: { linear: "ask", calendar: "ask" },
      events: seedEvents(),
      rooms: seedRooms(),
      chat: seedChat(),
      nextWorkspace: 3,
      nextRoom: 3
    };
  }

  function copyState(state) {
    return {
      workspaces: state.workspaces.map(function (w) { return { id: w.id, name: w.name, kind: w.kind }; }),
      openId: state.openId,
      section: state.section,
      historyCut: state.historyCut,
      historyKind: state.historyKind,
      selectedId: state.selectedId,
      menu: state.menu || null,
      modal: state.modal,
      createDoor: state.createDoor === "channel" ? "channel" : "meeting",
      notice: state.notice || null,
      preferences: { linear: state.preferences.linear, calendar: state.preferences.calendar },
      events: state.events.map(function (e) {
        return {
          id: e.id, workspaceId: e.workspaceId, cut: e.cut, kind: e.kind, state: e.state,
          title: e.title, sentence: e.sentence, room: e.room, who: e.who, fileName: e.fileName, proof: e.proof
        };
      }),
      nextWorkspace: state.nextWorkspace,
      nextRoom: state.nextRoom || 3,
      rooms: (state.rooms || []).map(function (r) {
        return {
          id: r.id, workspaceId: r.workspaceId, kind: r.kind, title: r.title,
          heard: r.heard.slice(), last: r.last,
          platform: r.platform || "",
          platformLabel: r.platformLabel || "",
          channel: r.channel || "",
          bot: r.bot || "Sederunt",
          preference: r.preference === "do" ? "do" : "ask",
          voice: roomVoice(r.voice),
          clashRaise: r.clashRaise === true,
          clashWhere: r.clashWhere === "person" ? "person" : "room"
        };
      }),
      chat: (state.chat || []).map(function (m) { return { workspaceId: m.workspaceId, who: m.who, text: m.text }; })
    };
  }

  function hostOf(link) {
    var text = String(link || "").trim().toLowerCase();
    var rest = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    var authority = rest.split("/")[0].split("?")[0].split("@").pop();
    return authority.split(":")[0];
  }

  function hostEnds(host, suffix) {
    return host === suffix || host.slice(-(suffix.length + 1)) === "." + suffix;
  }

  function meetingHost(host) {
    return hostEnds(host, "zoom.us") || hostEnds(host, "meet.google.com") ||
      hostEnds(host, "teams.microsoft.com") || hostEnds(host, "teams.live.com") ||
      hostEnds(host, "webex.com");
  }

  function platformFromHost(host) {
    if (hostEnds(host, "zoom.us")) return { platform: "zoom", platformLabel: "Zoom" };
    if (hostEnds(host, "meet.google.com")) return { platform: "google-meet", platformLabel: "Google Meet" };
    if (hostEnds(host, "teams.microsoft.com") || hostEnds(host, "teams.live.com")) return { platform: "teams", platformLabel: "Teams" };
    if (hostEnds(host, "webex.com")) return { platform: "webex", platformLabel: "Webex" };
    return { platform: "", platformLabel: "" };
  }

  function reduce(state, action) {
    var next = copyState(state);
    if (!action || !action.type) return next;
    if (action.type === "open-section") {
      next.section = action.section;
      next.selectedId = null;
      next.menu = null;
      next.notice = null;
      return next;
    }
    if (action.type === "open-workspace") {
      next.openId = action.id;
      next.section = "home";
      next.selectedId = null;
      next.menu = null;
      return next;
    }
    if (action.type === "toggle-workspaces") {
      next.menu = state.menu === "workspaces" ? null : "workspaces";
      return next;
    }
    if (action.type === "close-menu") {
      next.menu = null;
      return next;
    }
    if (action.type === "create-workspace") {
      var name = action.name || ("Workspace " + state.nextWorkspace);
      var id = "workspace-" + state.nextWorkspace;
      next.workspaces.push({ id: id, name: name, kind: "personal" });
      next.nextWorkspace = state.nextWorkspace + 1;
      next.menu = "workspaces";
      return next;
    }
    if (action.type === "open-waiting") {
      next.section = "history";
      next.historyCut = "you";
      next.historyKind = "all";
      next.selectedId = null;
      next.menu = null;
      next.modal = null;
      next.notice = null;
      return next;
    }
    if (action.type === "history-cut") {
      next.historyCut = action.cut;
      next.section = "history";
      next.selectedId = null;
      return next;
    }
    if (action.type === "history-kind") {
      next.historyKind = action.kind;
      next.section = "history";
      next.selectedId = null;
      return next;
    }
    if (action.type === "select") {
      next.selectedId = action.id;
      next.menu = null;
      return next;
    }
    if (action.type === "close-detail") {
      next.selectedId = null;
      return next;
    }
    if (action.type === "dismiss-modal") {
      next.modal = null;
      next.notice = null;
      return next;
    }
    if (action.type === "open-create") {
      if (workspaceOf(state).kind !== "company") return next;
      next.modal = "create-room";
      next.selectedId = null;
      next.menu = null;
      next.notice = null;
      next.createDoor = "meeting";
      next.section = "rooms";
      return next;
    }
    if (action.type === "create-door") {
      next.createDoor = action.value === "channel" ? "channel" : "meeting";
      next.notice = null;
      next.modal = "create-room";
      return next;
    }
    if (action.type === "join-meeting") {
      var link = String(action.text || "").trim();
      var host = hostOf(link);
      if (!link) {
        next.notice = "Paste a Zoom, Google Meet, Teams, or Webex link.";
        next.modal = "create-room";
        return next;
      }
      if (hostEnds(host, "slack.com") || link.toLowerCase().indexOf("huddle") !== -1) {
        next.notice = "A Slack huddle is not a meeting. Add the bot to the channel.";
        next.modal = "create-room";
        return next;
      }
      if (!meetingHost(host)) {
        next.notice = "That link is not Zoom, Google Meet, Teams, or Webex.";
        next.modal = "create-room";
        return next;
      }
      var place = platformFromHost(host);
      next.rooms.push({
        id: "meeting-" + state.nextRoom,
        workspaceId: state.openId,
        kind: "meeting",
        title: "Waiting for the meeting name",
        heard: [],
        last: "No decision yet.",
        platform: place.platform,
        platformLabel: place.platformLabel,
        channel: "",
        bot: "Sederunt"
      });
      next.nextRoom = state.nextRoom + 1;
      next.modal = null;
      next.notice = null;
      next.section = "rooms";
      next.selectedId = null;
      return next;
    }
    if (action.type === "send-chat") {
      var text = String(action.text || "").trim();
      if (!text) {
        next.notice = "The question is missing.";
        next.section = "chat";
        return next;
      }
      next.chat.push({ workspaceId: state.openId, who: "You", text: text });
      next.chat.push({ workspaceId: state.openId, who: "Sederunt", text: "This page does not write a decision. Ask in the room." });
      next.notice = null;
      next.section = "chat";
      return next;
    }
    if (action.type === "confirm" || action.type === "dismiss") {
      next.events = next.events.map(function (e) {
        if (e.id !== action.id || e.state !== "waiting") return e;
        e.state = action.type === "confirm" ? "sent" : "dismissed";
        return e;
      });
      return next;
    }
    if (action.type === "set-preference") {
      if (action.id === "linear" || action.id === "calendar") {
        next.preferences[action.id] = action.value === "do" ? "do" : "ask";
      }
      return next;
    }
    if (action.type === "set-room-preference") {
      next.rooms = next.rooms.map(function (r) {
        if (r.id !== action.id) return r;
        r.preference = action.value === "do" ? "do" : "ask";
        return r;
      });
      return next;
    }
    if (action.type === "apply-preset") {
      var preset = presetOf(action.value);
      if (!preset) return next;
      next.rooms = next.rooms.map(function (r) {
        if (r.id !== action.id) return r;
        r.voice = preset.voice;
        r.clashRaise = preset.clashRaise;
        r.clashWhere = preset.clashWhere;
        return r;
      });
      return next;
    }
    if (action.type === "set-clash-raise") {
      next.rooms = next.rooms.map(function (r) {
        if (r.id !== action.id) return r;
        r.clashRaise = action.value === "on";
        return r;
      });
      return next;
    }
    if (action.type === "set-clash-where") {
      next.rooms = next.rooms.map(function (r) {
        if (r.id !== action.id) return r;
        r.clashWhere = action.value === "person" && r.platform === "slack" ? "person" : "room";
        return r;
      });
      return next;
    }
    return next;
  }

  function roomVoice(value) {
    if (value === "short" || value === "formal") return value;
    return "plain";
  }

  function presetOf(value) {
    if (value === "short") return { voice: "short", clashRaise: false, clashWhere: "room" };
    if (value === "plain") return { voice: "plain", clashRaise: false, clashWhere: "room" };
    if (value === "formal") return { voice: "formal", clashRaise: true, clashWhere: "room" };
    return null;
  }

  function canMessage(platform) {
    return platform === "slack";
  }

  function workspaceOf(state) {
    for (var i = 0; i < state.workspaces.length; i++) {
      if (state.workspaces[i].id === state.openId) return state.workspaces[i];
    }
    return state.workspaces[0];
  }

  function roomsFor(state) {
    return (state.rooms || []).filter(function (r) { return r.workspaceId === state.openId; });
  }

  function countsFor(events) {
    return {
      decisionsKept: events.filter(function (e) { return e.kind === "answer" || e.kind === "kept"; }).length,
      waitingOnYou: events.filter(function (e) { return e.state === "waiting"; }).length,
      sentThisWeek: events.filter(function (e) { return e.state === "sent"; }).length,
      failed: events.filter(function (e) { return e.state === "failed"; }).length
    };
  }

  function historyBucket(event) {
    if (event.kind === "change") return "action";
    if (event.kind === "answer" || event.kind === "kept") return "question";
    return "other";
  }

  function historyEvents(state) {
    return state.events.filter(function (e) {
      if (e.workspaceId !== state.openId) return false;
      if (e.cut !== state.historyCut) return false;
      if (state.historyKind === "all") return true;
      return historyBucket(e) === state.historyKind;
    });
  }

  function publicEvent(e) {
    return {
      id: e.id,
      kind: e.kind,
      state: e.state,
      title: e.title,
      sentence: e.sentence,
      room: e.room,
      who: e.who,
      fileName: e.fileName,
      proof: e.proof,
      cut: e.cut
    };
  }

  function view(state) {
    var ws = workspaceOf(state);
    var mine = state.events.filter(function (e) { return e.workspaceId === ws.id; });
    var rooms = roomsFor(state);
    var selected = null;
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].id === state.selectedId) selected = publicEvent(state.events[i]);
    }
    if (!selected) {
      for (var r = 0; r < rooms.length; r++) {
        if (rooms[r].id !== state.selectedId) continue;
        var roomEvents = state.events.filter(function (e) {
          return e.workspaceId === ws.id && e.room === rooms[r].title;
        });
        selected = {
          id: rooms[r].id,
          kind: "room",
          state: rooms[r].kind,
          title: rooms[r].title,
          sentence: rooms[r].last,
          room: rooms[r].title,
          who: rooms[r].heard.join(", "),
          fileName: null,
          proof: null,
          cut: null,
          kept: roomEvents.filter(function (e) {
            return e.sentence && (e.kind === "answer" || e.kind === "kept");
          }).map(function (e) { return { id: e.id, sentence: e.sentence, state: e.state }; }),
          waiting: roomEvents.filter(function (e) { return e.state === "waiting"; }).map(function (e) {
            return { id: e.id, sentence: e.sentence };
          }),
          files: roomEvents.filter(function (e) { return e.fileName; }).map(function (e) { return e.fileName; }),
          access: roomEvents.filter(function (e) { return e.kind === "access"; }).map(function (e) { return e.who; }),
          preference: rooms[r].preference === "do" ? "do" : "ask",
          voice: roomVoice(rooms[r].voice),
          clashRaise: rooms[r].clashRaise === true,
          clashWhere: rooms[r].clashWhere === "person" && canMessage(rooms[r].platform) ? "person" : "room",
          canMessage: canMessage(rooms[r].platform)
        };
      }
    }
    var model = {
      section: state.section,
      workspaceName: ws.name,
      workspaceKind: ws.kind,
      workspaces: state.workspaces.map(function (w) { return { id: w.id, name: w.name, kind: w.kind }; }),
      modal: state.modal,
      counts: countsFor(mine),
      rooms: rooms.map(function (r) {
        return {
          id: r.id, title: r.title, kind: r.kind, last: r.last, heard: r.heard.slice(),
          platform: r.platform || (r.kind === "channel" ? "slack" : ""),
          platformLabel: r.platformLabel || (r.kind === "channel" ? "Slack" : kindWord(r.kind)),
          channel: r.channel || "",
          bot: r.bot || "Sederunt"
        };
      }),
      preferences: { linear: state.preferences.linear, calendar: state.preferences.calendar },
      selected: selected,
      createDoor: state.createDoor === "channel" ? "channel" : "meeting",
      notice: state.notice || null,
      chat: (state.chat || []).filter(function (m) { return m.workspaceId === ws.id; }).map(function (m) { return { who: m.who, text: m.text }; })
    };
    if (state.section === "history") model.events = historyEvents(state).map(publicEvent);
    if (state.section === "record") {
      model.clash = ["Mina owns the notes.", "Noah owns the notes."];
      model.fileName = "notes.pdf";
      model.proofs = ["18442211", "unknown"];
    }
    if (state.section === "people") {
      var names = [];
      roomsFor(state).forEach(function (r) {
        r.heard.forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
      });
      model.people = names;
    }
    return model;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function icon(paths) {
    return '<span class="ic"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg></span>";
  }

  function lettersOf(name) {
    return String(name || "").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }

  function pageHeader(title, subHtml, actionsHtml) {
    return '<div class="page-header"><div><h2 class="page-title">' + esc(title) + "</h2>" +
      (subHtml ? '<p class="page-subtitle">' + subHtml + "</p>" : "") +
      '<p class="sample-line">Sample record. This preview does not write.</p></div>' +
      (actionsHtml ? '<div class="page-actions">' + actionsHtml + "</div>" : "") + "</div>";
  }

  function kindWord(kind) {
    if (kind === "meeting") return "Meeting";
    if (kind === "channel") return "Channel";
    return kind;
  }

  function stateWord(value) {
    var words = {
      answered: "Answered",
      sent: "Sent",
      failed: "Failed",
      stopped: "Stopped",
      clashing: "Clashing",
      waiting: "Waiting",
      recorded: "Recorded",
      dismissed: "Dismissed"
    };
    return words[value] || value;
  }

  function render(state) {
    var model = view(state);
    var nav = [
      ["home", "Home"],
      ["rooms", "Rooms"],
      ["history", "History"],
      ["chat", "Chat"],
      ["connectors", "Connectors"],
      ["people", "People"],
      ["record", "Record"]
    ];
    var glyphs = {
      home: '<path d="M2.8 7.1 8 3l5.2 4.1V13H2.8V7.1Z"/>',
      rooms: '<path d="M2.6 3.6h10.8v8.8H2.6z"/><path d="M2.6 6.6h10.8"/>',
      history: '<circle cx="8" cy="8" r="4.6"/><path d="M8 5.6V8l1.7 1.1"/>',
      chat: '<path d="M2.6 3.4h10.8v6.4H6.2L2.6 12.6V3.4Z"/>',
      connectors: '<path d="M6.1 8h3.8"/><circle cx="4.7" cy="8" r="1.35"/><circle cx="11.3" cy="8" r="1.35"/>',
      people: '<circle cx="6" cy="5.6" r="1.7"/><path d="M3.1 12c.5-1.7 1.7-2.5 2.9-2.5s2.4.8 2.9 2.5"/><circle cx="11.2" cy="6.1" r="1.25"/><path d="M10.2 12c.3-1 .9-1.6 1.6-1.6"/>',
      record: '<path d="M4 2.8h5.2L12 5.6V13H4z"/><path d="M9.1 2.9V5.7H12"/><path d="M6 8.2h4M6 10.4h2.6"/>'
    };
    var rail = nav.map(function (item) {
      return '<button type="button" class="sb-link' + (model.section === item[0] ? " active" : "") + '" data-act="open-section" data-section="' + item[0] + '">' + icon(glyphs[item[0]]) + '<span class="label">' + item[1] + "</span></button>";
    }).join("");
    var tick = '<svg class="tick" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.2 6.4 11 12.5 5"/></svg>';
    var switcher = model.workspaces.map(function (w, index) {
      var tone = w.kind === "company" ? "co" : "pe";
      var on = w.name === model.workspaceName;
      return '<button type="button" class="ws ' + tone + (on ? " on" : "") + '" data-act="open-workspace" data-id="' + esc(w.id) + '" aria-label="' + esc(w.name) + '"><span class="av" aria-hidden="true">' + esc(lettersOf(w.name)) + '</span><span class="label">' + esc(w.name) + "</span>" + (on ? tick : '<span class="tick"></span>') + '<span class="n" aria-hidden="true">' + (index + 1) + "</span></button>";
    }).join("");
    var body = "";
    if (model.section === "home") body = renderHome(model);
    else if (model.section === "history") body = renderHistory(state, model);
    else if (model.section === "rooms") body = renderRooms(model);
    else if (model.section === "people") body = renderPeople(model);
    else if (model.section === "connectors") body = renderConnectors(model);
    else if (model.section === "record") body = renderRecord(model);
    else if (model.section === "chat") body = renderChat(model);
    var modal = "";
    if (model.modal === "onboarding") {
      modal = '<div class="shade" role="presentation"><div class="modal" data-act="noop" role="dialog" aria-modal="true" aria-labelledby="onboard-title"><div class="modal-head"><button type="button" class="btn btn-icon btn-ghost modal-x" data-act="dismiss-modal" aria-label="Close">×</button><h3 id="onboard-title">The workspace is already here.</h3><p>Home shows what is waiting in ' + esc(model.workspaceName) + ', and the rooms the bot was in. This note sits on top of that.</p></div><div class="modal-foot"><button type="button" class="btn btn-primary" data-act="dismiss-modal">Show the workspace</button></div></div></div>';
    } else if (model.modal === "create-room") {
      modal = renderCreate(model);
    }
    var detail = model.modal ? "" : renderDetail(model);
    var logo = '<svg class="mark" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#081428"/><rect x="5.5" y="5.5" width="21" height="21" rx="6.5" fill="none" stroke="#faf8f5" stroke-width="1.7"/><path d="M10.25 20.25h8" fill="none" stroke="#faf8f5" stroke-width="1.7" stroke-linecap="round"/><circle cx="21.15" cy="20.25" r="1.7" fill="#8ebcff"/></svg>';
    var chev = '<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8"/></svg>';
    var plus = icon('<path d="M8 3.2v9.6M3.2 8h9.6"/>');
    var menuOpen = state.menu === "workspaces";
    var chipKind = model.workspaceKind === "personal" ? " pe" : "";
    var menu = menuOpen
      ? '<div class="org-menu" role="menu">' + switcher + '<div class="sb-divider"></div><button type="button" class="sb-link" data-act="create-workspace">' + plus + '<span class="label">Create a workspace</span></button></div>'
      : "";
    return '<div class="app-shell"><header class="topnav"><button type="button" class="brand" data-act="open-section" data-section="home">' + logo + "Sederunt</button>" +
      '<div class="org-wrap"><button type="button" class="org-switcher' + chipKind + (menuOpen ? " open" : "") + '" data-act="toggle-workspaces" aria-expanded="' + (menuOpen ? "true" : "false") + '" aria-label="Current workspace"><span class="av" aria-hidden="true">' + esc(lettersOf(model.workspaceName)) + "</span>" + esc(model.workspaceName) + chev + "</button>" + menu + '</div><span class="user-av" aria-hidden="true">RN</span></header>' +
      '<div class="app-shell-body"><aside class="ds-sidebar"><p class="ds-section-label">' + esc(model.workspaceName) + "</p>" + rail + '</aside>' +
      '<div class="main"><div class="page">' + body + "</div></div></div>" + modal + detail + "</div>";
  }

  function renderHome(model) {
    var c = model.counts;
    var bring = "";
    if (!model.rooms.length && model.workspaceKind === "company") {
      bring = '<button type="button" class="btn btn-primary" data-act="open-create">New room</button>';
    }
    var waiting = c.waitingOnYou > 0
      ? metric("Waiting on you", c.waitingOnYou, "Confirm one change", " attention", "open-waiting")
      : metric("Waiting on you", c.waitingOnYou, "Nothing is waiting");
    return pageHeader("Home", "What is waiting, and which rooms heard it.") + '<div class="stat-row">' +
      metric("Decisions kept", c.decisionsKept, "Stored in this workspace") +
      waiting +
      metric("Sent", c.sentThisWeek, "The tool accepted it") +
      metric("Failed", c.failed, "Still open") +
      '</div><section class="room-section"><div class="section-head"><div><h2 class="section-title">Rooms</h2><p class="section-note">Meetings and channels the bot was in.</p></div>' + bring + "</div>" +
      roomBlocks(model) + "</section>";
  }

  function metric(label, n, sub, extraClass, act) {
    var inner = '<div class="lbl">' + esc(label) + '</div><div class="val">' + n + '</div><div class="sub">' + esc(sub) + "</div>";
    var cls = "stat" + (extraClass || "");
    if (act) return '<button type="button" class="' + cls + '" data-act="' + act + '">' + inner + "</button>";
    return '<div class="' + cls + '">' + inner + "</div>";
  }

  function renderHistory(state, model) {
    var cuts = ["group", "you"].map(function (cut) {
      var on = state.historyCut === cut;
      var label = cut === "group" ? "Group" : "You";
      return '<button type="button" class="hist-cut' + (on ? " on" : "") + '" data-act="history-cut" data-cut="' + cut + '" aria-pressed="' + (on ? "true" : "false") + '">' + label + "</button>";
    }).join("");
    var kinds = [["all", "All"], ["question", "Questions"], ["action", "Actions"], ["other", "Other"]];
    var kindButtons = kinds.map(function (k) {
      var on = state.historyKind === k[0];
      return '<button type="button" class="hist-kind' + (on ? " on" : "") + '" data-act="history-kind" data-kind="' + k[0] + '" aria-pressed="' + (on ? "true" : "false") + '">' + k[1] + "</button>";
    }).join("");
    function historyRow(e) {
      var meta = e.kind === "access"
        ? esc(e.room) + " · " + esc(e.who) + " asked"
        : esc(e.room) + " · " + esc(e.who);
      var tone = e.state === "clashing" || e.state === "waiting" ? " attention" : (e.state === "failed" ? " failed" : "");
      return '<button type="button" class="hist-row" data-act="select" data-id="' + esc(e.id) + '"><span class="hist-main"><span class="hist-title">' + esc(e.title) + '</span><span class="hist-meta">' + meta + '</span></span><span class="hist-end"><span class="hist-state' + tone + '">' + esc(stateWord(e.state)) + '</span><span class="chev" aria-hidden="true">›</span></span></button>';
    }
    var events = model.events || [];
    var buckets = [["question", "Questions"], ["action", "Actions"], ["other", "Other"]];
    var sections = buckets.map(function (bucket) {
      var rows = events.filter(function (e) { return historyBucket(e) === bucket[0]; }).map(historyRow).join("");
      if (!rows) return "";
      var heading = state.historyKind === "all" ? "<h3>" + bucket[1] + "</h3>" : "";
      return '<section class="hist-group">' + heading + '<div class="hist">' + rows + "</div></section>";
    }).join("");
    var list = sections || '<p class="hist-empty">Nothing in this view.</p>';
    var sub = state.historyCut === "you" ? "What you asked." : "What a room heard.";
    return pageHeader("History", sub) +
      '<div class="hist-bar"><div class="hist-cuts">' + cuts + '</div><div class="hist-kinds">' + kindButtons + "</div></div>" +
      list;
  }

  function renderRooms(model) {
    var bring = model.workspaceKind === "company"
      ? '<button type="button" class="btn btn-primary" data-act="open-create">New room</button>'
      : "";
    return pageHeader("Rooms", "Present while the bot was there.", bring) + roomBlocks(model);
  }

  function roomBlocks(model) {
    if (!model.rooms.length) {
      var empty = model.workspaceKind === "personal"
        ? "Private notes stay in this workspace. They are never shared as rooms."
        : "No rooms yet. Bring the bot into a meeting or a channel.";
      return '<p class="room-empty">' + empty + "</p>";
    }
    return '<div class="room-board">' + model.rooms.map(function (r) {
      return roomBlock(r, model.selected && model.selected.id === r.id);
    }).join("") + "</div>";
  }

  function roomBlock(r, selected) {
    var typeWord = r.platformLabel || kindWord(r.kind);
    var where = r.channel ? r.channel + " · " + typeWord : typeWord;
    return '<button type="button" class="room-block' + (selected ? " sel" : "") + '" data-act="select" data-id="' + esc(r.id) + '">' +
      '<span class="room-head">' + platformMark(r.platform) +
      '<span class="room-id"><span class="room-name">' + esc(r.title) + "</span>" +
      '<span class="room-where">' + esc(where) + "</span></span></span>" +
      '<span class="room-foot">' + peopleFaces(r.heard) +
      '<span class="room-bot" aria-label="Bot ' + esc(r.bot || "Sederunt") + '">' + botFace() +
      "<span>" + esc(r.bot || "Sederunt") + "</span></span></span></button>";
  }

  function peopleFaces(heard, silent) {
    if (!heard.length) return '<span class="room-people quiet">No one is recorded yet</span>';
    var shown = heard.slice(0, 4);
    var extra = heard.length - shown.length;
    var faces = shown.map(function (name) {
      return '<span class="mem t' + avatarTone(name) + '" aria-hidden="true">' + esc(initialsOf(name)) + "</span>";
    }).join("");
    if (extra > 0) faces += '<span class="mem more" aria-hidden="true">+' + extra + "</span>";
    var label = silent ? "" : ' aria-label="' + esc(heard.join(", ")) + '"';
    return '<span class="room-people"' + label + ">" + faces + "</span>";
  }

  function avatarTone(name) {
    var s = String(name || "").trim().toLowerCase();
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h, 9) + s.charCodeAt(i)) >>> 0;
    return h % 8;
  }

  function initialsOf(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  }

  function botFace() {
    return '<svg class="bot-av" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#172b76"/><rect x="9.2" y="12.2" width="4.2" height="2.4" rx="0.7" fill="#faf8f5"/><rect x="18.6" y="12.2" width="4.2" height="2.4" rx="0.7" fill="#faf8f5"/><rect x="11.2" y="19.2" width="9.6" height="1.8" rx="0.9" fill="#8ebcff"/></svg>';
  }

  function platformMark(platform) {
    var marks = {
      "google-meet": '<rect x="2" y="6" width="12.4" height="12" rx="2.2" fill="#1e8e3e"/><path fill="#f9ab00" d="M2 8.7 5.6 6H4.2A2.2 2.2 0 0 0 2 8.2v.5z"/><path fill="#d93025" d="M2 15.2v.6A2.2 2.2 0 0 0 4.2 18h1.4L2 15.2z"/><path fill="#1a73e8" d="M14.2 9.5 20.6 6c.5-.3 1.2.1 1.2.7v10.6c0 .6-.7 1-1.2.7l-6.4-3.5V9.5z"/>',
      slack: '<path fill="#E01E5A" d="M8.1 14.5a1.7 1.7 0 1 1-1.7-1.7h1.7v1.7zm.9 0a1.7 1.7 0 0 1 3.4 0v4.3a1.7 1.7 0 1 1-3.4 0v-4.3z"/><path fill="#36C5F0" d="M9 8.1A1.7 1.7 0 1 1 10.7 6.4V8.1H9zm0 .9a1.7 1.7 0 0 1 0 3.4H4.7a1.7 1.7 0 0 1 0-3.4H9z"/><path fill="#2EB67D" d="M15.9 9a1.7 1.7 0 1 1 1.7 1.7h-1.7V9zm-.9 0a1.7 1.7 0 1 1-3.4 0V4.7a1.7 1.7 0 0 1 3.4 0V9z"/><path fill="#ECB22E" d="M15 15.9a1.7 1.7 0 1 1-1.7 1.7v-1.7H15zm0-.9a1.7 1.7 0 0 1 0-3.4h4.3a1.7 1.7 0 0 1 0 3.4H15z"/>',
      zoom: '<rect width="24" height="24" rx="6" fill="#0B5CFF"/><path fill="#fff" d="M5 8.2h8.2c.7 0 1.2.5 1.2 1.2v5.2c0 .7-.5 1.2-1.2 1.2H5c-.7 0-1.2-.5-1.2-1.2V9.4c0-.7.5-1.2 1.2-1.2z"/><path fill="#fff" d="M15 10.4 19.1 8.2c.4-.2.9.1.9.6v6.4c0 .5-.5.8-.9.6L15 13.6v-3.2z"/>',
      teams: '<rect width="24" height="24" rx="6" fill="#5B5FC7"/><circle cx="15.4" cy="8" r="1.8" fill="#fff"/><circle cx="9.2" cy="9.3" r="2.5" fill="#fff"/><path fill="#fff" d="M4.8 16.8c.4-2.1 2.1-3.3 4.4-3.3s4 1.2 4.4 3.3c.1.5-.3 1.1-.9 1.1H5.7c-.6 0-1-.6-.9-1.1z"/><path fill="#fff" d="M13.4 13.7c1.5.2 2.6 1.1 3 2.4.2.5-.2.9-.7.9h-1.8c.2-.8.1-1.8-.5-3.3z"/>',
      webex: '<rect width="24" height="24" rx="6" fill="#0E7C66"/><circle cx="7.2" cy="12" r="1.5" fill="#fff"/><circle cx="12" cy="12" r="1.5" fill="#fff"/><circle cx="16.8" cy="12" r="1.5" fill="#fff"/>'
    };
    var body = marks[platform] || '<rect x="2" y="2" width="20" height="20" rx="6" fill="#081428"/>';
    return '<span class="room-mark"><svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg></span>";
  }

  function renderPeople(model) {
    var people = model.people || [];
    var rows = people.map(function (n) {
      return '<div class="account-row"><span class="av-sm" aria-hidden="true">' + esc(lettersOf(n)) + '</span><div class="grow"><strong>' + esc(n) + "</strong><p>Heard in a room</p></div></div>";
    }).join("");
    if (!rows) rows = '<div class="account-row"><div class="grow"><strong>No one in this workspace yet.</strong></div></div>';
    return pageHeader("People", "These names were in a room while the bot was there. A display name is not an id.") + '<div class="card">' + rows + "</div>";
  }

  function renderConnectors(model) {
    function pref(tool, label) {
      var value = model.preferences[tool];
      function opt(v, name) {
        return '<button type="button" class="btn btn-sm' + (value === v ? " on" : "") + '" data-act="set-preference" data-id="' + tool + '" data-value="' + v + '">' + name + "</button>";
      }
      var line = value === "do" ? "Do sends the request you already made." : "Ask waits.";
      return '<div class="account-row"><div class="grow"><strong>' + label + "</strong><p>" + line + '</p></div><span class="seg">' + opt("ask", "Ask") + opt("do", "Do") + "</span></div>";
    }
    return pageHeader("Connectors", "A new tool starts on Ask. Ask waits. Do sends the request you already made.") +
      '<div class="card">' + pref("linear", "Linear") + pref("calendar", "Calendar") + "</div>";
  }

  function renderRecord(model) {
    var clash = (model.clash || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    var proofs = (model.proofs || []).map(function (s) {
      return '<span class="badge badge-outline mono">' + esc(s) + "</span>";
    }).join("");
    return pageHeader("Record", "Two claims stay. The file name is kept.") +
      '<div class="stack"><div class="card"><div class="card-header"><div><div class="card-title">Both stay</div><p class="card-desc">Neither claim replaces the other.</p></div></div><ul class="plain">' + clash + '</ul></div>' +
      '<div class="card"><div class="account-row"><div class="grow"><strong>File name</strong><p class="mono">' + esc(model.fileName) + '</p></div></div>' +
      '<div class="account-row"><div class="grow"><strong>Proof</strong><div class="proofs">' + proofs + "</div></div></div></div></div>";
  }

  function renderChat(model) {
    var lines = (model.chat || []).map(function (m) {
      return '<div class="msg"><div class="who">' + esc(m.who) + "</div><p>" + esc(m.text) + "</p></div>";
    }).join("");
    if (!lines) lines = '<div class="msg"><p>Nothing has been asked here yet.</p></div>';
    var error = model.notice ? '<p class="form-error">' + esc(model.notice) + "</p>" : "";
    return pageHeader("Chat", "Ask about what this workspace already kept. A question here does not store a decision.") +
      '<div class="card thread">' + lines + "</div>" +
      '<div class="composer"><input class="input" data-field="message" placeholder="Ask about this workspace" aria-label="Message">' +
      '<button type="button" class="btn btn-primary" data-act="send-chat">Send</button></div>' + error;
  }

  function renderCreate(model) {
    var meetingOn = model.createDoor !== "channel";
    var door = meetingOn
      ? '<label class="field" for="meeting-link">Meeting link</label><input id="meeting-link" class="input" data-field="meeting-link" placeholder="https://zoom.us/j/123" aria-label="Meeting link" autocomplete="off"><p class="hint">Zoom, Google Meet, Teams, or Webex. The meeting supplies the title and who is there. A Slack huddle is not this door.</p>'
      : '<p>A channel is a room only when the bot is already in it. Design is already in this workspace. A Slack huddle is the voice call inside Slack, not this door.</p>';
    var error = model.notice ? '<p class="form-error">' + esc(model.notice) + "</p>" : "";
    var submit = meetingOn ? '<div class="modal-foot"><button type="button" class="btn btn-primary" data-act="join-meeting">Join with this link</button></div>' : "";
    return '<div class="shade" data-act="dismiss-modal" role="presentation"><div class="modal" data-act="noop" role="dialog" aria-modal="true" aria-labelledby="create-title"><div class="modal-head"><button type="button" class="btn btn-icon btn-ghost modal-x" data-act="dismiss-modal" aria-label="Close">×</button><h3 id="create-title">New room</h3><p>A room appears after the bot is there. This does not ask for a room name or a list of people.</p></div><div class="modal-body"><div class="choice"><button type="button" class="choice-btn' + (meetingOn ? " on" : "") + '" data-act="create-door" data-value="meeting"><strong>Meeting</strong><span>Paste a meeting link</span></button><button type="button" class="choice-btn' + (meetingOn ? "" : " on") + '" data-act="create-door" data-value="channel"><strong>Channel</strong><span>A channel the bot is in</span></button></div>' + door + error + "</div>" + submit + "</div></div>";
  }

  function fileBlock(title, inner) {
    return '<section class="file-block"><h4>' + title + "</h4>" + inner + "</section>";
  }

  function fileMark(name) {
    var ext = String(name || "").split(".").pop().toLowerCase();
    var label = (ext || "file").slice(0, 4).toUpperCase();
    var band = ext === "pdf" ? "#b42318" : "#172b76";
    return '<svg class="file-ico" viewBox="0 0 32 40" width="32" height="40" aria-hidden="true"><rect x="4" y="2" width="24" height="36" rx="3" fill="#fffcf8" stroke="#172b76" stroke-width="1.5"/><path d="M18 3.2 27 12h-7a2 2 0 0 1-2-2V3.2z" fill="#e4e8f2" stroke="#172b76" stroke-width="1.2"/><path d="M4 28h24v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7z" fill="' + band + '"/><text x="16" y="35.2" text-anchor="middle" fill="#ffffff" font-size="7.5" font-weight="700" font-family="Inter, sans-serif">' + esc(label) + "</text></svg>";
  }

  function fileTile(name) {
    return '<div class="file-tile">' + fileMark(name) + '<span class="mono">' + esc(name) + "</span></div>";
  }

  function detailFrame(kicker, title, body, kickerClass) {
    var klass = kickerClass || "k";
    var label = klass === "kind" ? ' aria-label="' + esc(kindWord(kicker)) + '"' : "";
    return '<div class="shade" data-act="close-detail" role="presentation"><div class="modal detail" data-act="noop" role="dialog" aria-modal="true"><div class="modal-head"><button type="button" class="btn btn-icon btn-ghost modal-x" data-act="close-detail" aria-label="Close">×</button><p class="' + klass + '"' + label + ">" + esc(kicker) + "</p><h3>" + esc(title) + '</h3></div><div class="modal-body">' + body + "</div></div></div>";
  }

  function renderDetail(model) {
    var e = model.selected;
    if (!e) return "";
    if (e.kind === "room") {
      var names = e.who ? e.who.split(", ").filter(Boolean) : [];
      var heardLine = names.length
        ? '<p class="heard">' + peopleFaces(names, true) + "<span>Heard by " + esc(e.who) + "</span></p>"
        : '<p class="heard">No one is recorded yet.</p>';
      var earlier = (e.kept || []).filter(function (item) { return item.sentence !== e.sentence; });
      var kept = earlier.map(function (item) {
        var tone = item.state === "clashing" ? " clash" : "";
        return '<li><button type="button" class="file-row" data-act="select" data-id="' + esc(item.id) + '"><span class="row-main">' + esc(item.sentence) + '</span><span class="row-end"><span class="row-state' + tone + '">' + esc(item.state) + '</span><span class="chev" aria-hidden="true">›</span></span></button></li>';
      }).join("");
      var keptBlock = kept ? fileBlock("Decisions kept", '<ul class="file-rows">' + kept + "</ul>") : "";
      var waiting = (e.waiting || []).map(function (item) {
        return '<li><button type="button" class="file-row" data-act="select" data-id="' + esc(item.id) + '"><span>' + esc(item.sentence) + "</span></button></li>";
      }).join("");
      var files = (e.files || []).filter(function (name, index, list) { return list.indexOf(name) === index; });
      function ledgerRow(title, inner) {
        return '<div class="ledger-row"><span class="ledger-k">' + title + '</span><div class="ledger-v">' + inner + "</div></div>";
      }
      var meta = ledgerRow("Waiting", waiting
        ? '<ul class="file-rows">' + waiting + "</ul>"
        : "No change is waiting in this room.");
      if ((e.access || []).length) {
        meta += ledgerRow("Not invited", esc(e.access.join(", ")) + " asked. No sentence is shown.");
      }
      var fileBoard = files.length
        ? fileBlock(files.length === 1 ? "File" : "Files", '<div class="file-tiles">' + files.map(fileTile).join("") + "</div>")
        : "";
      var ask = e.preference !== "do";
      var voice = roomVoice(e.voice);
      var raise = e.clashRaise === true;
      var where = e.clashWhere === "person" && e.canMessage ? "person" : "room";
      function pick(cls, act, value, label, on) {
        return '<button type="button" class="' + cls + (on ? " on" : "") + '" data-act="' + act + '" data-id="' + esc(e.id) +
          '" data-value="' + value + '" aria-pressed="' + (on ? "true" : "false") + '">' + label + "</button>";
      }
      var voiceLine = voice === "short"
        ? "One sentence."
        : (voice === "formal"
          ? "The decision, who heard it, and the ask when something is waiting."
          : "The decision, and who heard it.");
      var clashLine = !raise
        ? "A clash stays on this page. Both sentences stay."
        : (where === "person"
          ? "The bot asks each person in a direct message. Both sentences stay."
          : "The bot asks in the room. Both sentences stay.");
      var whereRow = e.canMessage
        ? '<div class="where-picks" role="group" aria-label="Where a clash is raised">' +
          pick("where-btn", "set-clash-where", "room", "In the room", where === "room") +
          pick("where-btn", "set-clash-where", "person", "Direct message", where === "person") +
          "</div>"
        : "";
      var setting = '<div class="room-set"><div><strong>Ask first</strong><p>' +
        (ask ? "This room waits before a change." : "This room sends the change.") +
        '</p></div><button type="button" class="switch' + (ask ? " on" : "") + '" role="switch" aria-checked="' +
        (ask ? "true" : "false") + '" aria-label="Ask first" data-act="set-room-preference" data-id="' + esc(e.id) +
        '" data-value="' + (ask ? "do" : "ask") + '"><span class="switch-knob"></span></button></div>' +
        '<div class="room-set"><div><strong>Voice</strong><p>' + voiceLine + '</p></div><div class="voice-picks" role="group" aria-label="Voice">' +
        pick("voice-btn", "apply-preset", "short", "Short", voice === "short") +
        pick("voice-btn", "apply-preset", "plain", "Plain", voice === "plain") +
        pick("voice-btn", "apply-preset", "formal", "Formal", voice === "formal") +
        "</div></div>" +
        '<div class="room-set stack"><div class="room-set-top"><div><strong>Raise a clash</strong><p>' + clashLine +
        '</p></div><button type="button" class="switch' + (raise ? " on" : "") + '" role="switch" aria-checked="' +
        (raise ? "true" : "false") + '" aria-label="Raise a clash" data-act="set-clash-raise" data-id="' + esc(e.id) +
        '" data-value="' + (raise ? "off" : "on") + '"><span class="switch-knob"></span></button></div>' + whereRow + "</div>";
      return detailFrame(e.state, e.title, '<div class="room-file"><p class="stand">' + esc(e.sentence) + "</p>" + heardLine +
        setting + keptBlock + fileBoard + '<div class="file-ledger">' + meta + "</div></div>", "kind");
    }
    var meta = e.kind === "access"
      ? esc(e.who) + " asked · " + esc(e.room)
      : esc(e.room) + " · " + esc(e.who);
    var body = '<p class="hist-meta">' + meta + "</p>";
    if (e.sentence == null) body += "<p>No sentence is shown.</p>";
    else if (e.sentence !== e.title) body += "<p>" + esc(e.sentence) + "</p>";
    if (e.fileName) body += '<div class="file-tiles">' + fileTile(e.fileName) + "</div>";
    if (e.proof) body += '<p class="hist-meta">Proof <span class="mono">' + esc(e.proof) + "</span></p>";
    if (e.state === "waiting") {
      body += '<div class="acts"><button type="button" class="btn btn-primary" data-act="confirm" data-id="' + esc(e.id) + '">Confirm</button><button type="button" class="btn" data-act="dismiss" data-id="' + esc(e.id) + '">Dismiss</button></div><p class="hint">Confirm covers that change only.</p>';
    }
    return detailFrame(stateWord(e.state), e.title, '<div class="room-file hist-detail">' + body + "</div>", "kind");
  }

  function mount(el) {
    if (!el || !el.addEventListener) return;
    var state = createState();
    function fieldText(name) {
      if (!el.querySelector) return "";
      var field = el.querySelector('[data-field="' + name + '"]');
      return field && field.value ? field.value : "";
    }
    function draw() {
      var focusClose = state.modal || state.selectedId;
      el.innerHTML = render(state);
      if (!focusClose || !el.querySelector) return;
      var close = el.querySelector('[aria-label="Close"]');
      if (close && close.focus) close.focus();
    }
    function apply(node, text) {
      var act = node.getAttribute("data-act");
      var actedId = node.getAttribute("data-id");
      state = reduce(state, {
        type: act,
        id: actedId,
        section: node.getAttribute("data-section"),
        cut: node.getAttribute("data-cut"),
        kind: node.getAttribute("data-kind"),
        value: node.getAttribute("data-value"),
        text: text
      });
      draw();
      if (el.querySelector) {
        var again = null;
        if (act === "set-room-preference") again = '.switch[aria-label="Ask first"]';
        if (act === "set-clash-raise") again = '.switch[aria-label="Raise a clash"]';
        if (act === "apply-preset") again = ".voice-btn.on";
        if (act === "set-clash-where") again = ".where-btn.on";
        if (again) {
          var held = el.querySelector(again);
          if (held && held.focus) held.focus();
        }
      }
    }
    el.addEventListener("keydown", function (event) {
      if (!event || (event.key !== "Enter" && event.key !== " ")) return;
      var node = event.target;
      if (!node || !node.getAttribute) return;
      var field = node.getAttribute("data-field");
      if (event.key === "Enter" && (field === "meeting-link" || field === "message")) {
        if (event.preventDefault) event.preventDefault();
        apply({ getAttribute: function (name) {
          if (name === "data-act") return field === "meeting-link" ? "join-meeting" : "send-chat";
          return null;
        } }, node.value || "");
        return;
      }
      if (node.tagName !== "TR" || !node.getAttribute("data-act")) return;
      if (event.preventDefault) event.preventDefault();
      apply(node, "");
    });
    el.addEventListener("click", function (event) {
      var node = event.target;
      while (node && node !== el && !(node.getAttribute && node.getAttribute("data-act"))) node = node.parentNode;
      if (!node || node === el || !node.getAttribute) {
        if (state.menu) {
          state = reduce(state, { type: "close-menu" });
          draw();
        }
        return;
      }
      if (node.getAttribute("data-act") === "noop") return;
      var act = node.getAttribute("data-act");
      var text = "";
      if (act === "join-meeting") text = fieldText("meeting-link");
      if (act === "send-chat") text = fieldText("message");
      apply(node, text);
    });
    if (typeof window.addEventListener === "function") {
      window.addEventListener("keydown", function (event) {
        if (!event || event.key !== "Escape") return;
        if (state.modal) {
          state = reduce(state, { type: "dismiss-modal" });
          draw();
          return;
        }
        if (state.selectedId) {
          state = reduce(state, { type: "close-detail" });
          draw();
          return;
        }
        if (state.menu) {
          state = reduce(state, { type: "close-menu" });
          draw();
        }
      });
    }
    draw();
  }

  window.SederuntConsole = { createState: createState, reduce: reduce, view: view, mount: mount };
})();
