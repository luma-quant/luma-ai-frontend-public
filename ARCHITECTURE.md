# Architecture

## Runtime boundary

The product is a static React 19 and Vite client. The browser authenticates
through public request contracts and receives server-authoritative balances,
capabilities, lifecycle states, quotes, reports and ledger views. It does not
contain model-provider credentials, server signing keys, database access or
the LUMA analytical engine.

```text
Browser UI
  -> public authentication and product API contracts
  -> private platform API (not included)
  -> private engine, ledger and payment implementation (not included)
```

Authentication tokens are managed by the browser session layer. Legal access
is fail-closed. Mutating analysis and payment requests use server-issued
contracts plus client-side recovery and idempotency state; final authority
always remains on the server.

## Export boundary

`scripts/build_public_ai_frontend_export.py` reads a pinned Git commit object,
never the private working tree. It applies a positive selection, blocks known
private product areas, performs reviewed fail-closed transformations and writes
the sanitized `product/` tree. The export records every original source object
and transformation in `SOURCE_PROVENANCE.json`.

The token portal, wallet and Artifact Network are separate products. Old
unreachable browser prototypes containing simulation, scoring, pricing or demo
identity data are not part of this candidate.
