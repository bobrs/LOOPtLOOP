# LOOPtLOOP API Seed: Private Authorization Witnessing v0.1

This repository seed implements the starting structure for the LOOPtLOOP / WitnessKey Private Authorization Witnessing API.

Canonical API destination:

```txt
https://api.looptloop.online/v0
```

`looptloop.io` has lapsed. Do not use `api.looptloop.io` in new code.

## Core service wedge

WitnessKey provides privacy-preserving third-party confirmation of authorization events by witnessing hashes and consent envelopes instead of private payloads.

Compressed architecture:

```txt
Abracadoo participates. WitnessKey witnesses. LOOPtLOOP binds.
```

## Core invariant

Private payload stays private. LOOPtLOOP / WitnessKey must never receive or store the private authorization payload. The API stores only hashes, consent envelopes, role declarations, timestamps, schema versions, and receipt signatures.

## v0.1 scope

Build only:

- Authorization offer creation
- Offer fetch
- Offer accept/reject
- Authorization event creation
- Receipt generation
- Verification endpoint
- D1 persistence
- Basic tests

## Non-goals

Do not build accounts, billing, OAuth, Web3, hardware/NFC, healthcare mode, legal identity verification, multi-party loops, or AI-agent action execution.

## Suggested setup

```bash
npm install
npm run d1:migrate:local
npm run typecheck
npm test
npm run dev:local
```

## Cloudflare resources

Suggested names:

```txt
Worker: looptloop-api
D1 database: looptloop_witness_v01
D1 binding: DB
Secret: RECEIPT_SIGNING_SECRET
Canonical route: api.looptloop.online/*
```

## First Codex task

Implement the Cloudflare Worker API skeleton for the v0.1 Private Authorization Witnessing spec in `docs/private-authorization-witnessing-v0.1.md`.

Routes:

```txt
POST /v0/authorization-offers
GET  /v0/authorization-offers/:offer_id
POST /v0/authorization-offers/:offer_id/accept
POST /v0/authorization-offers/:offer_id/reject
GET  /v0/authorization-events/:event_id
GET  /v0/authorization-events/:event_id/verify
```

Use D1 binding `DB`. Use explicit JSON errors. Do not accept or store private payload text. Add tests for route shape and validation.

## Local validation

Apply the D1 migrations locally:

```bash
npm run d1:migrate:local
```

Run the Worker locally with the same local D1 binding:

```bash
npm run dev:local
```

Create an authorization offer without sending any private payload text:

```bash
curl -sS http://127.0.0.1:8787/v0/authorization-offers \
  -H 'content-type: application/json' \
  -d '{
    "issuer": {
      "name": "WitnessKey",
      "origin": "https://witnesskey.online"
    },
    "event_type": "private_authorization_witnessed",
    "payload_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payload_label": "Demo authorization payload",
    "declared_roles": ["user", "ai_agent"],
    "consent_prompt": "I consent to hash-based authorization witnessing only.",
    "return_url": "https://abracadoo.app/return"
  }'
```

Fetch that offer locally after replacing `<offer_id>` with the value from the create response:

```bash
curl -sS http://127.0.0.1:8787/v0/authorization-offers/<offer_id>
```

Accept the offer after replacing `<offer_id>` and `<consent_prompt_hash>`:

```bash
curl -sS http://127.0.0.1:8787/v0/authorization-offers/<offer_id>/accept \
  -H 'content-type: application/json' \
  -d '{
    "schema": "WITNESSKEY_AUTHORIZATION_ACCEPTANCE_0_1",
    "accepted_by": {
      "app": "abracadoo.app",
      "participant_ref": "local-demo-user",
      "participant_role": "authorizer"
    },
    "consent_action": "accept",
    "consent_prompt_hash": "<consent_prompt_hash>"
  }'
```

Compute the `consent_prompt_hash` locally without sending any private payload:

```bash
node -e 'crypto.subtle.digest("SHA-256", new TextEncoder().encode("I consent to hash-based authorization witnessing only.")).then((digest) => console.log("sha256:" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")))'
```

Fetch and verify the created authorization event after replacing `<event_id>`:

```bash
curl -sS http://127.0.0.1:8787/v0/authorization-events/<event_id>
curl -sS http://127.0.0.1:8787/v0/authorization-events/<event_id>/verify
```

## Provenance loop prototype

Minimal provenance loop endpoints:

```txt
POST /v0/provenance-loops
GET  /v0/provenance-loops/:loop_id
GET  /v0/provenance-loops/:loop_id/current
```

The provenance loop makes a narrow claim:

```txt
During recording, this video visibly contained a live provenance signal that can be verified later.
```

It does not prove video truth, identity, or that the final exported file was never edited.

## Provenance manual validation

1. Start the Worker and local D1 database:

```bash
npm install
npm run d1:migrate:local
npm run dev:local
```

2. Serve the static `public` directory from an allowed local origin:

```bash
python3 -m http.server 5173 -d public
```

3. Open the live overlay page with the local API override:

```txt
http://localhost:5173/provenance/?api_base=http://127.0.0.1:8787/v0
```

4. Create a live loop and confirm the page shows:
   - a new `LP-...` loop ID
   - a rotating live code
   - a countdown
   - a verification URL
   - both `Full-card mode` and `Compact single-line mode`

5. Record a short screen capture while the overlay is visible.

6. Open the verifier page with the same local API override:

```txt
http://localhost:5173/provenance/verify/?loop_id=<loop_id>&api_base=http://127.0.0.1:8787/v0
```

7. Confirm the verifier shows:
   - loop metadata
   - active or expired status
   - stored code windows
   - the same visible code window that appeared during recording when that window has been observed by the API

8. Confirm the non-claims remain explicit:
   - does not prove video truth
   - does not prove identity
   - does not prove the final file is unedited
   - proves only visible participation in a live provenance loop

## WitnessMark manual validation

There is no automated browser harness in this repo for the WitnessMark page. Validate the external integration manually:

1. Start the Worker API:

```bash
npm install
npm run d1:migrate:local
npm run dev:local
```

2. Open [public/witnessmark/index.html](</Users/bob/Library/CloudStorage/GoogleDrive-bob@simpsoncentral.com/Shared drives/DeepTrust Labs/Github/LOOPtLOOP/public/witnessmark/index.html>) in a browser.

3. Select `External WitnessKey authorization loop`.

4. Enter a private input and confirm the consent checkboxes.

5. Create the mark and confirm:
   - the page shows `Pending Abracadoo acceptance`
   - the receipt text includes the local `sha256:` fingerprint
   - the raw private input remains only in the page receipt and is not sent to the API
   - the acceptance handoff URL is shown

6. Click `Developer accept via API` and confirm:
   - the page shows `Accepted. Authorization event and receipt are ready.`
   - the receipt renders returned event and receipt JSON
   - copy, download, and print still work

7. Repeat with `Developer reject via API` and confirm:
   - the page shows `Rejected. No authorization event was created.`

8. Repeat with `Refresh external status` and confirm:
   - `pending`, `accepted`, `rejected`, `expired`, and API/network error states render visible status copy

## Verification page manual validation

There is no automated browser harness in this repo for the human-facing verification page. Validate it manually:

1. Start a static file server from the repo root:

```bash
python3 -m http.server 8000
```

2. Open the static page with a known event ID:

```txt
http://127.0.0.1:8000/public/verify/index.html?event_id=we_TEST_VALID_EVENT_ID
```

3. Confirm the page calls:

```txt
https://api.looptloop.online/v0/authorization-events/we_TEST_VALID_EVENT_ID/verify
```

4. For a known valid event, confirm the page renders:
   - `verification status`
   - `receipt_signature_valid`
   - `event_id`
   - `payload_hash`
   - issuer name/origin if returned
   - participant app/ref if returned
   - declared roles if returned
   - `created_at`
   - `expires_at`
   - claims
   - non-claims
   - storage policy

5. Open the page with a missing or invalid event ID and confirm it shows:
   - `Missing event_id` when none is present
   - `Event not found` for a 404 verifier response
   - `Verification failed` when the API returns a non-verified result
   - `Network/API error` when the verifier cannot be reached

6. If the page is deployed behind a route rewrite, also confirm path extraction works:

```txt
/verify/we_TEST_VALID_EVENT_ID
```

7. Confirm the page never asks for, uploads, or stores private payload content.

## Receipt signing

v0.1 development signing uses HMAC-SHA256 with `RECEIPT_SIGNING_SECRET`. The implementation is isolated in:

- `src/signing/canonicalize.ts`
- `src/signing/receipt-signing.ts`

The signature is computed over a stable canonical material object, not over ad hoc response JSON. The covered fields are:

- `schema`
- `event_id`
- `offer_id`
- `loop_id`
- `event_type`
- `issuer_name`
- `issuer_origin`
- `payload_hash`
- `participant_app`
- `participant_ref`
- `participant_role`
- `declared_roles`
- `consent_prompt_hash`
- `storage_policy`
- `claims_policy`
- `created_at`
- `expires_at`
- `verification_url`

`receipt_signature` is explicitly excluded from the signed material.

Planned upgrade path after v0.1:

- keep the same canonical material definition
- replace HMAC-SHA256 with Ed25519
- publish a verification key and rotation policy
