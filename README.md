<p align="center">
  <img src="public/favicon.svg" alt="Sederunt" width="72" height="72">
</p>

<h1 align="center">Sederunt</h1>

<p align="center">
  A meeting agent that keeps the decision and can answer from it later.
</p>

<p align="center">
  <a href="https://sederunt.vercel.app"><img src="https://img.shields.io/badge/Live_demo-sederunt.vercel.app-081428" alt="Live demo"></a>
  <a href="#total-recall"><img src="https://img.shields.io/badge/Track_2-Smart_Agents_for_Real_Life-1B3A4B" alt="Track 2, Smart Agents for Real Life"></a>
  <a href="https://memory.walrus.xyz"><img src="https://img.shields.io/badge/Walrus-Memory_on_Mainnet-1c9cf0" alt="Walrus Memory on Mainnet"></a>
  <a href="https://docs.tatum.io"><img src="https://img.shields.io/badge/Tatum-Sui_gRPC-111111" alt="Tatum Sui gRPC"></a>
</p>


https://github.com/user-attachments/assets/63f84845-ff8a-435d-ae00-6054b085571f


<p align="center">
  <a href="docs/media/sederunt-promo.mp4"><strong>Watch the promo</strong></a>
  &nbsp;·&nbsp;
  <a href="https://sederunt.vercel.app"><strong>Open the app</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/blog/total-recall.md"><strong>Read the write-up</strong></a>
</p>

GitHub plays the video when you open that file. The picture above is the first frame.

## Start here

1. Open [sederunt.vercel.app](https://sederunt.vercel.app) and sign in.
2. Watch the [promo](docs/media/sederunt-promo.mp4).
3. Read [how the record is written and proved](docs/blog/total-recall.md).
4. Open one stored decision on Suiscan: [the booth decision](https://suiscan.xyz/mainnet/object/0xf734ea6c946482d9bf28f6443ea6529099a67cc306717562361cd463438de944).

## What it does

Adam joins a Google Meet. He keeps the decision, the minutes, and the action item. Later, someone can ask what was decided, from the console or from Slack, and the answer comes from that record.

A correction is stored as its own memory. The next answer uses the correction. A preference is stored the same way, so the next draft follows it. The Why list names the memories that changed the answer.

A new Linear issue or calendar event is filed during the call once the tool succeeds. A send, an update, or a delete waits until someone in the room says yes.

## Total Recall

This entry is for **Track 2, Smart Agents for Real Life**, in the Tatum × Walrus hackathon.

The agent is the meeting. Walrus Memory is where the decision lives after the call ends. Tatum is how the app reads that record back from Sui mainnet and shows the proof.

| Piece | Where to look |
| --- | --- |
| Working demo | [sederunt.vercel.app](https://sederunt.vercel.app) |
| Promo | [docs/media/sederunt-promo.mp4](docs/media/sederunt-promo.mp4) |
| Blog post | [docs/blog/total-recall.md](docs/blog/total-recall.md) |
| Mainnet proof | [docs/hackathon/mainnet-seed-proof.json](docs/hackathon/mainnet-seed-proof.json) |
| Public repo | [github.com/ngna3007/sederunt](https://github.com/ngna3007/sederunt) |

On 4 November 2026 the `sederunt` namespace on mainnet held 28 memories. Tatum verified all 28. The checks are `GetObject`, `ListOwnedObjects`, `GetTransaction`, `GetCheckpoint`, and `GetServiceInfo`, sent as native gRPC to `sui-mainnet-grpc.gateway.tatum.io`. Writes go to the Walrus Memory relayer at `relayer.memory.walrus.xyz`. Sederunt holds a delegate key. It does not keep a SUI balance for that write.

If the Tatum key is missing, the proof stays unknown. The app does not switch to a public fullnode.

The technical note is [docs/hackathon.md](docs/hackathon.md).

## Run it yourself

You need the Node version in `.nvmrc`, and npm.

```sh
nvm use
npm ci
SEDERUNT_AUTH_FAKE=1 npm start
```

Then open http://127.0.0.1:8787/console.

That mode is for development. It uses local identities and a fake calendar. It does not show live Google, Slack, Walrus, or Linear.

To run against real services, copy `.env.example` to `.env`, fill in your own credentials, and start the server:

```sh
node --env-file=.env src/server.js
```

Setup guides: [sign-in](docs/auth-setup.md), [connectors](docs/connectors.md), [Walrus files](docs/design/walrus-files.md). Keep tokens and private keys out of git. Do not commit `.local/`.

Check the code with:

```sh
npm test
```

Tests use `node --test`. A few integration tests stay skipped unless you point them at a disposable Postgres or Redis. They are not the live production databases.

## Where to read the code

| Path | What it is |
| --- | --- |
| `src/server.js` | The one Node process |
| `src/meeting/` | Adam in the meeting |
| `src/memory/` | Walrus Memory writes, and how a later answer uses them |
| `src/tatum/` | Tatum gRPC reads and the proof |
| `src/domain/` | The allow check before a write |
| `docs/` | Design notes, the hackathon write-up, and runbooks |

A write goes through `handleUtterance`, and only after an allow.
