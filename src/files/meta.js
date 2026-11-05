import { METADATA_MAX_BYTES, TAG_MAX_CHARS, TAG_MAX_COUNT } from "./config.js";
import { FileError } from "./errors.js";

/**
 * Console metadata and tags for one file.
 * A tag is at most 30 characters. The id is shortened by a stable prefix so
 * the same tenant or channel always gets the same tag.
 */
export function fileTags({ tenantId, channelId }) {
  return [fitTag("tenant", tenantId), fitTag("channel", channelId)];
}

export function fitTag(prefix, id) {
  const label = String(prefix || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const body = String(id || "").replace(/-/g, "");
  const room = TAG_MAX_CHARS - label.length - 1;
  const tag = `${label}:${room > 0 ? body.slice(0, room) : ""}`;
  return tag.slice(0, TAG_MAX_CHARS);
}

export function fileMetadata(file) {
  return {
    sederunt_file_id: file.id,
    tenant_id: file.tenantId,
    channel_id: file.channelId,
    owner_person_id: file.ownerUserId || file.ownerGuestId || "",
    slack_file_id: file.slackFileId || null,
    // Enough to list the file again after a restart. Names only, no secrets.
    owner_name: String(file.ownerName || "").slice(0, 120),
    mime_type: String(file.mimeType || "").slice(0, 120),
    size_bytes: Number(file.sizeBytes) || 0,
  };
}

export function consoleObjectName(file) {
  const clean = String(file.name || "file").replace(/[/\\]/g, " ").replace(/\s+/g, " ").trim() || "file";
  const prefix = `${file.id}-`;
  const room = 255 - prefix.length;
  return `${prefix}${clean.slice(0, Math.max(0, room))}`;
}

export function assertFileTags(tags) {
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > TAG_MAX_COUNT) {
    throw new FileError(400, "tags", "The file tags are not valid");
  }
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.length < 1 || tag.length > TAG_MAX_CHARS) {
      throw new FileError(400, "tags", "The file tags are not valid");
    }
  }
  return tags;
}

export function assertFileMetadata(metadata) {
  const encoded = JSON.stringify(metadata);
  if (Buffer.byteLength(encoded) > METADATA_MAX_BYTES) {
    throw new FileError(400, "metadata", "The file metadata is too large");
  }
  return metadata;
}
