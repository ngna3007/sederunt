export function createSession() {
  return {
    pending: null,
    spentYes: new Set(),
    items: [],
    standingAllows: [],
  };
}

export function proposalIdFor(title) {
  return `proposal:${title}`;
}
