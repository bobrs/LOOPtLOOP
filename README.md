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
npm run typecheck
npm test
npm run dev
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
