const ACTIONS = new Set(["reset-quota", "restart-demo"]);

export async function handleAdminAction(input, admin) {
  if (input.allow !== true || !ACTIONS.has(input.action) || typeof admin?.commit !== "function") {
    return { allow: "ask", error: "Confirm an admin action first." };
  }
  return { allow: "admin-confirmed", result: await admin.commit(input.action) };
}
