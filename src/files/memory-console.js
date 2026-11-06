/**
 * In-process Console. The demo page and the visibility tests use this.
 * Nothing leaves the process, and the bytes are the plaintext the route returns.
 */
export function createMemoryConsole() {
  const blobs = new Map();
  let seq = 0;
  const folder = {
    spaceId: "space-demo",
    folderId: "folder-demo",
    sealPolicyId: "0xpolicy",
    name: "sederunt-files",
    created: false,
  };
  return {
    calls: [],
    async resolveFolder() {
      return { ...folder };
    },
    async put({ plain, folder: target, name, metadata, tags, onAccepted }) {
      const fileId = `file-${++seq}`;
      const placed = {
        spaceId: target?.spaceId || folder.spaceId,
        folderId: target?.folderId || folder.folderId,
        fileId,
      };
      this.calls.push({ op: "put", name, metadata, tags, folderId: placed.folderId });
      if (onAccepted) await onAccepted(placed);
      blobs.set(fileId, Buffer.from(plain));
      return { ...placed, state: "active" };
    },
    async finish({ fileId }) {
      this.calls.push({ op: "finish", fileId });
      if (!blobs.has(fileId)) throw new Error("Console upload did not complete");
      return { state: "active" };
    },
    async download({ fileId }) {
      this.calls.push({ op: "download", fileId });
      const found = blobs.get(fileId);
      if (!found) {
        const error = new Error("Console file is not readable");
        error.code = "not_found";
        throw error;
      }
      return Buffer.from(found);
    },
    async remove({ fileId }) {
      this.calls.push({ op: "remove", fileId });
      blobs.delete(fileId);
      return { deleted: true };
    },
  };
}
