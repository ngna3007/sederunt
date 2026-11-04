/** Public Walrus/Seal settings. Package and object ids are on-chain and not secrets. */

export const WALRUS_NETWORK = "testnet";
export const WALRUS_UPLOAD_RELAY = "https://upload-relay.testnet.walrus.space";
export const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
export const SUI_GRPC_URL = "https://fullnode.testnet.sui.io:443";
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_FILE_EPOCHS = 3;
export const DELETE_REQUEST_HOURS = 72;
export const DELETE_REQUEST_DAILY_CAP = 10;
export const RENEW_MARGIN_EPOCHS = 1;
export const JOB_MAX_ATTEMPTS = 12;
export const UPLOAD_STUCK_MS = 60 * 60 * 1000;

/**
 * Mysten open-mode testnet key servers (seal-docs.wal.app).
 * Threshold 1: one server can release the key to the service address.
 */
export const SEAL_TESTNET_KEY_SERVERS = [
  {
    objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    weight: 1,
  },
  {
    objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
    weight: 1,
  },
];
export const SEAL_THRESHOLD = 1;

/** Published on Sui testnet. `policy::Service` is shared and only the publisher may approve. */
export const SEAL_PACKAGE_ID = "0x35f30738d39af36248cc2cd6bea82be2d5840df760d7f53e63bc46ba5cbb4c34";
export const SEAL_SERVICE_OBJECT_ID = "0x80f305b6fcbd3a931404ae472ad31bb4b1af391dfae1b0432a92290d2f635a2e";
export const SEAL_PUBLISH_DIGEST = "9L7YKB3Eneua2aT4DwuSXVxrUrebgBrwREXSbevRX9Ps";

/** Names only. Values stay in the server environment and are never written here. */
export const FILE_ENV_NAMES = [
  "WALRUS_NETWORK",
  "WALRUS_SERVICE_KEY",
  "WALRUS_SERVICE_ADDRESS",
  "WALRUS_FILE_EPOCHS",
  "SEAL_PACKAGE_ID",
  "SEAL_SERVICE_OBJECT_ID",
  "FILES_WRAP_KEY",
  "SEDERUNT_MEMWAL_KEY",
  "SEDERUNT_MEMWAL_ACCOUNT_ID",
  "SEDERUNT_MEMWAL_OWNER_KEY",
  "SEDERUNT_MEMWAL_SERVER",
  "FILES_DEMO",
];

export function fileEpochs(env = {}) {
  const parsed = Number(env.WALRUS_FILE_EPOCHS);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 1000) return parsed;
  return DEFAULT_FILE_EPOCHS;
}

export function sealPackageId(env = {}) {
  return String(env.SEAL_PACKAGE_ID || SEAL_PACKAGE_ID || "").trim();
}

export function sealServiceObjectId(env = {}) {
  return String(env.SEAL_SERVICE_OBJECT_ID || SEAL_SERVICE_OBJECT_ID || "").trim();
}
