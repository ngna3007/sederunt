# Total recall for a meeting

Sederunt sits in the meeting and keeps the decision. Later, someone asks what was decided, and the answer comes back from that record. The record is a Walrus Memory on mainnet. The proof that the blob is the one we wrote is a Sui object, read through Tatum.

## What it does

A sentence from the room becomes a memory: the decision, the minutes, or an action item, each with a kind and a small JSON payload. The payload names the room, who was there, who owns the action, and when it is due. The same sentence can be asked again from the console, from chat, or from Slack.

The room page shows a Proof panel. It lists the blob id, the Sui object id, the certifying transaction, the checkpoint, and the time. Each id is a link on Suiscan. The line under the facts says how many Tatum calls this page made and what the latest checkpoint is. Verify again runs the check once more. The status is verified, unverified, or unknown, and the reason is one sentence.

## How it uses Tatum and Walrus

Walrus Memory is the write. The company account talks to the managed relayer at `https://relayer.memory.walrus.xyz`. The relayer pays the storage and the gas. Sederunt holds a delegate key, not an owner key, and it does not keep a SUI balance for that write.

Tatum is the read. Every Sui mainnet call in the app is a native gRPC unary RPC to `https://sui-mainnet-grpc.gateway.tatum.io`, with the API key in `x-api-key`. The client is `SuiGrpcClient` from `@mysten/sui`. The gateway does not accept the SDK's default grpc-web transport, so the app sends `application/grpc` frames over HTTP/2 itself.

Finding a memory on chain is a short walk. `remember` returns the owner address. `ListOwnedObjects` asks for that owner's Walrus Blob objects. The blob id is a 32-byte value inside the object. `GetObject` reads it, and `GetTransaction` reads the checkpoint of the certifying transaction. The next time, the object id is already stored, so the walk is one `GetObject`. `GetServiceInfo` supplies the latest checkpoint so the panel has a live tip to stand next to the proof.

If the key is missing, or the read fails, the proof stays unknown. There is no quiet hop to a public fullnode.

## How it learned over time

Search is not the same as learning. Before Sederunt answers, it recalls a few memories from the `sederunt` namespace and lets them change the words.

The first time someone asks where the offsite is, the answer is the decision from the room: Da Nang. Later someone says the offsite is in Lisbon. That correction is itself a memory. The next time the question is asked, the answer is Lisbon, and Why opens to the correction, when it was said, and whether Tatum has verified that blob.

A preference works the same way. "Post minutes to #sederunt-demo" is remembered. The minutes drafted when the meeting ends include that delivery. An action item remembers who owned the banner last time, so the next draft does not invent a new owner.

The loop is ordinary code. No new model is required. The memories are the state, the answer is a pure function of the question and those memories, and the Why panel is the list that function used. A retry of the same correction does not write a second blob. The idempotency key is the kind and a hash of the text.

That is the piece a judge can see: the product said one thing, a memory was kept, and the product said another.
