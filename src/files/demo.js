/**
 * Fixed demo workspace for the Files page. The harness asks for a view with
 * `?as=owner|member|admin|empty`. Ids are stable so screenshots do not drift.
 */
export const DEMO_USERS = {
  owner: "00000000-0000-4000-a000-0000000000a1",
  member: "00000000-0000-4000-a000-0000000000b2",
  admin: "00000000-0000-4000-a000-0000000000c3",
  empty: "00000000-0000-4000-a000-0000000000d4",
};

const TENANT = "00000000-0000-4000-a000-00000000acme";
const PRODUCT = "00000000-0000-4000-a000-00000000c001";
const LAUNCH = "00000000-0000-4000-a000-00000000c002";

export function seedDemoFiles(store, now = new Date("2026-11-02T15:04:00.000Z")) {
  if (store.channel(PRODUCT)) return store;
  store.addChannel({ id: PRODUCT, tenantId: TENANT, name: "Product", visibility: "tenant" });
  store.addChannel({ id: LAUNCH, tenantId: TENANT, name: "Launch", visibility: "invited" });
  store.addMember({
    userId: DEMO_USERS.owner,
    name: "Mina Tran",
    tenantId: TENANT,
    role: "member",
    channelIds: [PRODUCT, LAUNCH],
  });
  store.addMember({
    userId: DEMO_USERS.member,
    name: "Rowan Hale",
    tenantId: TENANT,
    role: "member",
    channelIds: [PRODUCT, LAUNCH],
  });
  store.addMember({
    userId: DEMO_USERS.admin,
    name: "Linh Vo",
    tenantId: TENANT,
    role: "admin",
    channelIds: [PRODUCT],
  });
  store.addMember({
    userId: DEMO_USERS.empty,
    name: "Alex Kim",
    tenantId: "00000000-0000-4000-a000-00000000none",
    role: "member",
    channelIds: [],
  });

  const at = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const add = (input) => {
    const row = store.insertUploading({
      id: input.id,
      tenantId: TENANT,
      channelId: input.channelId,
      ownerUserId: input.ownerUserId,
      ownerName: input.ownerName,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: Buffer.alloc(32),
    });
    store.markActive(row.id, {
      spaceId: "space-demo",
      folderId: "folder-demo",
      fileId: `demo-${input.id.slice(0, 8)}`,
      state: "active",
    });
    store.patchFile(row.id, { createdAt: input.createdAt });
    return row.id;
  };

  add({
    id: "00000000-0000-4000-a000-00000000f001",
    channelId: PRODUCT,
    ownerUserId: DEMO_USERS.owner,
    ownerName: "Mina Tran",
    name: "roadmap.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1_258_291,
    createdAt: at(26),
  });
  add({
    id: "00000000-0000-4000-a000-00000000f002",
    channelId: PRODUCT,
    ownerUserId: DEMO_USERS.member,
    ownerName: "Rowan Hale",
    name: "booth-notes.txt",
    mimeType: "text/plain",
    sizeBytes: 18432,
    createdAt: at(8),
  });
  add({
    id: "00000000-0000-4000-a000-00000000f005",
    channelId: PRODUCT,
    ownerUserId: DEMO_USERS.owner,
    ownerName: "Mina Tran",
    name: "launch-brief.pdf",
    mimeType: "application/pdf",
    sizeBytes: 245760,
    createdAt: at(5),
  });
  add({
    id: "00000000-0000-4000-a000-00000000f003",
    channelId: LAUNCH,
    ownerUserId: DEMO_USERS.owner,
    ownerName: "Mina Tran",
    name: "q4-plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4_812_800,
    createdAt: at(90),
  });
  const deleting = add({
    id: "00000000-0000-4000-a000-00000000f004",
    channelId: PRODUCT,
    ownerUserId: DEMO_USERS.owner,
    ownerName: "Mina Tran",
    name: "old-deck.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: 6_291_456,
    createdAt: at(50),
  });
  store.deleteFile(DEMO_USERS.owner, deleting);

  const recent = store.requestDelete(DEMO_USERS.member, "00000000-0000-4000-a000-00000000f001", "This draft is the wrong quarter.");
  store.patchRequest(recent.id, { createdAt: at(3) });
  const old = store.requestDelete(DEMO_USERS.member, "00000000-0000-4000-a000-00000000f003", "Please take this plan down.");
  store.patchRequest(old.id, { createdAt: at(80) });
  return store;
}

export function demoUserId(as) {
  return DEMO_USERS[as] || "";
}
