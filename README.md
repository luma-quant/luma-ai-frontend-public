# LUMA Quant AI frontend

Publication-review candidate `v0.1.0-rc1` for the user-facing Quant Lab
associated with `https://ai.lumaquant.tech`. Repository publication is pending;
this preparation task has not itself published the candidate.

## What this source proves

This is a source-bound `SANITIZED_PRODUCTION_SOURCE` export from private commit
`b39c2d752abfc9a1c4d151db8519e7b070c7c869`. It contains the real React and
TypeScript product UI for authentication, the Quant workspace, the fiat
Credits Store, analysis and report presentation, analytics, legal surfaces,
error handling, loading and failure states, accessibility behavior, and 245
unit or UI-contract tests.

Analytical execution, model orchestration, authorization, credit accounting
and payment settlement remain server-authoritative. This repository proves the
browser boundary; it does not disclose or reimplement the private engine.

## Deliberate exclusions

- LUMA token, wallet, LUMAKey, NFT and Artifact Network product surfaces
- wallet registration and cross-product workspace handoff
- browser-side simulation, scoring and price-estimation prototypes
- backend payment implementation, webhooks and ledger internals
- administrative interfaces, private feature flags and support credentials
- production service origins, OAuth identifiers and third-party site IDs
- customer data, test-user credentials, source maps and production logs
- system prompts, engine prompts, private specifications and repair scripts

The excluded token portal has its own candidate and security boundary.
`PUBLIC_PRIVATE_BOUNDARY.md` records the complete classification.

## Build and test

Requirements: Node.js 22 or newer and pnpm 11.

```text
cd product
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm audit
```

The reviewed run passed 245/245 tests, TypeScript checking, source lint,
production build and dependency audit with zero known vulnerabilities. The
generated bundle is intentionally not committed.

## Security evidence

The candidate contains a source-bound export script, positive allowlist,
denylist, exact-closure source manifest, CycloneDX SBOM, dependency audit,
Gitleaks result, public-boundary scan and pinned CI workflows. CodeQL is
prepared but intentionally does not execute while the candidate repository is
private (`PREPARED_NOT_EXECUTED`). Dependency Review is gated the same way.
The review workflow runs a pinned, checksum-verified Gitleaks CLI locally and
does not require pull-request write or API access.

## Status and limitations

Production alignment is `SANITIZED_MIRROR`, not exact production parity. The
owner confirms the operator as Luma Quant e.U., the brand as LUMA Quant, the
founder as Johann Weitzer and the jurisdiction as Austria; independent registry
verification was not performed. The source is
`PROPRIETARY_SOURCE_AVAILABLE_ALL_RIGHTS_RESERVED`. Asset publication is
fail-closed to files validated as owned or licensed for public repository use.
The owner-confirmed security contact is `security@lumaquant.tech`; independent
mailbox verification was not performed and no response-time SLA is claimed.

Only legal review and an independent third-party audit remain open review
matters. The product legal-policy source records the owner-confirmed operator
identity while retaining `LEGAL_REVIEW_NOT_YET_COMPLETED` for registration,
address and mandatory disclosure fields. `ASSET_RIGHTS_INVENTORY.json` binds
every included binary asset to its path, size, SHA-256 and owner-attested rights
state. Status `PUBLIC_REPOSITORY_PENDING` means publication has not yet occurred.

The official Trust Center and Engine Evidence repository links are pending the
approved LumaQuant GitHub organization and Trust Center launch; placeholder or
unverified links are intentionally not published here.

See `KNOWN_LIMITATIONS.md`, `SECURITY.md`, `RELEASE.json` and
`PUBLIC_SOURCE_MANIFEST.json` for review details.
