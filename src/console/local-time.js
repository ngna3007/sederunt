/**
 * "Last tested" in the viewer's zone, with a short zone name.
 * An invalid zone falls back to the local offset, still labeled.
 *
 * @param {unknown} value ISO timestamp
 * @param {string} [timeZone] IANA zone. Omit it to use the viewer's zone.
 */
export function formatLastTested(value, timeZone) {
  function zoneFromOffset(date) {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    if (!minutes) return `GMT${sign}${hours}`;
    return `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
  }

  function fallback(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hour24 = date.getHours();
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 || 12;
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `Last tested ${months[date.getMonth()]} ${date.getDate()}, ${hour}:${minute} ${suffix} ${zoneFromOffset(date)}`;
  }

  const text = String(value || "");
  if (!text) return "Not tested yet";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "Not tested yet";
  const zone = typeof timeZone === "string" && timeZone ? timeZone : undefined;
  try {
    const options = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    };
    if (zone) options.timeZone = zone;
    const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
    let zoneName = "";
    let clock = "";
    for (const part of parts) {
      if (part.type === "timeZoneName") zoneName = part.value;
      else clock += part.value;
    }
    clock = clock.replace(/\u202f/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!zoneName) zoneName = zoneFromOffset(date);
    return `Last tested ${clock} ${zoneName}`;
  } catch {
    return fallback(date);
  }
}
