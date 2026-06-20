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
