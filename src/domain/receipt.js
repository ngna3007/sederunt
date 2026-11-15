/**
 * Text for a remembered item that already has a Walrus blob id and a Sui
 * transaction digest. A missing id stays blank. This does not invent one.
 *
 * @param {{ blobId?: unknown, digest?: unknown, proof?: { blobId?: unknown, digest?: unknown } } | null | undefined} item
 * @returns {string}
 */
export function formatMemoryReceipt(item) {
  const blobId = idOf(item?.blobId) || idOf(item?.proof?.blobId);
  const digest = idOf(item?.digest) || idOf(item?.proof?.digest);
  if (!blobId || !digest) return "";
  return `Walrus blob ${blobId}. Sui transaction ${digest}. ${explorerTx(digest)}`;
}

/**
 * The console proof line for one remembered item. Same text as
 * {@link formatMemoryReceipt}. The console panel prints it only when it
 * is non-empty.
 *
 * @param {Parameters<typeof formatMemoryReceipt>[0]} decision
 * @returns {string}
 */
export function renderConsoleProof(decision) {
  return formatMemoryReceipt(decision);
}

/**
 * Suiscan transaction link for a digest the caller already holds.
 *
 * @param {string} digest
 */
export function explorerTx(digest) {
  return `https://suiscan.xyz/mainnet/tx/${digest}`;
}

function idOf(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 180) return "";
  if (/[\s<>"'`]/.test(text)) return "";
  return text;
}
