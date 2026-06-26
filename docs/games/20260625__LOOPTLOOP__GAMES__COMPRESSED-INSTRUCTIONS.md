# LOOPtLOOP Games Update Pack

## Purpose

Compressed handoff for future updates that need to respect the Games layer, the API invariant, and public surface hygiene.

## What This Repo Is

- Cloudflare Worker API in TypeScript
- D1-backed authorization witnessing service
- Public static `public/` surface
- Possible future Astro/public-site surfaces
- Multiple hostnames, subdomains, and aliases that must be kept explicit

## Core Invariants

- Private payload stays private.
- Do not log or store raw private payload text.
- `https://api.looptloop.online/v0` is the canonical API base.
- `looptloop.io` and `api.looptloop.io` are deprecated unless a later directive replaces them.
- Aliases are aliases only when documented in `wrangler.toml`, tests, and public docs.

## Update Order

1. Inventory first.
2. Check the stack: Worker/API, static public files, or Astro/source-driven surface.
3. Update reentry notes if a public surface exists.
4. Keep public machine surfaces aligned:
   - `robots.txt`
   - `sitemap.xml`
   - `llms.txt`
   - `LICENSE` + `IPOL.md`
5. Use `MERGED_LICENSE.md` only when one file is the practical choice.
6. For Astro, keep layout-level changes source-aware and avoid universalizing local choices.
7. For aliases and subdomains, keep canonical host mappings centralized.
8. Validate with tests, typecheck, and direct review of public files.

## Games Treatment Rules

- Add a subtle threshold marker only on public site surfaces, not on API routes.
- Keep aperture pages bounded and optional.
- Keep machine-readable files descriptive only.
- Do not add analytics, tracking, or hidden-control logic.
- Do not change primary navigation unless explicitly authorized.
- Do not expose internal repo memory in public files.

## License Package Rules

- Prefer `LICENSE` + `IPOL.md`.
- Use `MERGED_LICENSE.md` only when a single-file license artifact is the practical choice.
- Keep the public license package aligned with any `llms.txt` or reuse statement.

## Public Surface Rules

- `robots.txt` is crawler control.
- `sitemap.xml` is crawl legibility.
- `llms.txt` is public machine invitation and summary.
- The license package is public reuse posture.
- The four should agree without collapsing into one another.

## Hold Conditions

Hold rather than guess when:

- the build/deploy path is unclear
- the site is API-only with no public web surface
- an alias or subdomain is not documented
- the repo already has a different license structure
- Astro/source generation details are not yet known

## Minimal Files To Check Before Changing Anything

- `AGENTS.md`
- `README.md`
- `wrangler.toml`
- `public/index.html`
- `src/index.ts`
- `docs/private-authorization-witnessing-v0.1.md`
- `migrations/*.sql`

## Recommended Public Files When a Website Surface Exists

- `public/robots.txt`
- `public/sitemap.xml`
- `public/llms.txt`
- `public/LICENSE`
- `public/IPOL.md`
- `public/MERGED_LICENSE.md` only if needed

## Last Rule

If a proposed update would weaken privacy, blur canonical hosts, or create hidden authority, stop and hold.
