/** A file route failure. `message` is safe to show; it never carries a key. */
export class FileError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "FileError";
    this.status = status;
    this.code = code;
  }
}

export function publicError(error) {
  const text = error instanceof Error ? error.message : String(error || "The file request failed");
  return text.replace(/suiprivkey[0-9a-z]+/gi, "[redacted]").replace(/0x[0-9a-f]{64,}/gi, "[redacted]").slice(0, 400);
}
