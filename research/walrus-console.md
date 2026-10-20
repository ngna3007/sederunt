# Walrus Console

Checked 20 Oct 2026 against the Console pages listed in the docs index, the Walrus Memory pages those claims depend on, and the Walrus Console product and announcement pages. No key is recorded here. No account id is recorded here.

## Answer

Walrus Console stores a file in a private folder on Walrus. The browser or the agent encrypts that file with Seal first, and Console keeps ciphertext. Walrus Memory is a different store: `remember` and `analyze` take text, not a PDF or an image, and an arbitrary Walrus blob is not a memory. For Sederunt, the announcement sentence is the memory, and the PDF or image is a Console file that the sentence names. The Memory tab can list that memory's metadata. It does not show the sentence, and it does not put the file inside the memory.

## 1. What Console is

Walrus Console is a hosted place to store, manage, and serve data on Walrus without running a Walrus client or handling wallets and tokens. You sign in and upload, then mint an API key when you want programmatic access. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), opening paragraph.

Walrus is the protocol under it. Walrus stores data as blobs, coordinated on Sui. The CLI and SDKs are the direct path, with low-level control of blobs, epochs, and payment. Console sits on that protocol as the managed surface: it provisions the account and wallet, pays for storage, keeps metadata, and offers a dashboard and an API. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "How Walrus Console relates to Walrus".

The docs organize data in three levels. The API calls a folder a bucket. The product pages say folder.

| Level | What the overview says |
| --- | --- |
| Space | Top-level container tied to the account. Sign-up creates a Personal Space. A space tracks storage used against the storage cap. |
| Folder | Named container inside a space. All folders are private and encrypted with Seal. |
| File | One object inside a folder. Upload is asynchronous: upload, then poll until Console confirms Walrus stores it. A file can carry metadata you define, for later search. |

Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Core concepts: spaces, folders, and files". The quick start says every folder creation uses the private Seal flow, and the developer API host is `api.console.walrus.xyz`. Source: [Quick Start](https://docs.wal.app/docs/console/quickstart), the info note under the opening paragraph.

Sign-in is Google or Apple through Sui zkLogin. Console derives a Sui address and provisions a Pearl wallet, the embedded wallet it manages. You do not fund that wallet or sign its transactions. Google and Apple for the same person are two accounts, not one merged account. Console does not offer Sui-wallet sign-in. The one place it uses an external wallet is the Memory tab, to prove you own a Walrus Memory account. Source: [Authentication and Accounts](https://docs.wal.app/docs/console/auth), headings "How sign-in works", "Your Pearl wallet", "Accounts stay separate per identity", and "Wallet sign-in".

Console does not migrate blobs you stored on Walrus before you used the product. You re-upload them. It lists only files uploaded through Console, the API, or the MCP server. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Accounts and sign-in", and [Walrus Console FAQ](https://docs.wal.app/docs/console/faq), heading "Can Walrus Console see files you already uploaded with the Walrus CLI or SDK?".

The list-spaces response can filter `type` to `personal` or `team`, and a space object includes `member_count` (null on a Personal Space). Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "List spaces". The FAQ says an account belongs to one person. Source: [Walrus Console FAQ](https://docs.wal.app/docs/console/faq), heading "Can your team share one account?". The announcement still calls shared company spaces an upcoming feature. Source: [Introducing Walrus Console](https://walrus.xyz/blog/introducing-walrus-console/), heading "Build on your data, anywhere". These pages do not describe what a team space can do.

## 2. Encryption

On Walrus, every blob is public. Walrus does not encrypt. Anyone who has a blob ID can fetch the bytes. Blob IDs are not secrets. Confidentiality is the uploader's job: encrypt on the client before storing, for example with Seal, and treat the blob ID as public. Source: [Data Security](https://docs.wal.app/docs/data-security), headings "Data confidentiality" and the caution above "Data availability". The same warning is on the Console overview. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Encryption and privacy".

Console private folders encrypt every file on the client with Seal before upload. Console stores ciphertext only. The overview says Console never sees your plaintext or your decryption keys. Encryption on upload and decryption on download both happen on your machine. Creating the folder is a reserve, sign, and finalize handshake that puts the folder's Seal access policy onchain. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Encryption and privacy", and [Quick Start](https://docs.wal.app/docs/console/quickstart), the paragraph before "Step 1: Get your space ID". The quick start also says decryption never touches Console's backend. Source: [Quick Start](https://docs.wal.app/docs/console/quickstart), heading "Step 8: Download and decrypt".

A download of a private-folder file returns the Seal ciphertext, not the original bytes. The signed URL host serves those bytes as `application/octet-stream`. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Download a file". For a private folder, the recorded `mime_type` is the type of the ciphertext, not a type the docs say they preserved from the original file. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Get file metadata".

A raw Walrus blob, without that client-side Seal step, is public. Storing through Console does not make the Walrus blob private. It makes the stored bytes ciphertext. Anyone who can fetch the blob still gets those ciphertext bytes.

Walrus Memory encryption is a different path. On the default `remember` route, the relayer does the Seal encryption. The managed-relayer page says the relayer sees plaintext during encryption and embedding. Source: [Managed Relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer), heading "What to know", and [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/remember". The returning-user page says that when you use client-managed encryption, the relayer operator does not read the memory. Source: [Sign in as a Returning User](https://docs.wal.app/walrus-memory/guides/returning-user), heading "Onchain privacy". Console is not that relayer. The Console pages do not say Console sees memory plaintext. They say the opposite. See section 5.

## 3. File facts a landing can use

The overview, the FAQ, the storage page, and the API reference all state the same three caps. Each space holds up to 5 GB and five folders. Each upload is capped at 100 MiB. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Storage limits". An upload over 100 MiB returns `413` with code `payload_too_large`. A sixth folder, or a storage-limit breach of that shape, returns `422` with code `plan_limit_exceeded`. Going over the storage quota returns `422` with code `quota_exceeded`. Uploads stop at the storage cap. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Errors", and [Walrus Console FAQ](https://docs.wal.app/docs/console/faq), headings "What are the storage limits?" and "What happens when you hit a limit?".

The docs do not list the file types an upload accepts. They only name the rejection: `415` with code `unsupported_file_type`, "The request content type is not accepted." Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Errors". Search can filter by category: `CODE`, `GEO`, `IMAGE`, `AUDIO`, `DOCUMENT`, `TABLE`, `TEXT`, `VIDEO`, `ARCHIVE`, or `OTHER`. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Search". That list is a search filter. The page does not say it is an upload allowlist, and it does not say a PDF or an image is accepted. The usage endpoint groups bytes by file category and by file format. It does not name the formats. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Get storage usage".

Other sizes the API reference does state:

| Fact | Number | Heading |
| --- | --- | --- |
| File metadata on upload | JSON object string, maximum 8 KiB | "Upload a file" |
| File name | up to 255 characters | "Upload a file" and "Update a file" |
| File description | up to 1000 characters | "Update a file" |
| File tags | up to 10 tags, each up to 30 characters | "Update a file" |
| Folder name | 1 to 100 characters | "Update a folder" |
| Folder description | up to 1000 characters | "Update folder metadata" |
| Folder tags | up to 10 tags, each up to 24 characters | "Update folder metadata" |
| Optional `contentSize` | plaintext byte count, so Console can show the original size of a ciphertext upload | "Upload a file" |

Source: [API Reference](https://docs.wal.app/docs/console/api-reference), those headings. The pages do not say `contentSize` is checked against the ciphertext.

Upload is asynchronous. `POST` of the file returns `202` with a file id. You poll status until `data.state` is `completed`. The job states are `queued`, `active`, `completed`, and `failed`. Delete returns `204` immediately and releases storage after a background worker confirms the removal. Deleting a folder deletes every file in it. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Asynchronous operations", and heading "Get upload status".

Walrus storage is bought in epochs and expires when that storage runs out. One epoch is 2 weeks on Mainnet and 1 day on Testnet. Storage can be bought for at most 53 epochs at a time. Source: [Network Reference](https://docs.wal.app/docs/network-reference), heading "Network parameters". The Console storage page cites that reference and repeats the same two lengths and the 53-epoch maximum. Source: [Storage, Epochs, and Renewal](https://docs.wal.app/docs/console/storage-epochs), heading "How storage epochs work".

Console pays and extends for you. A background task extends a Console file's storage before it expires. The FAQ says Console files do not expire on their own. Files stored outside Console, through the CLI or an SDK, need manual renewal. Source: [Storage, Epochs, and Renewal](https://docs.wal.app/docs/console/storage-epochs), headings "How storage epochs work" and "Automatic extension", and [Walrus Console FAQ](https://docs.wal.app/docs/console/faq), heading "Do your files expire?". A folder reports `expires_at`. The storage page does not say a Walrus Memory blob is one of those files. See section 6.

A minted download URL lasts 15 minutes. Source: [API Reference](https://docs.wal.app/docs/console/api-reference), heading "Mint a download URL". The pages checked here do not say the web app's own download lasts 15 minutes. That number is the API's signed URL.

## 4. How an agent touches files

The MCP server gives an AI client the same file and folder operations as the web app. The agent creates folders, uploads and downloads files, and checks storage usage. Encryption and signing stay on the machine. The package is `@mysten-incubation/walrus-console-mcp`. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), opening paragraph.

The tools the page names for files are `upload_file` (encrypt and upload a local file), `download_file` (download and decrypt a file to disk), `list_files` (list the files in a folder, with search), and `delete_file` (delete one file permanently). The same table also lists `ping_console`, `list_spaces`, `get_storage_usage`, `list_buckets`, `get_bucket`, `get_bucket_metadata`, `create_bucket`, `rename_bucket`, `update_bucket_metadata`, `delete_bucket`, `get_file_status`, `update_file`, and `generate_api_key`. A `read_only` key can call the read tools. The write tools need a `read_write` key. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), heading "Available tools".

Clients the connect section names: Claude Desktop (a desktop extension), Cursor, and, through one installer, Claude Code, Codex, Gemini CLI, Antigravity, and the Cursor CLI. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), heading "Connect from the Walrus Console web app". The MCP page requires Node.js 24 or later. The quick start's signing scripts require Node.js 22 or later. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), heading "Prerequisites", and [Quick Start](https://docs.wal.app/docs/console/quickstart), heading "Prerequisites". This note does not pick one.

Two secrets, shown once. The API key authorizes calls to Console. The service private key signs onchain access grants and unwraps Seal keys locally. Console stores only the derived public address of that service key. The installer writes both to a user-only file under the walrus-console-mcp config directory. The MCP client config launches the server and does not hold the keys. Environment variables can override that file. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), headings "Prerequisites", "Install", and "What stays on your machine". The service private key does not need a token balance. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "API keys and roles".

`upload_file` and `download_file` are confined to workspace roots the client advertises, or to folders chosen at install. A path outside those roots is rejected. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), heading "Where the server can read and write files".

API key roles, from the API reference, heading "Authentication":

| Role | What the page says |
| --- | --- |
| `read_write` | Can change state: create and delete folders, upload and delete files, and finalize private folders. |
| `read_only` | Can list, check status, mint download URLs, and download. Any other write returns `403` with code `read_only_api_key`. |
| `key_admin` | Belongs to a Management API key. Reaches only the API-key endpoints and the Seal sponsor endpoints. Every data-plane endpoint returns `403`. |

The overview uses the same split in product language. A plain API key works with the MCP server and with an application, and cannot mint further keys. A Management API key mints keys and cannot upload, download, or manage assets. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "API keys and roles". The MCP page's prefixes are `hbr_` for a working key and `hbradm_` for Key-Admin. A working key cannot mint. A Key-Admin key has no data-plane access. Source: [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), heading "Mint keys for other agents". Rotation revokes the old key before the new one is shown. There is no overlap. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "API keys and roles".

The MCP server is not the Walrus Memory MCP server. Memory tools are `memwal_remember`, `memwal_recall`, `memwal_analyze`, and the rest of that set. Source: [Reference](https://docs.wal.app/walrus-memory/mcp/reference), heading "Tools". Those tools do not upload a Console file.

## 5. Walrus Memory inside Console

Files and memory are both asset types in one navigation shell. Memory means Walrus Memory namespaces. You connect a Walrus Memory account from the Memory tab to view memories and delegate keys. Managing memories and delegate keys happens on the Walrus Memory dashboard. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), headings "Asset types" and "Walrus Memory in Console".

The same section says the view is read-only, and this sentence is the one the landing has to keep: "Console shows memory metadata only. It never reads or stores memory content." Disconnecting the account removes the connection and Console's copy of the metadata. It does not delete any memory. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Walrus Memory in Console".

Deleting the Console account removes folders, files, and API keys. Memories stored in Walrus Memory are not deleted. Only the link between the two accounts is removed. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), heading "Delete your account". The FAQ repeats that memories are not affected. Source: [Walrus Console FAQ](https://docs.wal.app/docs/console/faq), heading "Can you delete your account?".

The pages do not say that connecting the account imports Console files as memories. They say the opposite direction is also not an import. Walrus Memory does not import blobs you already stored on Walrus. A memory is an encrypted blob plus namespace metadata plus a vector embedding. An arbitrary blob has none of that, so recall cannot return it. Source: [Sign in as a Returning User](https://docs.wal.app/walrus-memory/guides/returning-user), heading "Walrus Memory does not migrate existing data". The info box on that page says console visibility for existing Walrus assets is on the near-term roadmap, and that the wider returning-user experience ships after GA. That sentence is about blobs that were not stored as memories. It is not a description of the Memory tab's metadata view, which the Console overview already documents.

Console and Walrus Memory are separate zkLogin applications, so the same person has two Sui addresses. The identity-link page says proving control of the memory address is Console's job, and that a later owner-scoped token for reading memory data was not yet built when that page was written. Source: [Console Identity Link](https://docs.wal.app/walrus-memory/reference/console-identity-link), headings "Overview" and "What this flow deliberately does not do". Two later pages describe that read path as built. Console can mint a short-lived bearer token with permission `memories.read` only, and it never holds a delegate key. Phase 1 has no write or renew scope. Source: [Owner-Scoped Token Authentication](https://docs.wal.app/walrus-memory/api/owner-token-auth), heading "Overview". The read routes are namespaces, memories, and agents. A memory row in that response is an id, a namespace, a blob id, timestamps, an encrypted size, an agent id, a package id, a status, an end epoch, an expiry, and an importance. An agent row is a label and an address. The sample has no text field. Source: [Memory Read API](https://docs.wal.app/walrus-memory/api/memory-read-api), headings "GET /v1/owners/:owner/memories" and "GET /v1/owners/:owner/agents". That shape matches the overview's "metadata only" sentence. It does not match a screen that shows the memory sentence. This note does not decide which of the identity-link page and the read-API pages is newer. Neither response includes memory text.

The announcement's "when they expire" and "which agents" lines match fields on that read API (expiry, agent label). Source: [Introducing Walrus Console](https://walrus.xyz/blog/introducing-walrus-console/), heading "Build on your data, anywhere". The Console overview does not name those columns. It only says the tab shows memories and delegate keys, as metadata.

## 6. The boundary

`remember` submits one text string. The relayer then embeds it, Seal-encrypts it, uploads it to Walrus, and indexes it. The method returns when the job is accepted, not when the blob is durable. Source: [SDK API Reference](https://docs.wal.app/walrus-memory/sdk/api-reference), heading "remember(text, namespace?)", and [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/remember". The request body is `text`, an optional `namespace`, and an optional idempotency key. The page does not accept a file, a PDF, an image, or a blob id as the memory body.

`remember` in bulk accepts up to 20 items. That route accepts request bodies up to 2 MB. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/remember/bulk". The MCP bulk tool takes 1 to 20 fact strings. Source: [Reference](https://docs.wal.app/walrus-memory/mcp/reference), heading "Memwal_remember_bulk". The relayer page does not state a character cap on a single `text` field. It does limit `namespace` and `idempotency_key` to 255 UTF-8 bytes. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/remember".

`analyze` extracts facts from text with an LLM and enqueues each fact as its own memory. The SDK describes it as text in, background jobs out, with a `fact_count`. Source: [SDK API Reference](https://docs.wal.app/walrus-memory/sdk/api-reference), heading "analyze(text, namespace?)". The relayer request is `text`, an optional `namespace`, and an optional `occurred_at`. The response lists `facts` and `fact_count`. The page does not state a maximum fact count, and it does not accept a file. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/analyze". The MCP tool's text parameter is "Conversation transcript, note, or arbitrary text to extract from." Source: [Reference](https://docs.wal.app/walrus-memory/mcp/reference), heading "Memwal_analyze".

What analyze is for, in the concept page: it extracts discrete facts from a longer passage and stores each as its own memory, so recall stays precise instead of returning one large blob. Source: [How AI Agent Memory Works](https://docs.wal.app/walrus-memory/fundamentals/concepts/how-agent-memory-works), heading "How Walrus memory implements this". The codebase guide uses it on a pull-request description string, and uses `rememberBulk` for short text chunks of code and project context. Source: [Codebase Memory for Coding Assistants](https://docs.wal.app/walrus-memory/sdk/codebase-memory), heading "Store codebase context". The research prompt says to use analyze on long documents you have read, and to store the conclusion and the link, not the corpus. Source: [System Prompt Templates](https://docs.wal.app/walrus-memory/guides/system-prompt-templates), heading "Research agent".

`recall` returns decrypted text for the closest matches, scoped to owner and namespace. Default limit is 10. The relayer caps `limit` at 100. Source: [SDK API Reference](https://docs.wal.app/walrus-memory/sdk/api-reference), heading "recall(params)". `ask` recalls memories, injects them into an LLM prompt, and returns an answer plus the memories used. The request is a `question`, a `limit` (default 5, cap 100), and a namespace. It is not a file upload. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/ask". The product page's four operations are the same four: Remember, Recall, Analyze, Ask. Source: [What is Walrus Memory?](https://docs.wal.app/walrus-memory), heading "Memory operations".

The returning-user page is the boundary in one place. "A memory is not just a blob." An arbitrary blob uploaded through another tool has no Seal content-encryption from Walrus Memory, no namespace metadata, and no embedding, so Walrus Memory cannot treat it as a memory or return it from recall. To carry existing content in, you write it through the SDK as text. Deleting a memory does not delete a separate Walrus blob uploaded elsewhere. Source: [Sign in as a Returning User](https://docs.wal.app/walrus-memory/guides/returning-user), heading "Walrus Memory does not migrate existing data".

Renewal splits the same way. Console uploads renew automatically. Self-managed and agent-owned assets do not: you extend the Walrus blob before the expiry epoch, or the memory disappears. Source: [Manage Your Memory](https://docs.wal.app/walrus-memory/guides/manage-your-memory), heading "Renew memories". An announcement written with `remember` is the second case. The Console storage page's automatic extension does not say it covers that blob.

You do not browse memories by folder. You search them by meaning. `listMemories` returns metadata only, with no decryption. Content comes back from `recall`. Source: [Manage Your Memory](https://docs.wal.app/walrus-memory/guides/manage-your-memory), heading "Browse and search", and [SDK API Reference](https://docs.wal.app/walrus-memory/sdk/api-reference), heading "listMemories(options?)".

## 7. Honest product use for Sederunt

Sederunt can store the announcement sentence with `remember` or, if the sentence is long enough to split, with `analyze`. Both accept text. It can store the PDF or the image as a file in a Console folder, through the web app, the API, or `upload_file`. The sentence can name that file, the way the research template says to store the conclusion and the link rather than the corpus. Source: [System Prompt Templates](https://docs.wal.app/walrus-memory/guides/system-prompt-templates), heading "Research agent". The docs do not describe a foreign key from a memory to a Console file. A name inside the sentence is text. It is not an attachment.

| Landing sentence | Verdict | Why |
| --- | --- | --- |
| The PDF is inside the memory. | False | `remember` and `analyze` take text. A memory is not an arbitrary blob. Sections 5 and 6. |
| The agent can open the file later. | Only with a qualifier | `recall` returns the sentence, not the file. `download_file` can decrypt the Console file later, on a machine that holds the service key, and only for a file uploaded through Console. Section 4. |
| Console shows the memory and the file side by side. | False as a docs claim | The docs put files and the Memory tab in one shell. They do not say one screen pairs a file with the sentence that names it. The product site does say "alongside". Section 9. |
| Console shows the memory text. | False | The overview says metadata only, and the read API sample has no text field. Section 5. |

A sentence that stays inside the docs: the announcement is a Walrus Memory text, the PDF or image is a separate Console file, and the text names the file. Opening the file later is a Console MCP or API download, not a memory recall.

## 8. Scenes the docs name

[What is Walrus Memory?](https://docs.wal.app/walrus-memory), heading "Use cases", names five scenes: AI chat apps, multi-agent workflows, personal AI assistants, cross-app memory, and note-taking and knowledge tools. Heading "Example apps" names Chatbot (portable memory across sessions), Noter (notes stored as memory), and Researcher (a knowledge base that is built and recalled). The codebase guide is a fourth scene: store chunks of code and project context, then recall them. Source: [Codebase Memory for Coding Assistants](https://docs.wal.app/walrus-memory/sdk/codebase-memory), opening paragraph.

The system-prompt page names the same kinds of work more tightly. The personal-assistant template tells the agent to analyze a pasted transcript, note, or email thread. The research template says to store the conclusion and the link, not the corpus. The coding template says not to save the file that is currently open. Source: [System Prompt Templates](https://docs.wal.app/walrus-memory/guides/system-prompt-templates), headings "Personal assistant", "Research agent", and "Coding agent".

What that does and does not cover for Sederunt:

| Sederunt source | What a doc scene actually covers |
| --- | --- |
| A Slack decision | Nothing on these pages names Slack. A decision written down as text fits the chat and note scenes, and the universal starter's "preference, decision, constraint". The pages do not connect a Slack thread. |
| A call | Nothing on these pages accepts an audio file. The personal-assistant template analyzes a transcript only after it is pasted as text. |
| An announcement with a file | The research template's conclusion-and-link line is the closest sentence. It stores text, not the file. Multi-agent "shared memory spaces" are for task lists, knowledge bases, and coordination state. Source: [What is Walrus Memory?](https://docs.wal.app/walrus-memory), heading "Use cases". That sentence does not say agents share a Console file. |

## 9. What the marketing page claims

The product page's own headings, from [Walrus Console](https://walrus.xyz/products/walrus-console/), fetched 20 Oct 2026:

- H1: "Your data. More ways to build."
- H2: "Built for the demands of AI." Under it, three H3s: "Portable" ("Use data across supported apps"), "Programmable" ("Keep your data private by default"), "Verifiable" ("Verify data integrity independently"). "Private" is the body under Programmable. It is not its own H3.
- H2: "From your first file." H3s under it: "Start in seconds", "Put your files to work", "Keep files private by default", "Build on data you can trust", "See your agent memory alongside your files."
- The remember block under that last H3 says: connect an existing Walrus Memory account, and view agent memories alongside your files.
- Feature labels on the same page: Store & Manage, Connect, Protect, Prove, Remember.
- Meta description: encrypted by default, independently verifiable on Walrus, connect via API or MCP, first 5 GB free.

The FAQ headings on that same page, and the claims under them that the docs narrow:

| Marketing sentence | What the docs say instead |
| --- | --- |
| "one place to store data and agent memory" (FAQ "What is Walrus Console?") | Console stores files. Memory is a linked, read-only metadata view. Managing memory stays on the Walrus Memory dashboard. Section 5. |
| "View agent memories alongside your files" | The docs do not say side by side. They say a Memory tab, metadata only, no memory content. |
| "No manual encryption setup or key management" (FAQ "Where are files stored, and are they encrypted?") | True of the Pearl wallet on the web sign-in. False of the API and MCP path, which needs the service private key kept on the machine. Sections 2 and 4. |
| "Files you upload through Console are encrypted by default" | Matches the docs. Every folder is private, and every folder creation in the quick start is the Seal flow. |
| "independently verifiable" | Matches Walrus integrity: a read corresponds to the bytes that were stored. Source: [Data Security](https://docs.wal.app/docs/data-security), heading "Data integrity". Those stored bytes are ciphertext. The page does not say a third party can read the original file. |
| "Up to 5 GB free" and "First 5 GB free" | The docs state a cap of 5 GB per space. They do not say the storage is free, and they do not say it is a launch allotment. |

The announcement, [Introducing Walrus Console](https://walrus.xyz/blog/introducing-walrus-console/), dated 07 Oct 2026 on the page, repeats portable, private, and verifiable under "FAQs", and "Track your agent memory" under "Build on your data, anywhere". Two lines there go past the docs:

- "Memories stored through Walrus Memory are visible in Console alongside your other data." The docs show metadata, not the memory text, and not on the file's own screen.
- "Files uploaded through Console are ordinary Walrus blobs and stay retrievable through the protocol directly." The blob is retrievable. What the protocol returns for a Console file is Seal ciphertext, and a raw blob is public. Section 2.
- "The first 5GB is free during the launch period." The docs do not say "free" or "launch period".
- "Upcoming features include shared company spaces" and "native delegate key creation and management within Console." The current overview says delegate-key management stays on the Walrus Memory dashboard, and the Memory tab is read-only.

The announcement's "encrypted before they leave your device" line matches the Console overview. The product page's "alongside" line does not.

## 10. Landing may say / landing must not say

Landing may say:

- An announcement is a sentence in Walrus Memory. The PDF or the image is a separate file in a private Walrus Console folder, and the sentence names that file.
- Walrus Console encrypts the file on your machine with Seal, then stores the ciphertext on Walrus. Console does not see the file.
- A Console upload is capped at 100 MiB. A space holds up to 5 GB and five folders. Console extends those files before the storage runs out.
- An agent that has the Console MCP, and the service key on that machine, can list that file and download it later. The download decrypts locally.
- The Memory tab lists the memory. It does not show the sentence. Deleting the Console account does not delete the memory.

Landing must not say:

- The PDF is inside the memory.
- `remember` or `analyze` attaches a PDF, an image, or any other file.
- Recall opens the file. Recall returns the sentence.
- Console shows the memory text.
- Console shows the memory and the file side by side.
- Connecting a Walrus Memory account imports Console files as memories.
- Deleting the Console account deletes the memories.
- A raw Walrus blob is private.
- Console renews the announcement memory. Automatic renewal is for files uploaded through Console. An agent-owned memory expires unless something extends that blob.
- The docs promise that a PDF or an image is an accepted upload type. They state the size cap and a rejection code, and they do not list types.
- Storage is free, or the 5 GB cap is a launch allotment. The product site says free. The docs state a cap and do not say free.
