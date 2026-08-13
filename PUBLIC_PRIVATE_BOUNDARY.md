# Public/private boundary

## Included

- reachable Quant Lab React components and styles
- public email/SSO authentication client interfaces and session handling
- fiat Credits Store UI and safe checkout/reconciliation client contracts
- analysis, report, analytics, ticket and legal presentation
- API response contracts, validation, error translation and recovery UX
- unit tests and source-level UI contract tests
- used public image assets
- sanitized static build configuration and placeholder-only environment sample

## Excluded

- system or engine prompts and model orchestration
- backend authorization, databases, payment webhooks and credit-ledger internals
- engine selection, scoring, simulation and browser price-estimation prototypes
- token portal, wallet, LUMAKey, NFT and Artifact Network functionality
- wallet registration, workspace handoff and cross-product navigation
- transaction signing, treasury, sale, transfer and antifraud logic
- admin/debug interfaces, private flags and one-off implementation scripts
- production endpoints and third-party identifiers
- secrets, service accounts, credentials, private keys and seed material
- customer, wallet, payment, transaction and production-log data
- source maps and generated dependency/build directories

## Classification

`SANITIZED_PRODUCTION_SOURCE` with `SANITIZED_MIRROR` alignment. This candidate
is source-bound to the real private production frontend but intentionally
differs at the documented security and product boundaries.
