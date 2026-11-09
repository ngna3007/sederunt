#!/usr/bin/env node
const origin = process.env.SEDERUNT_RECOVERY_ORIGIN;
const secret = process.env.SEDERUNT_RECOVERY_SECRET;
if (!origin || !secret) {
  console.error("Set SEDERUNT_RECOVERY_ORIGIN and SEDERUNT_RECOVERY_SECRET.");
  process.exitCode = 1;
} else {
  try {
    const url = new URL("/api/recovery/drain", origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS for a remote recovery endpoint.");
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }), redirect: "error", signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Recovery endpoint returned HTTP ${response.status}.`);
    console.log("Recovery batch completed. Inspect the admin recovery status for remaining jobs.");
  } catch (error) {
    console.error(error.message.startsWith("Recovery endpoint returned HTTP") || error.message.startsWith("Use HTTPS") ? error.message : "Recovery request failed. Check the endpoint and server logs.");
    process.exitCode = 1;
  }
}
