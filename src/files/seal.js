import { randomBytes } from "node:crypto";
import {
  SEAL_TESTNET_KEY_SERVERS,
  SEAL_THRESHOLD,
  SUI_GRPC_URL,
  WALRUS_NETWORK,
  sealPackageId,
  sealServiceObjectId,
} from "./config.js";

/**
 * Server-side Seal (option A). The service address is the only caller
 * `seal_approve` accepts. The AES key is what gets encrypted; plaintext
 * never goes to the key servers.
 *
 * Loaded only when a testnet package id is configured. Tests pass a fake.
 */
export function createLiveSeal(env = {}) {
  if (String(env.WALRUS_NETWORK || WALRUS_NETWORK) !== "testnet") {
    throw new Error("Seal files stay on testnet");
  }
  const packageId = sealPackageId(env);
  const serviceObjectId = sealServiceObjectId(env);
  if (!packageId || !serviceObjectId || !env.WALRUS_SERVICE_KEY) {
    throw new Error("Seal is not configured");
  }
  let ready = null;

  async function ensure() {
    if (ready) return ready;
    const [
      { SealClient, SessionKey },
      { SuiGrpcClient },
      { Ed25519Keypair },
      { decodeSuiPrivateKey },
      { Transaction },
    ] = await Promise.all([
      import("@mysten/seal"),
      import("@mysten/sui/grpc"),
      import("@mysten/sui/keypairs/ed25519"),
      import("@mysten/sui/cryptography"),
      import("@mysten/sui/transactions"),
    ]);
    const { secretKey } = decodeSuiPrivateKey(env.WALRUS_SERVICE_KEY);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const suiClient = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_GRPC_URL });
    const seal = new SealClient({
      suiClient,
      serverConfigs: SEAL_TESTNET_KEY_SERVERS.map((server) => ({
        objectId: server.objectId,
        weight: server.weight,
      })),
      verifyKeyServers: false,
    });
    ready = { seal, suiClient, keypair, SessionKey, Transaction };
    return ready;
  }

  return {
    async encryptKey(dataKey) {
      const { seal } = await ensure();
      const sealId = randomBytes(16).toString("hex");
      const { encryptedObject } = await seal.encrypt({
        threshold: SEAL_THRESHOLD,
        packageId,
        id: sealId,
        data: new Uint8Array(dataKey),
      });
      return {
        sealId: Buffer.from(sealId, "utf8"),
        packageId,
        serviceObjectId,
        encryptedObject: Buffer.from(encryptedObject),
      };
    },
    async decryptKey(header) {
      const ctx = await ensure();
      const pkg = header.packageId || packageId;
      const objectId = header.serviceObjectId || serviceObjectId;
      const idHex = Buffer.from(header.sealId).toString("utf8");
      const tx = new ctx.Transaction();
      tx.moveCall({
        target: `${pkg}::policy::seal_approve`,
        arguments: [
          tx.pure.vector("u8", Array.from(Buffer.from(idHex, "hex"))),
          tx.object(objectId),
        ],
      });
      const txBytes = await tx.build({ client: ctx.suiClient, onlyTransactionKind: true });
      const sessionKey = await ctx.SessionKey.create({
        address: ctx.keypair.toSuiAddress(),
        packageId: pkg,
        ttlMin: 10,
        suiClient: ctx.suiClient,
        signer: ctx.keypair,
      });
      const plain = await ctx.seal.decrypt({
        data: new Uint8Array(header.encryptedObject),
        sessionKey,
        txBytes,
      });
      return Buffer.from(plain);
    },
  };
}
