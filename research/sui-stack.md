# Sui and Walrus stack

Checked 20 Oct 2026 against Mysten, Sui, and Walrus docs, the installed packages, and Tatum's own docs. No chain call was made. No key is recorded here.

## Answer

Keep one ESM Node process. Walrus Memory is the TypeScript client `@mysten-incubation/memwal` (`MemWal.create`) talking to the public Mainnet relayer. The process holds a company delegate key for one `MemWalAccount`, and a second account is the personal record. A namespace is not that split.

Sui reads stay on `@mysten/sui`. The public GraphQL URL this repo already uses is still an official endpoint. Tatum's Sui gateway is the other documented read, for objects, and it is not Walrus Memory. Do not add a browser-wallet template, a Walrus Site, a Move package, the Python SDK, or Tatum's Data API or Storage API.

## 1. What the first-party SDKs publish

Walrus Memory publishes two SDKs. The docs overview says so in the first sentence, under no extra heading: TypeScript and Python. Source: [SDK overview](https://docs.wal.app/walrus-memory/sdk/overview), opening paragraph. The TypeScript package README points documentation at [memory.walrus.xyz](https://memory.walrus.xyz). That host is the dashboard. The client reference lives on docs.wal.app, and the pages cite [MystenLabs/MemWal](https://github.com/MystenLabs/MemWal).

TypeScript, the path this repo already has:

| Package | What it is | Runtime |
| --- | --- | --- |
| `@mysten-incubation/memwal` | Default client. Installed `0.1.8`. | npm, `"type": "module"`, `engines.node` `>=20`. Exports are `import` only: `.`, `./account`, `./manual`, `./ai`. |
| `@mysten/sui` | Sui TypeScript SDK. Installed `2.37.0`. | npm, `"type": "module"`, `engines.node` `>=22`. No package-root export. Subpaths include `./grpc`, `./graphql`, `./jsonRpc`, `./keypairs/ed25519`. |

Those engine and export lines are the installed `package.json` files, not a guess. The memwal README, section "Install", also says the package is installed with `pnpm add @mysten-incubation/memwal`. The Sui README, section "Sui TypeScript SDK", says the SDK supports gRPC (recommended), GraphQL, and JSON-RPC (deprecated). Docs site: [sdk.mystenlabs.com](https://sdk.mystenlabs.com/), linked from that README and from the package `homepage`. This note did not check the Node version on this machine. The app `package.json` does not set `engines`.

Python is a second published SDK, not a second process for this repo. Package name `memwal` on PyPI. [Python quick start](https://docs.wal.app/walrus-memory/python-sdk/quick-start), heading "Installation": Python 3.9+, `pip install memwal`, dependencies `httpx` and `PyNaCl`. It mirrors the TypeScript client and the same relayer. [SDK overview](https://docs.wal.app/walrus-memory/sdk/overview), heading `memwal`.

The default TypeScript entry does not import the account module. The installed `dist/index.d.ts` says account management is `@mysten-incubation/memwal/account`, and the manual client is `@mysten-incubation/memwal/manual`. The installed `0.1.8` client does, on a Seal session, dynamically import `@mysten/seal` and `@mysten/sui/grpc` (with a JSON-RPC fallback) and uses the URLs from the relayer `GET /config`. In the installed memwal `package.json`, `@mysten/sui` and `@mysten/seal` are peers and are not marked optional. `@mysten/walrus`, `ai`, and `zod` are optional. The lockfile has `@mysten/seal@1.5.1` as that peer. The app's direct dependencies are only the two packages named above.

[Quick start](https://docs.wal.app/walrus-memory/sdk/quick-start), heading "Installation", tells you to install only `@mysten-incubation/memwal` for the default client, and to add `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus` for `MemWalManual`. That install line and the installed Seal import disagree. This note does not pick a third package to add.

## 2. Official templates, and what they assume

There is an official app scaffolder. It does not fit a server that already holds a delegate key.

[`@mysten/create-dapp`](https://sdk.mystenlabs.com/dapp-kit/getting-started/create-dapp), heading "Templates":

- `react-client-dapp` is a React app. It connects a wallet with `ConnectButton`, shows that address, and lists objects the wallet owns. It uses Tailwind.
- `react-e2e-counter` adds a Move counter under `move/counter/`, tells you to publish that package, and generates TypeScript with `@mysten/codegen`.

Heading "Tech stack": both templates are React, TypeScript, Vite, Tailwind CSS v4, and `@mysten/dapp-kit-react` for "Wallet connection and blockchain interaction." The e2e steps use `sui client publish`. That is a browser wallet plus, in one template, a Move package this app does not author.

[Sui dApp Kit](https://sdk.mystenlabs.com/dapp-kit) is the wallet SDK those templates install. The React getting-started page builds `createDAppKit` around `SuiGrpcClient` and a `ConnectButton`: [React](https://sdk.mystenlabs.com/dapp-kit/getting-started/react), headings "Quick start with create-dapp" and "Step 1: Create a dApp Kit instance".

A second official page disagrees about the transport inside the published dApp Kit. [JSON-RPC Migration Guide](https://docs.sui.io/develop/accessing-data/json-rpc-migration), heading "Ecosystem tools use different migration paths": the currently published `@mysten/dapp-kit` client factory requires `SuiJsonRpcClient` and does not accept `SuiGrpcClient`. Both pages describe a wallet app. Neither is a Node process that already has the delegate key. The disagreement is left as a disagreement.

The server example that matches this product is not that template. [Headless SDK Setup](https://docs.wal.app/walrus-memory/sdk/headless-setup), opening paragraph: a server or agent runtime has no human to click a wallet. The only browser step is generating the account and delegate key once on the dashboard. "Your runtime never opens one."

Walrus Sites are a different product. [Walrus Sites](https://docs.wal.app/docs/sites), opening section: static files on Walrus, a Sui object as the index, the `site-builder` CLI to publish, and a portal to serve. "A Walrus Site serves static files only, so backends, databases, and server-side rendering are out of scope." The site-builder is a Rust CLI ([Install the Site Builder](https://docs.wal.app/docs/sites/getting-started/installing-the-site-builder)). It does not hold a MemWal delegate key and it does not render this server's HTML.

There is also a server cookbook that uses the right client and the wrong privacy model. [Cookbook - Multi-Tenant Server Apps](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant), heading "The pattern at a glance": one operator account, one delegate key in server env, and one namespace per end user. Its sample is a Next.js route. Heading "2. Namespace naming for multi-user apps" warns that a namespace is a data-organization boundary, not a security boundary. This repo must not copy that isolation. It also must not adopt Next.js because the cookbook used it as the sample.

## 3. What a MemWal server integration is

The surface to keep is `MemWal.create` from `@mysten-incubation/memwal`.

[Headless SDK Setup](https://docs.wal.app/walrus-memory/sdk/headless-setup), heading "Initialize from the environment", lists four fields:

| Field | Required | Meaning in the doc |
| --- | --- | --- |
| `key` | yes | Ed25519 delegate private key, hex |
| `accountId` | yes | `MemWalAccount` object ID on Sui |
| `serverUrl` | no, pass it anyway | Relayer URL. Mainnet example `https://relayer.memory.walrus.xyz` |
| `namespace` | no | Default namespace. Omitted value is `"default"` |

[Configuration](https://docs.wal.app/walrus-memory/reference/configuration), heading `MemWalConfig`, is the same four fields plus optional timeouts (`requestTimeoutMs`, `recallTimeoutMs`, `preflightTimeoutMs`). It says the default `serverUrl` is `https://relayer.memory.walrus.xyz`. Heading "Rules that matter": `MemWal` is the default relayer-handled path.

[Managed Relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer), heading "Walrus Foundation hosted endpoints":

- Mainnet: `https://relayer.memory.walrus.xyz`
- Testnet: `https://relayer-staging.memory.walrus.xyz`

Heading "What to know": every user of that relayer shares one Walrus Memory package ID. The app does not publish a package. The same section says the relayer sees plaintext during encryption and embedding. That is the trust assumption of the public relayer this product already uses.

The installed client learns `packageId` and the Sui URL from `GET /config` on that relayer. Do not hardcode a package id or a fullnode for that session. [Configuration](https://docs.wal.app/walrus-memory/reference/configuration), heading "Relayer configuration", says a self-hosted relayer can set `SUI_GRPC_URL`, and that an empty value keeps JSON-RPC, "to migrate ahead of the Sui JSON-RPC sunset in July 2026." This app does not run that relayer. The July wording is older than the Sui shutoff date in section 4.

Delegate versus owner, from [Ownership and Permissions](https://docs.wal.app/walrus-memory/contract/ownership-and-permissions):

- Heading "Owner": the owner can add and remove delegate keys, freeze the account, and decrypt. Each Sui address can create one `MemWalAccount`.
- Heading "Delegate": a delegate can `remember`, `analyze`, `recall`, `restore`, and decrypt through `seal_approve`. A delegate cannot add or remove keys, freeze the account, or transfer it.
- Heading "Seal Access control": "Delegate authorization is account-wide. A namespace changes the Seal identity, but it does not stop another delegate on the same account from requesting that key."

[Cookbook - Multi-Tenant Server Apps](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant), heading "2. Namespace naming for multi-user apps": "A namespace serves as a data-organization boundary, not a security boundary between users. The delegate key can read and write every namespace under the account." Heading "Keep the owner key offline": the owner key used for `createAccount`, `addDelegateKey`, and `removeDelegateKey` should not run on the server.

So the company Node process keeps a delegate key and calls the relayer. It does not hold the owner key, and it does not treat a namespace as the wall between company and personal memory. That wall is the second account. Recall is scoped per account plus namespace ([Headless SDK Setup](https://docs.wal.app/walrus-memory/sdk/headless-setup), the warning under "Initialize from the environment"), which is why each client still sets a namespace. Scope is not privacy.

`MemWalManual` is the other client. [Headless SDK Setup](https://docs.wal.app/walrus-memory/sdk/headless-setup), heading "When to use the manual client": use it only when the runtime must embed and Seal-encrypt locally so the relayer never sees plaintext. It needs `packageId`, a Sui signer, and an embedding key. This product's writes go through the public relayer, so the default client is the one that matches.

Offline tests are a separate export. The installed README, heading "Offline tests and CI": `MemWalMock` implements the memory API in memory and needs no key, account, relayer, chain, or paid storage. The package's own test script is `node --test`. This repo's `node:test` files already throw if a test would call the network. Keep that. Do not add a test that hits the relayer.

## 4. Reads, and where Tatum sits

Memory writes do not go through a Sui RPC and do not go through Tatum. They go through the relayer above.

For Sui reads, official docs no longer tell you to use JSON-RPC on the Foundation Mainnet full node.

[JSON-RPC Migration Guide](https://docs.sui.io/develop/accessing-data/json-rpc-migration), opening: JSON-RPC is disabled on Sui Foundation Mainnet full nodes. The shutoff was the week of 27 July 2026. Full decommission, including code removal, is planned for mid-October 2026. Replacements are gRPC and GraphQL RPC. Heading "Should I use gRPC or GraphQL RPC?": use either or both. gRPC for backend point lookups, streaming, and transaction submission. GraphQL for scripts, joined reads, event filters, and object history. `sui_getObject` maps to gRPC `LedgerService.GetObject` and GraphQL `Query.object`. `suix_queryEvents` maps to GraphQL `Query.events`.

The public URLs are still the ones in [Emitting Events](https://docs.sui.io/develop/accessing-data/using-events), heading "Public endpoints":

- gRPC Mainnet: `https://fullnode.mainnet.sui.io:443`
- GraphQL Mainnet: `https://graphql.mainnet.sui.io/graphql`

Heading "Public endpoints" says both are rate-limited development and public-good endpoints, not production targets. [JSON-RPC Migration Guide](https://docs.sui.io/develop/accessing-data/json-rpc-migration), heading "Public load balancer URLs are not production endpoints", says the same about `https://fullnode.<network>.sui.io` and `https://graphql.<network>.sui.io/graphql`. This note does not name a new host.

The GraphQL URL this repo posts to in `src/memory/locate.js` is that documented Mainnet GraphQL endpoint. The event query shape on the same Sui page, heading "How do I query events with GraphQL?", is `Query.events` with a type filter. Docs do not say GraphQL is the only replacement. They do say Foundation Mainnet JSON-RPC is off. `https://fullnode.mainnet.sui.io:443` is now the documented gRPC URL on that same host. It is not a new RPC, and this note does not move the locate client onto it.

The installed SDK agrees, with a preference. `@mysten/sui` README, section "Connecting to Sui Network": `SuiGrpcClient` is the recommended client, and the Mainnet URL is `https://fullnode.mainnet.sui.io:443`. The package docs, [Sui Clients](https://sdk.mystenlabs.com/sui/clients) (the installed file `docs/clients/index.md`), heading "Sui Clients": pick `SuiGrpcClient` by default, or `SuiGraphQLClient` to query the GraphQL schema. The GraphQL example uses `https://graphql.mainnet.sui.io/graphql`. JSON-RPC is marked deprecated. `SuiJsonRpcClient` in the installed `src/jsonRpc/client.ts` carries the same deprecation and points at `@mysten/sui/grpc` or `@mysten/sui/graphql`.

One Sui page still says the CLI's `fullnode.*.sui.io:443` URLs "serve both JSON-RPC and gRPC" ([JSON-RPC Migration Guide](https://docs.sui.io/develop/accessing-data/json-rpc-migration), heading "Ecosystem tools use different migration paths"). That sentence conflicts with the shutoff banner on the same page. The banner matches this machine's earlier failure to use Foundation Mainnet JSON-RPC. This note does not resolve the CLI sentence by trying the endpoint.

Tatum is a gateway in front of Sui, not a MemWal client and not the Data API.

[Sui](https://docs.tatum.io/reference/rpc-sui), the RPC gateway page (page date 7 Oct 2026), heading "Available Sui interfaces and methods":

- JSON-RPC base `https://sui-mainnet.gateway.tatum.io`, including `sui_getObject` and `suix_queryEvents`.
- gRPC base `https://sui-mainnet-grpc.gateway.tatum.io`, including `sui.rpc.v2.LedgerService/GetObject`.

[Supported Blockchains](https://docs.tatum.io/docs/supported-blockchains) (page date 8 Oct 2026), heading "Tier 2", lists Sui and links to that RPC page. That list is gateway support. It is not the v4 Data API chain table.

[Data API Overview](https://docs.tatum.io/reference/blockchain-data-api), heading "Supported Chains": the table fetched on 20 Oct 2026 names Bitcoin, Ethereum, Solana, Unichain, Monad, Robinhood Chain, Arbitrum, Base, Optimism, Berachain, BSC, Polygon, Litecoin, Doge, Celo, and Chiliz. A search of that page for "Sui" did not return a chain row. The only hit was the word "suite". This note did not see a second page of the table. Sui object reads do not belong on `/v4/data/...`.

[Storage API](https://docs.tatum.io/reference/storage-api), opening: upload files to Walrus, track a `jobId` and `blobId`, and manage renewal. The upload route is `POST /v4/data/storage/upload` ([Upload a file to Walrus storage](https://docs.tatum.io/reference/storageupload)). That is Walrus blobs. It is not `MemWal`, not a namespace, and not a delegate key.

Recall.ai, Linear, and Google Calendar do not choose this stack. [Recall getting started](https://docs.recall.ai/v1.10/docs/getting-started), heading "Meeting Bots", describes an HTTP API. The separate Desktop Recording SDK is `npm install @recallai/desktop-sdk` for an Electron app ([Desktop SDK](https://docs.recall.ai/docs/desktop-sdk), heading "Installation"), which is not this server. [Linear MCP server](https://linear.app/docs/mcp), heading "Setup", is a hosted Streamable HTTP server at `https://mcp.linear.app/mcp`. [Google Calendar MCP](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server), opening, is a remote MCP server; the endpoint is `https://calendarmcp.googleapis.com/mcp/v1` ([MCP Reference](https://developers.google.com/workspace/calendar/api/v3/reference/mcp), heading "MCP Reference: calendarmcp.googleapis.com"). None of those pages names a language that replaces `@mysten/sui` or MemWal.

## 5. What this repo keeps, and what it refuses

Keep:

- ESM Node. Entry remains `node src/server.js`. Tests remain `node --test` and do not call the network. `MemWalMock` is the SDK's offline double if a test needs the memory API.
- `@mysten-incubation/memwal` default export `MemWal.create({ key, accountId, serverUrl, namespace })` against `https://relayer.memory.walrus.xyz`.
- Two `MemWalAccount`s. The company process holds the company delegate key only. The personal account is the other record. A namespace stays an organizing label.
- `@mysten/sui` for Sui types and, where the relayer's `GET /config` asks for it, the gRPC or JSON-RPC client the installed MemWal code already constructs. Do not substitute a URL.
- The public GraphQL endpoint already in `src/memory/locate.js`, `https://graphql.mainnet.sui.io/graphql`, for the event and object locate. It is still the documented public GraphQL URL.
- Tatum only as the Sui gateway: `sui_getObject` on `https://sui-mainnet.gateway.tatum.io`, or `LedgerService/GetObject` on `https://sui-mainnet-grpc.gateway.tatum.io`. Those hosts are Tatum's. They are not a new Foundation RPC.

Refuse, because it fights the SDK or the product constraints above:

- `@mysten/create-dapp`, `@mysten/dapp-kit-react`, and a `ConnectButton`. The official template assumes a browser wallet. This process already holds the delegate key. [Headless SDK Setup](https://docs.wal.app/walrus-memory/sdk/headless-setup) says the runtime never opens a browser.
- A Move package, `@mysten/codegen`, or `sui client publish`. The managed relayer already shares the public package. The account-admin calls (`addDelegateKey`, `removeDelegateKey`) are owner-key operations and do not belong in the process that only has the delegate key.
- `MemWalManual`, `@mysten/walrus`, and a client-side Seal upload path. The product writes through the public relayer.
- `@mysten-incubation/memwal/ai` and the `ai` package. [Quick start](https://docs.wal.app/walrus-memory/sdk/quick-start), the entry-point table: `withMemWal` is for an app that already uses the Vercel AI SDK. This one does not.
- The Python `memwal` package. It is a real SDK and a second runtime. This repo is one Node process. Its default `server_url`, if `env` is omitted, is `http://localhost:8000` ([Python quick start](https://docs.wal.app/walrus-memory/python-sdk/quick-start), heading "Configuration"), which is not the TypeScript default.
- The cookbook's one-account, many-namespace split, and its Next.js sample. Namespace is not privacy.
- Walrus Sites and `site-builder`. Static files, no server, no delegate key.
- JSON-RPC against `https://fullnode.mainnet.sui.io`. Foundation Mainnet JSON-RPC is disabled. Do not add any other RPC host.
- Tatum v4 Data API chain routes for Sui. Sui was not in the Data API chain table checked above.
- Tatum Storage API. That is Walrus file blobs, not Walrus Memory.
- Letting Recall.ai, Linear MCP, or Google Calendar MCP pick the language. They are HTTP. The Sui side is already chosen by the two installed packages.
