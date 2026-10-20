import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { rememberCompany, rememberPersonal } from "./memory/company.js";

if (process.env.COMPANY_ENV_FILE) {
  const text = readFileSync(process.env.COMPANY_ENV_FILE, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const name = line.slice(0, index);
    const value = line.slice(index + 1).trim();
    if (name === "MEMWAL_PRIVATE_KEY") process.env.COMPANY_MEMWAL_KEY = value;
    if (name === "MEMWAL_ACCOUNT_ID") process.env.COMPANY_MEMWAL_ACCOUNT_ID = value;
    if (name === "MEMWAL_SERVER_URL") process.env.COMPANY_MEMWAL_SERVER = value;
  }
}

function addressOf(hex) {
  try {
    const raw = hex.replace(/^0x/, "");
    const keypair = Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw, "hex")));
    return keypair.getPublicKey().toSuiAddress();
  } catch (error) {
    return `unreadable (${error instanceof Error ? error.name : "error"})`;
  }
}

const report = {
  companyDelegate: process.env.COMPANY_MEMWAL_KEY ? addressOf(process.env.COMPANY_MEMWAL_KEY) : null,
  companyAccount: process.env.COMPANY_MEMWAL_ACCOUNT_ID || null,
  personalAccount: process.env.PERSONAL_MEMWAL_ACCOUNT_ID || null,
  records: [],
  personalError: null,
};

const only = process.env.RECORD_ONLY || "all";
const issueId = process.env.FILED_ISSUE_ID || "";

if (only === "all" || only === "note") {
  report.records.push(await rememberCompany({
    kind: "note",
    text: "Sederunt company note. The Da Nang company trip is in March. Label: seeded demo.",
  }));
}
if (only === "all" || only === "allow") {
  report.records.push(await rememberCompany({
    kind: "allow",
    text: "Sederunt allow. Spoken yes covered one Linear create for the venue ticket. Label: seeded demo.",
  }));
}
if (only === "all" || only === "edit") {
  report.records.push(await rememberCompany({
    kind: "edit",
    text: issueId
      ? `Sederunt edit result. Venue ticket filed as ${issueId}. Label: seeded demo.`
      : "Sederunt edit result. No Linear id was returned, so this edit stays recorded. Label: seeded demo.",
  }));
}

try {
  const personal = await rememberPersonal({
    kind: "note",
    text: "Sederunt private note. This stays on the personal account. Label: seeded demo.",
  });
  report.records.push(personal);
} catch (error) {
  report.personalError = error instanceof Error ? error.message : "personal remember failed";
}

const late = await import("./domain/stamp.js");
report.lateCheckpoint = late.acceptCheckpoint({ checkpoint: 120, knowableAtCheckpoint: 100 });

console.log(JSON.stringify(report, null, 2));
