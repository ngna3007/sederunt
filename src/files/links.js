import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Download links last 15 minutes. */
export const LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Signed download links. The token names one file and one person and expires.
 * Opening it checks that the person can still see the file, so leaving the
 * workspace or deleting the file ends the link early.
 *
 * @param {{ secret?: string, clock?: () => Date | number }} [options]
 */
export function createFileLinks({ secret, clock = () => new Date() } = {}) {
  const key = secret ? String(secret) : randomBytes(32).toString("hex");
  const nowMs = () => {
    const value = clock();
    return value instanceof Date ? value.getTime() : Number(value);
  };
  const sign = (body) => createHmac("sha256", `sederunt-file-link:${key}`).update(body).digest("base64url");
  return {
    issue(fileId, userId) {
      const exp = nowMs() + LINK_TTL_MS;
      const body = Buffer.from(JSON.stringify({ f: fileId, u: userId, exp })).toString("base64url");
      return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
    },
    /** @returns {{ fileId: string, userId: string } | null} */
    open(token, fileId) {
      const [body, mac] = String(token || "").split(".");
      if (!body || !mac) return null;
      const want = Buffer.from(sign(body));
      const got = Buffer.from(mac);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      let payload;
      try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (!payload || payload.f !== fileId || typeof payload.u !== "string" || typeof payload.exp !== "number") return null;
      if (payload.exp <= nowMs()) return null;
      return { fileId: payload.f, userId: payload.u };
    },
  };
}
