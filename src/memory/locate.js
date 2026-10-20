const BLOB_CERTIFIED =
  "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::events::BlobCertified";
const GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

/**
 * Walrus blob ids are base64url of 32 bytes. BlobCertified stores that id as a
 * little-endian u256.
 */
export function blobIdDecimal(blobId) {
  const pad = "=".repeat((4 - (blobId.length % 4)) % 4);
  const bytes = Buffer.from(blobId + pad, "base64url");
  if (bytes.length !== 32) return "";
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index]);
  }
  return value.toString(10);
}

/**
 * Resolve a Walrus blob id to the certified Blob object and the checkpoint of
 * the certifying transaction. Returns nulls when the chain does not show one.
 */
export async function locateMemory(blobId) {
  if (!blobId) return { objectId: null, checkpoint: null, digest: null };
  const decimal = blobIdDecimal(blobId);
  if (!decimal) return { objectId: null, checkpoint: null, digest: null, blobId };
  let before = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await gql(
      `query($type: String!, $before: String) {
        events(last: ${PAGE_SIZE}, before: $before, filter: { type: $type }) {
          pageInfo { hasPreviousPage startCursor }
          nodes {
            contents { json }
            transaction { digest effects { checkpoint { sequenceNumber } } }
          }
        }
      }`,
      { type: BLOB_CERTIFIED, before },
    );
    const events = data?.events;
    const match = (events?.nodes ?? []).find((node) => String(node.contents?.json?.blob_id) === decimal);
    if (match) return certified(match, blobId);
    const cursor = events?.pageInfo?.startCursor || null;
    if (!events?.pageInfo?.hasPreviousPage || !cursor || cursor === before) break;
    before = cursor;
  }
  return {
    objectId: null,
    checkpoint: null,
    digest: null,
    blobId,
    locateError: "BlobCertified event was not found in the searched certifications",
  };
}

async function certified(match, blobId) {
  const sequence = match.transaction?.effects?.checkpoint?.sequenceNumber;
  const objectId = match.contents?.json?.object_id || null;
  const object = objectId ? await readObject(objectId) : null;
  return {
    objectId,
    digest: match.transaction?.digest || null,
    checkpoint: sequence == null ? null : Number(sequence),
    blobId,
    objectType: object?.type || null,
  };
}

async function readObject(objectId) {
  const data = await gql(
    `query($id: SuiAddress!) {
      object(address: $id) { address asMoveObject { contents { type { repr } } } }
    }`,
    { id: objectId },
  );
  return {
    type: data?.object?.asMoveObject?.contents?.type?.repr || null,
  };
}

async function gql(query, variables) {
  const response = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (payload.errors) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload.data;
}
