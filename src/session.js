export function createSession() {
  return {
    pending: null,
    spentYes: new Set(),
    items: [],
    standingAllows: [],
    deliveries: new Set(),
    decisions: [],
    actions: [],
    activity: [],
    preferences: [],
    roomSettings: [],
    rooms: [],
    accesses: [],
    log: [],
    events: [],
    nextId: 1,
  };
}

export function proposalIdFor(title) {
  return `proposal:${title}`;
}
