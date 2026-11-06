/**
 * A stored instant, as UTC ISO. Offset forms such as `+07:00` become `Z`.
 * A clock that is not an instant is returned unchanged.
 *
 * @param {string} value
 */
export function toUtcIso(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;
  return new Date(parsed).toISOString();
}
