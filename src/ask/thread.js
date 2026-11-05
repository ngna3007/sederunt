/**
 * Prior asks to show when the Ask AI thread reloads.
 * `asks` is oldest first, which is how GET /api/ask lists them.
 *
 * A finished turn is skipped when its only readable text is the friendly
 * failure ("I couldn't answer that just now…") or tool protocol with no
 * human sentence (missing-member, preference, and the like). The page
 * would otherwise paint each retry as another "You" turn.
 * A streaming turn stays so reload can resume it.
 * Consecutive finished turns that share a question keep the newest.
 * The empty-memory sentence and product prose are real answers and stay.
 *
 * Self-contained on purpose: the console page injects this source into
 * the browser script, so it must not close over module bindings.
 *
 * @param {Array<{
 *   id?: string,
 *   question?: string,
 *   text?: string,
 *   status?: string,
 *   createdAt?: number | string,
 *   result?: { learned?: string, body?: string } | null,
 * }> | null | undefined} asks
 */
export function priorAsksForThread(asks) {
  // Same sentence as ASK_UNAVAILABLE in src/ask/run.js.
  var unavailable = "I couldn't answer that just now. Try again in a moment.";
  var list = Array.isArray(asks) ? asks : [];
  var kept = [];
  for (var i = 0; i < list.length; i += 1) {
    var ask = list[i];
    if (!ask || !ask.id) continue;
    if (ask.status === "streaming") {
      kept.push(ask);
      continue;
    }
    if (onlyUnavailable(readAsk(ask), unavailable)) continue;
    var last = kept.length ? kept[kept.length - 1] : null;
    if (last && last.status !== "streaming" && sameQuestion(last, ask)) {
      if ((Number(ask.createdAt) || 0) >= (Number(last.createdAt) || 0)) kept[kept.length - 1] = ask;
      continue;
    }
    kept.push(ask);
  }
  return kept;

  function readAsk(row) {
    var streamed = humanLines(row.text);
    if (streamed) return streamed;
    var result = row.result;
    if (!result || typeof result !== "object") return "";
    var learned = typeof result.learned === "string" ? result.learned : "";
    var body = typeof result.body === "string" ? result.body : "";
    return humanLines(learned || body);
  }

  // Mirrors humanAskText: drop tool protocol, keep a real sentence.
  function humanLines(raw) {
    var lines = String(raw == null ? "" : raw).split("\n");
    var out = [];
    for (var n = 0; n < lines.length; n += 1) {
      var line = lines[n].trim();
      if (!line || protocol(line)) continue;
      out.push(line);
    }
    return out.join("\n");
  }

  function protocol(line) {
    return /^(?:missing-member|not-invited|duplicate-delivery|recorded|current|clashing|replaced|unknown|filed|updated)$/i.test(line)
      || /^(?:preference|checkpoint)(?:\s+\S+)?$/i.test(line)
      || /^ROW-\d+$/i.test(line);
  }

  function onlyUnavailable(text, failure) {
    if (!text) return true;
    var lines = text.split("\n");
    for (var n = 0; n < lines.length; n += 1) {
      if (lines[n] !== failure) return false;
    }
    return true;
  }

  function sameQuestion(a, b) {
    return String(a.question || "").trim() === String(b.question || "").trim();
  }
}
