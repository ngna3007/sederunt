export function askContext(value) {
  const tenantId = typeof value?.tenantId === "string" ? value.tenantId.trim() : "";
  const workspace = value?.workspace;
  if (!tenantId || (workspace !== "company" && workspace !== "personal")) {
    throw new TypeError("Ask context requires a tenant and company or personal workspace.");
  }
  return { tenantId, workspace };
}

export function askContextKey(user, context) {
  const { tenantId, workspace } = askContext(context);
  return Buffer.from(JSON.stringify([user, tenantId, workspace])).toString("base64url");
}

export function askScopeMatches(meta, principal) {
  return Boolean(meta && principal?.user && principal?.tenantId
    && (principal.workspace === "company" || principal.workspace === "personal")
    && meta.user === principal.user && meta.tenantId === principal.tenantId
    && meta.workspace === principal.workspace);
}

/** A request-scoped view; construct only after authenticating current tenant access. */
export function scopeAskStore(store, principal, { deletionVersion } = {}) {
  const context = askContext(principal);
  const user = typeof principal?.user === "string" ? principal.user.trim() : "";
  if (!user) throw new TypeError("Ask context requires an authenticated user.");
  const scope = { user, ...context };
  const owner = (claimed) => {
    if (claimed !== user) throw new TypeError("Ask user does not match the current session.");
  };
  const currentVersion = async () => {
    if (typeof deletionVersion !== "function") return null;
    const version = await deletionVersion();
    if (typeof version !== "string" || !version) throw new Error("Deletion state is unavailable.");
    return version;
  };
  const inScope = (row) => askScopeMatches(row, scope);
  const visible = (row, version) => inScope(row) && (version === null || (row.deletionVersion && row.deletionVersion === version));
  const owned = async (id) => inScope(await store.meta(id));
  const meta = async (id) => {
    const row = await store.meta(id);
    const version = await currentVersion();
    return visible(row, version) ? row : null;
  };
  const filterIds = async (ids) => {
    const rows = await Promise.all(ids.map(meta));
    return ids.filter((_id, index) => rows[index] !== null);
  };
  return {
    kind: store.kind,
    async close() { return store.close?.(); },
    async quota(claimed, limit) { owner(claimed); return store.quota(user, limit); },
    async claim(claimed, limit) { owner(claimed); return store.claim(user, limit); },
    async refund(claimed, key) { owner(claimed); return store.refund(user, key); },
    async create(claimed, question) {
      owner(claimed);
      const version = await currentVersion();
      return store.create(user, question, { ...context, ...(version === null ? {} : { deletionVersion: version }) });
    },
    meta,
    async chunks(id, from = 0) {
      const row = await store.meta(id);
      const before = await currentVersion();
      if (!visible(row, before)) return [];
      const chunks = await store.chunks(id, from);
      const after = await currentVersion();
      return visible(row, after) && before === after ? chunks : [];
    },
    async append(id, text) { if (await owned(id)) return store.append(id, text); },
    async replace(id, text) { if (await owned(id)) return store.replace(id, text); },
    async finish(id, fields) { if (await owned(id)) return store.finish(id, fields); },
    async list(claimed) { owner(claimed); return filterIds(await store.list(user, context)); },
    async overview(claimed, limit) {
      owner(claimed);
      const view = await store.overview(user, limit, context);
      return { quota: view.quota, ids: await filterIds(view.ids) };
    },
    async reads(ids, from = 0) {
      const before = await currentVersion();
      const rows = await store.reads(ids, from);
      const after = await currentVersion();
      return rows.map((row) => before === after && visible(row.meta, after) ? row : { meta: null, chunks: [] });
    },
  };
}
