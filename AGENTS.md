# AGENTS.md

## Project

This repository implements the WitnessKey / LOOPtLOOP Private Authorization Witnessing API.

Canonical API base:

```txt
https://api.looptloop.online/v0
```

`api.looptloop.io` is deprecated and must not be used in new code.

## Core invariant

WitnessKey / LOOPtLOOP must never receive or store the private authorization payload. Only hashes, consent envelopes, role declarations, timestamps, schema versions, and receipt signatures are stored.

## Current scope

Build v0.1 only:

- authorization offer creation
- offer fetch
- offer accept/reject
- authorization event creation
- receipt generation
- verification endpoint
- D1 persistence
- basic tests

## Non-goals

Do not implement accounts, billing, OAuth, Web3, hardware/NFC, healthcare mode, legal identity verification, multi-party loops, or AI-agent action execution.

## Tech stack

- Cloudflare Workers
- TypeScript
- D1
- Wrangler
- Vitest

## Commands

Install:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Test:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Deploy:

```bash
npm run deploy
```

## Coding style

- Prefer small modules.
- Keep schema constants explicit.
- Do not silently add fields to public schemas.
- All API responses must be JSON.
- All timestamps must be ISO 8601 UTC.
- Use clear error codes.
- Avoid dependencies unless they meaningfully reduce risk.

## Security rules

- Never log private payloads.
- Never add a request field that asks for raw private payload text.
- Reject payload hashes that do not start with `sha256:`.
- Offers expire.
- Expired offers cannot be accepted.
- Accepted offers cannot be accepted twice.
- Verification endpoints must not expose private payloads.
- Do not use private payloads for analytics.

## Review checklist

Before completing a task, confirm:

- tests pass
- no private payload storage was introduced
- API base remains `https://api.looptloop.online/v0`
- schemas match docs
- errors are explicit

## Do not invent

Do not invent new product concepts, new event types, new identity systems, or new persistence layers. Implement exactly v0.1 Private Authorization Witnessing. When unsure, choose the smallest implementation that preserves the invariant: private payload stays private.
