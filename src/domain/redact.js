const SECRET = [
  /0x[0-9a-fA-F]{6,}/g,
  /\blin_api_[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bsuiprivkey1[a-z0-9]+/gi,
  /\bBearer\s+\S+/gi,
  /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*\b/g,
];

/** Answers and the decision log omit keys, tokens, and account ids. */
export function redact(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET) text = text.replace(pattern, "");
  return text;
}
