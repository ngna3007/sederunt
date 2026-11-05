/**
 * Account card behavior. No Node imports, so the console can load it.
 * The server still checks the same rules on save.
 */

import {
  defaultWakePhrases,
  phrasesMatch,
  previewLine,
  validateBotName,
  validateWakePhrases,
} from "/console/bot-identity.js";

export function wireBotCard(doc = document) {
  const card = doc.getElementById("bot-card");
  if (!card || card.getAttribute("data-can-edit") !== "true") return;
  const nameInput = doc.getElementById("bot-name");
  const list = doc.getElementById("bot-phrase-list");
  const add = doc.getElementById("bot-add-phrase");
  const save = doc.getElementById("bot-save");
  const preview = doc.getElementById("bot-preview");
  const nameError = doc.getElementById("bot-name-error");
  const phraseError = doc.getElementById("bot-phrase-error");
  const note = doc.getElementById("bot-note");
  if (!nameInput || !list) return;
  let customized = card.getAttribute("data-customized") === "true";
  let painting = false;

  function readPhrases() {
    return Array.prototype.map.call(list.querySelectorAll("input"), (input) => input.value);
  }

  function setError(node, message) {
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function row(value) {
    const li = doc.createElement("li");
    li.className = "bot-phrase-row";
    const input = doc.createElement("input");
    input.type = "text";
    input.maxLength = 40;
    input.value = value;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Wake phrase");
    input.addEventListener("input", () => {
      customized = true;
      card.setAttribute("data-customized", "true");
      refresh();
    });
    const remove = doc.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      customized = true;
      card.setAttribute("data-customized", "true");
      li.remove();
      refresh();
    });
    li.append(input, remove);
    return li;
  }

  function renderRows(phrases) {
    painting = true;
    list.replaceChildren();
    phrases.forEach((phrase) => list.append(row(phrase)));
    if (add) add.hidden = phrases.length >= 5;
    painting = false;
  }

  function refresh() {
    if (painting) return;
    const named = validateBotName(nameInput.value);
    setError(nameError, named.ok ? "" : named.error);
    nameInput.setAttribute("aria-invalid", named.ok ? "false" : "true");
    if (!customized && named.ok) {
      const next = defaultWakePhrases(named.name);
      if (!phrasesMatch(readPhrases(), next)) renderRows(next);
    }
    const phrases = readPhrases();
    const phraseResult = named.ok ? validateWakePhrases(phrases, named.name) : { ok: false, phrases: [], error: "" };
    setError(phraseError, named.ok && !phraseResult.ok ? phraseResult.error : "");
    const shown = named.ok ? named.name : "Adam";
    const shownPhrases = phraseResult.ok ? phraseResult.phrases : defaultWakePhrases(shown);
    if (preview) preview.textContent = previewLine(shown, shownPhrases);
    if (named.ok && phraseResult.ok) {
      customized = !phrasesMatch(phraseResult.phrases, defaultWakePhrases(named.name));
      card.setAttribute("data-customized", customized ? "true" : "false");
    }
    if (add) add.hidden = phrases.length >= 5;
    if (save) save.disabled = !(named.ok && phraseResult.ok);
  }

  nameInput.addEventListener("input", refresh);
  if (add) {
    add.addEventListener("click", () => {
      if (readPhrases().length >= 5) return;
      customized = true;
      card.setAttribute("data-customized", "true");
      list.append(row(""));
      const inputs = list.querySelectorAll("input");
      inputs[inputs.length - 1].focus();
      refresh();
    });
  }
  if (save) {
    save.addEventListener("click", () => {
      const named = validateBotName(nameInput.value);
      const phraseResult = named.ok ? validateWakePhrases(readPhrases(), named.name) : { ok: false };
      if (!named.ok || !phraseResult.ok) {
        refresh();
        return;
      }
      if (note) note.textContent = "Saving.";
      save.disabled = true;
      fetch("/api/bot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: named.name, phrases: phraseResult.phrases }),
      }).then((response) => response.json().then((body) => ({ response, body }))).then(({ response, body }) => {
        if (!response.ok || !body || body.ok !== true) {
          if (note) note.textContent = (body && body.error) || "The bot was not saved.";
          refresh();
          return;
        }
        customized = body.phrasesCustomized === true;
        card.setAttribute("data-customized", customized ? "true" : "false");
        nameInput.value = body.name;
        renderRows(body.phrases || []);
        if (preview) preview.textContent = previewLine(body.name, body.phrases);
        if (note) note.textContent = "Saved.";
        refresh();
      }).catch(() => {
        if (note) note.textContent = "The bot was not saved.";
        refresh();
      });
    });
  }
  renderRows(readPhrases());
  refresh();
}
