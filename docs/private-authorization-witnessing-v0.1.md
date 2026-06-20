# WitnessKey / LOOPtLOOP / Abracadoo
## Private Authorization Witnessing v0.1 - Developer Implementation Spec

Date: 2026-06-19  
Version: 0.1  
Status: Draft for first implementation

## Canonical deployment target

```txt
https://api.looptloop.online/v0
```

`looptloop.io` has lapsed. `api.looptloop.io` is deprecated and must not be used in new code. The `looptloop.online` domain and `api.looptloop.online` subdomain are prepared at Cloudflare.

## Purpose

This specification defines the first working implementation of a privacy-preserving authorization witness service.

The service allows participants, such as a user and an AI agent, a user and an app, two users, or any loop-capable combination, to privately exchange or agree to an authorization payload. WitnessKey / LOOPtLOOP then witnesses only the hash and metadata envelope of that private authorization event.

The result is an auditable third-party receipt confirming that an authorization event was witnessed, without requiring the witness service to receive or store the sensitive authorization content itself.

## Product summary

One-sentence positioning:

> WitnessKey provides privacy-preserving third-party confirmation of authorization events by witnessing hashes and consent envelopes instead of private payloads.

Compressed architecture:

```txt
Abracadoo participates. WitnessKey witnesses. LOOPtLOOP binds.
```

## Roles

| System | Role |
|---|---|
| WitnessKey / WitnessMark | User-facing witness surface, receipt display, verification page, hash-only event witness UI. |
| LOOPtLOOP API | Consent loop / witness event API, offer lifecycle, event record, receipt signature, verification endpoint. |
| Abracadoo.app | Participant runtime, consent acceptance interface, local receipt storage, local path/loop-aware wallet. |

## Core invariant

Private payload stays private. WitnessKey / LOOPtLOOP must never receive or store the private authorization payload. The API stores only hashes, consent envelopes, role declarations, timestamps, schema versions, and receipt signatures.

## v0.1 user flow

1. User opens WitnessKey / WitnessMark.
2. User enters or generates a private authorization payload locally.
3. Browser computes `payload_hash`.
4. User consents to hash-witnessing.
5. WitnessKey creates a witness offer through the LOOPtLOOP API.
6. User is sent to Abracadoo to review and accept the offer.
7. Abracadoo displays the issuer, hash, declared roles, storage policy, and consent prompt.
8. User accepts.
9. Abracadoo posts acceptance to LOOPtLOOP.
10. LOOPtLOOP creates a witness event and signed receipt.
11. Abracadoo stores the receipt locally.
12. User returns to WitnessKey.
13. WitnessKey displays the receipt and verification link.

## Event types

v0.1 supports one primary event type:

```txt
private_authorization_witnessed
```

Future compatible event types may include:

```txt
content_co_witnessed
agent_action_authorized
relationship_boundary_witnessed
payload_exchange_witnessed
field_presence_witnessed
```

Only `private_authorization_witnessed` is in scope for v0.1.

## Schemas

Schema files live in `docs/schemas/`.

- `authorization-offer.schema.json`
- `authorization-acceptance.schema.json`
- `authorization-event.schema.json`
- `authorization-receipt.schema.json`

## API endpoints

Base URL:

```txt
https://api.looptloop.online/v0
```

### Create authorization offer

```txt
POST /authorization-offers
```

Creates a short-lived offer to witness a private authorization payload by hash.

Request fields:

- `issuer.name`
- `issuer.origin`
- `event_type`
- `payload_hash`
- `payload_label`
- `declared_roles`
- `consent_prompt`
- `return_url`

Response fields:

- `offer_id`
- `status`
- `accept_url`
- `expires_at`

### Get authorization offer

```txt
GET /authorization-offers/:offer_id
```

Used by Abracadoo to fetch offer details.

### Accept authorization offer

```txt
POST /authorization-offers/:offer_id/accept
```

Used by Abracadoo to accept the offer after explicit user consent.

### Reject authorization offer

```txt
POST /authorization-offers/:offer_id/reject
```

Used by Abracadoo if the user declines.

### Get authorization event

```txt
GET /authorization-events/:event_id
```

Returns public, non-sensitive event metadata. Must not return private payload.

### Verify authorization event

```txt
GET /authorization-events/:event_id/verify
```

Returns verification status.

## Offer lifecycle

Allowed offer statuses:

```txt
offered
accepted
rejected
expired
revoked
error
```

Allowed event statuses:

```txt
active
expired
revoked
superseded
error
```

v0.1 behavior:

- Offers expire after five minutes by default.
- Expired offers cannot be accepted.
- Accepted offers cannot be accepted again.
- Rejecting an offer terminates the offer.
- Revocation may be implemented after v0.1 if needed.

## Signing

v0.1 development mode may use HMAC-SHA256 with `RECEIPT_SIGNING_SECRET`.

Future production direction:

- Ed25519 signing key
- published public verification key
- deterministic event canonicalization
- signature over canonical event body
- key rotation policy

## Security and privacy requirements

Must:

- Never require private payload upload.
- Never store private payload by default.
- Expire offers.
- Prevent accepting expired offers.
- Prevent double acceptance.
- Record claims and non-claims.
- Make storage policy visible before acceptance.
- Make verification possible without revealing private payload.
- Rate-limit public offer creation before production.
- Use CORS allowlists for known app origins during v0.1.

Must not:

- Claim legal consent.
- Claim legal identity.
- Claim authorship.
- Claim truth.
- Claim that the authorized action was actually performed.
- Claim absence of coercion.
- Store hidden behavioral history.
- Use the private payload for analytics.

## Non-goals for v0.1

Do not build:

- accounts
- billing
- organizations
- OAuth
- Web3 wallet integration
- NFT logic
- hardware/NFC/ESP32 anchors
- healthcare compliance mode
- legal identity verification
- multi-party loops
- AI-agent automation execution
- production-grade key management
- mobile push notifications
- full loop directory

## First test cases

1. Create offer: valid payload hash and consent prompt return an offer ID and Abracadoo accept URL.
2. Fetch offer: Abracadoo can fetch offer by ID and display payload hash and storage policy.
3. Accept offer: an unexpired offer can be accepted and returns event and receipt.
4. Reject offer: an unexpired offer can be rejected and no event is created.
5. Expired offer: expired offer acceptance fails.
6. Verify event: valid event ID returns signature status and public event metadata.
7. Private payload never stored: database contains `payload_hash` but no raw private payload text.
8. Receipt comparison: original private payload can be locally hashed and compared with receipt hash.

## First sprint definition of done

A user can:

1. Create a private authorization payload locally.
2. Witness only its hash through WitnessKey / LOOPtLOOP.
3. Accept the witness loop through Abracadoo.
4. Receive and store a receipt.
5. Verify that receipt later without revealing the private payload.
