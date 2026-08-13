# LUMA Quant AI frontend

Public Trust Layer v1.0 source snapshot `v0.1.0-rc1` for the user-facing Quant
Lab associated with `https://ai.lumaquant.tech`. This repository is public and
its repository component status is `PUBLIC_OPERATIONAL`. That status describes
the public source, verification and security workflow; it is not a new product
deployment claim.

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

The repository contains a source-bound export script, positive allowlist,
denylist, exact-closure source manifest, CycloneDX SBOM, dependency audit,
Gitleaks result, public-boundary scan and pinned CI workflows. CodeQL is active
in the public repository. The initial scan identified four test-only
incomplete-sanitization findings; commit
[`53a12f3a7e1203729a85104a722f4ce1ccb55bd5`](https://github.com/luma-quant/luma-ai-frontend-public/commit/53a12f3a7e1203729a85104a722f4ce1ccb55bd5)
contains the fixes. The subsequent [public review workflow](https://github.com/luma-quant/luma-ai-frontend-public/actions/runs/31696137890)
and [CodeQL run](https://github.com/luma-quant/luma-ai-frontend-public/actions/runs/31696137753)
both succeeded, with zero open CodeQL alerts at the observation time recorded
in `RELEASE.json`. Dependency Review runs for public pull requests. The public
review workflow uses a pinned, checksum-verified Gitleaks CLI and does not
require pull-request write or API access.

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
state. Repository creation, URL, public visibility and public CI are recorded as
`COMPLETED_VERIFIED` in `RELEASE.json`.

The Engine Evidence component is published at
[`luma-quant/luma-engine-evidence-public`](https://github.com/luma-quant/luma-engine-evidence-public).
Trust Center website integration is a separate publication surface. The
non-public staging history remains non-public and is not part of this fresh
public repository history. No deployment, payment settlement or delivery
status is claimed by this source publication.

See `KNOWN_LIMITATIONS.md`, `SECURITY.md`, `RELEASE.json` and
`PUBLIC_SOURCE_MANIFEST.json` for review details.
