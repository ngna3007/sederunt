# Walrus Console: proposed mint sequence for an isolated workspace (NOT executed)

Decision (4 Nov 2026, 23:15 UTC+7): hybrid tenancy.
- Default: every workspace shares one private folder (CONSOLE_FOLDER_ID) with tenant/channel/owner metadata + tags; Postgres RLS + channel membership decide visibility. Scales to any number of workspaces.
- Optional isolated mode: a workspace maps to its own folder + its own child `hbr_` key, granted only that folder's Seal group.

Free plan cap: 5 folders per space (the space uses 1 today: "Sedurent-testing"), 5 GB per space, 100 MiB per upload. So at most 4 isolated workspaces on free; more needs a paid plan or another space.

Nothing below has been run. Each step needs explicit approval. All calls are free (Console sponsors gas via Enoki). Secret values never go in the repo, logs or the DB in plaintext.

Base: https://api.console.walrus.xyz/api/v1

## Step 0 — prerequisites (read-only)
- `GET /spaces` (Bearer CONSOLE_API_KEY) → confirm `bucket_count < 5` for CONSOLE_SPACE_ID.
- `GET /api-keys/space-signers` (Bearer CONSOLE_API_KEY) → roster of signer addresses that new folders include.

## Step 1 — create the workspace folder (working key)
1. `POST /spaces/{CONSOLE_SPACE_ID}/buckets` (Bearer CONSOLE_API_KEY) body `{"name":"sederunt-<tenant-short>","scope":"private"}` → 201 `{bucket_id, bytes, digest, provisioning_state:"pending_policy", owner_address, admin_signer_address}`.
   Check `owner_address == CONSOLE_WEB_ACCOUNT_ADDRESS` and `admin_signer_address == CONSOLE_KEY_ADMIN_ADDRESS` before signing.
2. Sign `bytes` with CONSOLE_SERVICE_PRIVATE_KEY (Ed25519 transaction signature, base64).
3. `POST /buckets/{bucket_id}/finalize` body `{"signature":"<b64>"}` → `{bucket_id, seal_policy_id, provisioning_state:"active"}`.
4. Retry uploads on 403 `mirror_missing_grant` for a few seconds. Record folder id + seal_policy_id in Postgres (`console_folders`) and map the tenant to it.
(The group id G for this folder comes back in the mint response's `private_buckets[{bucket_id, group_id}]`, or from the sponsor response of `bucket_group_create`.)

## Step 2 — mint the child working key (key_admin, provisioning host only)
5. Generate a fresh Ed25519 keypair locally → child address `A`, child `suiprivkey1…` (kept in memory, written only to the secret store).
6. `POST /api-keys` (Bearer CONSOLE_ADMIN_KEY) body `{"permissions":"read_write","serviceSignerAddress":"A","name":"sederunt-<tenant-short>"}` → 201 `{id, key:"hbr_…", space_id, status:"registering", private_buckets:[{bucket_id, group_id}]}`.
   POINT OF NO RETURN: never retry this call on a later failure; a retry mints a second key and orphans the first (revoke only in the Console web app → Integrations, by key name).
7. Verify `space_id == CONSOLE_SPACE_ID`.

## Step 3 — scope the child to that folder only (key_admin)
8. `POST /seal/sponsor` (Bearer CONSOLE_ADMIN_KEY) body `{"kind":"grant_bucket_access","groupIds":["G"],"recipientAddress":"A","scope":"readwrite"}` → `{bytes, digest}`. (Only G, not every group in `private_buckets`, so the child cannot decrypt the shared folder.)
9. Sign `bytes` with CONSOLE_ADMIN_SERVICE_PRIVATE_KEY.
10. `POST /seal/sponsor/{digest}/execute` body `{"signature":"<b64>"}` → `{digest:<on-chain digest>}` (410 `sponsor_digest_expired` → redo 8–10, NOT step 6).
11. Poll `GET /api-keys/{id}` (Bearer CONSOLE_ADMIN_KEY) until `data.status == "active"`.

## Step 4 — store and wire up
12. Encrypt `{hbr key, child suiprivkey}` the same way as `mcp_connector_secrets` (AES-GCM with the server key) into the server-only credentials table; store only a credential reference + folder id on the tenant's Console mapping.
13. Smoke test with the child key: upload a tiny file to folder F, poll, download + decrypt, delete. Confirm the child key gets 403 `bucket_not_in_scope` on the shared folder.

## Caveats
- Console API keys cannot be revoked or listed over the API (`session_required`); rotation/revoke is a manual Console web-app step.
- Folder delete (`DELETE /buckets/{id}?confirm=true`) cascades to all files; only for off-boarding an isolated workspace.
- The official tool alternative: `generate_api_key` in @mysten-incubation/walrus-console-mcp, but it grants the child access to ALL existing private folders, so it does not give folder isolation without extra steps.
- Do not grant end-user Sui addresses access to the shared folder (it would bypass channel membership).
