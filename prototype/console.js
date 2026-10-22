(function () {
  var ROOMS = [
    { id: "client-call", workspaceId: "acme", kind: "meeting", title: "Client call", heard: ["Noah", "Mina", "Rowan"], last: "Mina took the call. Noah sent the notes that day." },
    { id: "design", workspaceId: "acme", kind: "channel", title: "Design", heard: ["Mina", "Henry"], last: "The palette stays navy." }
  ];

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
      modal: "onboarding",
      preferences: { linear: "ask", calendar: "ask" },
      events: seedEvents(),
      nextWorkspace: 3
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
      modal: state.modal,
      preferences: { linear: state.preferences.linear, calendar: state.preferences.calendar },
      events: state.events.map(function (e) {
        return {
          id: e.id, workspaceId: e.workspaceId, cut: e.cut, kind: e.kind, state: e.state,
          title: e.title, sentence: e.sentence, room: e.room, who: e.who, fileName: e.fileName, proof: e.proof
        };
      }),
      nextWorkspace: state.nextWorkspace
    };
  }

  function reduce(state, action) {
    var next = copyState(state);
    if (!action || !action.type) return next;
    if (action.type === "open-section") {
      next.section = action.section;
      next.selectedId = null;
      return next;
    }
    if (action.type === "open-workspace") {
      next.openId = action.id;
      next.section = "home";
      next.selectedId = null;
      return next;
    }
    if (action.type === "create-workspace") {
      var name = action.name || ("Workspace " + state.nextWorkspace);
      var id = "workspace-" + state.nextWorkspace;
      next.workspaces.push({ id: id, name: name, kind: "personal" });
      next.nextWorkspace = state.nextWorkspace + 1;
      return next;
    }
    if (action.type === "history-cut") {
      next.historyCut = action.cut;
      next.section = "history";
      return next;
    }
    if (action.type === "history-kind") {
      next.historyKind = action.kind;
      next.section = "history";
      return next;
    }
    if (action.type === "select") {
      next.selectedId = action.id;
      return next;
    }
    if (action.type === "dismiss-modal") {
      next.modal = null;
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
    return next;
  }

  function workspaceOf(state) {
    for (var i = 0; i < state.workspaces.length; i++) {
      if (state.workspaces[i].id === state.openId) return state.workspaces[i];
    }
    return state.workspaces[0];
  }

  function roomsFor(id) {
    return ROOMS.filter(function (r) { return r.workspaceId === id; });
  }

  function countsFor(events) {
    return {
      decisionsKept: events.filter(function (e) { return e.kind === "answer" || e.kind === "kept"; }).length,
      waitingOnYou: events.filter(function (e) { return e.state === "waiting"; }).length,
      sentThisWeek: events.filter(function (e) { return e.state === "sent"; }).length,
      failed: events.filter(function (e) { return e.state === "failed"; }).length
    };
  }

  function historyEvents(state) {
    return state.events.filter(function (e) {
      if (e.workspaceId !== state.openId) return false;
      if (e.cut !== state.historyCut) return false;
      if (state.historyKind === "answers") return e.kind === "answer" || e.kind === "kept";
      if (state.historyKind === "changes") return e.kind === "change";
      if (state.historyKind === "access") return e.kind === "access";
      if (state.historyKind === "settings") return e.kind === "setting";
      return true;
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
    var rooms = roomsFor(ws.id);
    var selected = null;
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].id === state.selectedId) selected = publicEvent(state.events[i]);
    }
    if (!selected) {
      for (var r = 0; r < rooms.length; r++) {
        if (rooms[r].id !== state.selectedId) continue;
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
          cut: null
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
        return { id: r.id, title: r.title, kind: r.kind, last: r.last, heard: r.heard.slice() };
      }),
      preferences: { linear: state.preferences.linear, calendar: state.preferences.calendar },
      selected: selected
    };
    if (state.section === "history") model.events = historyEvents(state).map(publicEvent);
    if (state.section === "record") {
      model.clash = ["Mina owns the notes.", "Noah owns the notes."];
      model.fileName = "notes.pdf";
      model.proofs = ["18442211", "unknown"];
    }
    if (state.section === "people") {
      var names = [];
      roomsFor(ws.id).forEach(function (r) {
        r.heard.forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
      });
      model.people = names;
    }
    return model;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    var rail = nav.map(function (item) {
      return '<button type="button" data-act="open-section" data-section="' + item[0] + '"' + (model.section === item[0] ? ' class="on"' : "") + ">" + item[1] + "</button>";
    }).join("");
    var switcher = model.workspaces.map(function (w) {
      return '<button type="button" data-act="open-workspace" data-id="' + esc(w.id) + '"' + (w.name === model.workspaceName ? ' class="on"' : "") + ">" + esc(w.name) + "</button>";
    }).join("");
    var body = "";
    if (model.section === "home") body = renderHome(model);
    else if (model.section === "history") body = renderHistory(state, model);
    else if (model.section === "rooms") body = renderRooms(model);
    else if (model.section === "people") body = renderPeople(model);
    else if (model.section === "connectors") body = renderConnectors(model);
    else if (model.section === "record") body = renderRecord(model);
    else if (model.section === "chat") body = renderChat();
    var detail = renderDetail(model);
    var modal = "";
    if (model.modal === "onboarding") {
      modal = '<div class="shade" role="presentation"><div class="modal" role="dialog" aria-modal="true"><p class="k">Step 1 of 3</p><h2>Keep the record.</h2><p>This lets ' + esc(model.workspaceName) + ' store what a room decides. The home stays behind this.</p><button type="button" class="go" data-act="dismiss-modal">Dismiss</button></div></div>';
    }
    return '<div class="shell">' +
      '<aside class="rail"><div class="brand">Sederunt</div><div class="switch"><p class="grp">Workspace</p>' + switcher +
      '<button type="button" data-act="create-workspace">Create a workspace</button></div><div class="grp">' + esc(model.workspaceName) + '</div><nav>' + rail + "</nav></aside>" +
      '<div class="center">' + body + "</div>" +
      '<aside class="pane">' + detail + "</aside></div>" + modal;
  }

  function renderHome(model) {
    var c = model.counts;
    var rows = model.rooms.map(function (r) {
      return "<tr data-act=\"select\" data-id=\"" + esc(r.id) + "\"><td>" + esc(r.title) + "</td><td>" + esc(r.kind) + "</td><td>" + esc(r.last) + "</td><td>" + esc(r.heard.join(", ")) + "</td></tr>";
    }).join("");
    if (!rows) rows = "<tr><td colspan=\"4\">No rooms in this workspace.</td></tr>";
    return '<header class="bar"><b>Home</b><span>' + esc(model.workspaceName) + "</span></header>" +
      '<div class="pad"><div class="metrics">' +
      metric("Decisions kept", c.decisionsKept) + metric("Waiting on you", c.waitingOnYou) +
      metric("Sent this week", c.sentThisWeek) + metric("Failed", c.failed) +
      '</div><div class="block"><h3>Rooms</h3><table><tr><th>Room</th><th>Kind</th><th>Last decision</th><th>Heard by</th></tr>' +
      rows + "</table></div></div>";
  }

  function metric(label, n) {
    return '<div class="metric"><span>' + label + "</span><b>" + n + "</b></div>";
  }

  function renderHistory(state, model) {
    var cuts = ["group", "you"].map(function (cut) {
      var label = cut === "group" ? "Group" : "You";
      return '<button type="button" data-act="history-cut" data-cut="' + cut + '"' + (state.historyCut === cut ? ' class="on"' : "") + ">" + label + "</button>";
    }).join("");
    var kinds = [["all", "All"], ["answers", "Answers"], ["changes", "Changes"], ["access", "Access"], ["settings", "Settings"]];
    var kindButtons = kinds.map(function (k) {
      return '<button type="button" data-act="history-kind" data-kind="' + k[0] + '"' + (state.historyKind === k[0] ? ' class="on"' : "") + ">" + k[1] + "</button>";
    }).join("");
    var rows = (model.events || []).map(function (e) {
      return '<tr data-act="select" data-id="' + esc(e.id) + '"><td>' + esc(e.title) + "</td><td>" + esc(e.room) + "</td><td>" + esc(e.who) + "</td><td>" + esc(e.state) + "</td></tr>";
    }).join("");
    return '<header class="bar"><b>History</b><span class="filters">' + cuts + "</span></header>" +
      '<div class="pad"><div class="filters">' + kindButtons + '</div><div class="block"><table><tr><th>What happened</th><th>Room</th><th>Who</th><th>State</th></tr>' +
      rows + "</table></div></div>";
  }

  function renderRooms(model) {
    var rows = model.rooms.map(function (r) {
      return "<tr data-act=\"select\" data-id=\"" + esc(r.id) + "\"><td>" + esc(r.title) + "</td><td>" + esc(r.kind) + "</td><td>" + esc(r.heard.join(", ")) + "</td></tr>";
    }).join("") || "<tr><td colspan=\"3\">No rooms in this workspace.</td></tr>";
    return '<header class="bar"><b>Rooms</b></header><div class="pad"><div class="block"><table><tr><th>Room</th><th>Kind</th><th>Present while the bot was there</th></tr>' + rows + "</table></div></div>";
  }

  function renderPeople(model) {
    var items = (model.people || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") || "<li>No one in this workspace yet.</li>";
    return '<header class="bar"><b>People</b></header><div class="pad"><p>These names were in a room while the bot was there. A display name is not an id.</p><ul>' + items + "</ul></div>";
  }

  function renderConnectors(model) {
    function pref(tool, label) {
      var value = model.preferences[tool];
      return '<div class="line"><div><strong>' + label + "</strong><p>" + esc(value) + '</p></div><span><button type="button" data-act="set-preference" data-id="' + tool + '" data-value="ask"' + (value === "ask" ? ' class="on"' : "") + '>Ask</button><button type="button" data-act="set-preference" data-id="' + tool + '" data-value="do"' + (value === "do" ? ' class="on"' : "") + ">Do</button></span></div>";
    }
    return '<header class="bar"><b>Connectors</b></header><div class="pad"><p>A new tool starts on Ask. Ask waits. Do sends the request you already made.</p><div class="block">' + pref("linear", "Linear") + pref("calendar", "Calendar") + "</div></div>";
  }

  function renderRecord(model) {
    var clash = (model.clash || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    var proofs = (model.proofs || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    return '<header class="bar"><b>Record</b></header><div class="pad"><h3>Both stay</h3><ul>' + clash + "</ul><p>File name: " + esc(model.fileName) + "</p><h3>Proof</h3><ul>" + proofs + "</ul></div>";
  }

  function renderChat() {
    return '<header class="bar"><b>Chat</b></header><div class="pad"><p class="who-line">Rowan</p><p>Who is taking the client call?</p><p class="who-line">Sederunt</p><p>Mina took the call. Noah sent the notes that day.</p></div>';
  }

  function renderDetail(model) {
    var e = model.selected;
    if (!e || e.workspaceId) {
      /* selected public events do not carry workspaceId */
    }
    if (!e) return "<p>Select a row.</p>";
    if (e.kind === "room") {
      return "<p class=\"k\">" + esc(e.state) + "</p><h2>" + esc(e.title) + "</h2><p>" + esc(e.sentence) + "</p><p>Heard by " + esc(e.who) + "</p>";
    }
    var extra = "";
    if (e.state === "waiting") {
      extra = '<div class="acts"><button type="button" class="go" data-act="confirm" data-id="' + esc(e.id) + '">Confirm</button><button type="button" data-act="dismiss" data-id="' + esc(e.id) + '">Dismiss</button></div><p>Confirm covers that change only.</p>';
    }
    var sentence = e.sentence == null ? "" : "<p>" + esc(e.sentence) + "</p>";
    var file = e.fileName ? "<p>File name: " + esc(e.fileName) + "</p>" : "";
    var proof = e.proof ? "<p>Proof: " + esc(e.proof) + "</p>" : "";
    return '<p class="k">' + esc(e.kind) + " · " + esc(e.state) + "</p><h2>" + esc(e.title) + "</h2>" + sentence + file + proof + extra +
      "<p>" + esc(e.room) + " · " + esc(e.who) + "</p>";
  }

  function mount(el) {
    if (!el || !el.addEventListener) return;
    var state = createState();
    function draw() { el.innerHTML = render(state); }
    el.addEventListener("click", function (event) {
      var node = event.target;
      while (node && node !== el && !(node.getAttribute && node.getAttribute("data-act"))) node = node.parentNode;
      if (!node || node === el || !node.getAttribute) return;
      state = reduce(state, {
        type: node.getAttribute("data-act"),
        id: node.getAttribute("data-id"),
        section: node.getAttribute("data-section"),
        cut: node.getAttribute("data-cut"),
        kind: node.getAttribute("data-kind"),
        value: node.getAttribute("data-value")
      });
      draw();
    });
    draw();
  }

  window.SederuntConsole = { createState: createState, reduce: reduce, view: view, mount: mount };
})();
