# Build and test report

Public source snapshot: `luma-ai-frontend` `0.1.0-rc1`
Source commit: `b39c2d752abfc9a1c4d151db8519e7b070c7c869`
Owner-metadata revalidation: `2026-08-13`
Public-status alignment validation: `2026-08-13`

| Check | Result |
|---|---|
| Clean pnpm install | PASS |
| Public source lint | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Unit and UI-contract tests | PASS — 245/245 |
| Vite production build | PASS — 2,340 modules |
| Dependency audit | PASS — 0 known vulnerabilities |
| Candidate contract tests | PASS — 10/10 |
| Owner-decision metadata contract | PASS |
| Exact manifest closure | PASS |
| Public repository and URL evidence | PASS — `COMPLETED_VERIFIED` |
| Public source verification workflow | PASS — run `31696137890` |
| CodeQL | PASS — run `31696137753`; 0 open alerts at recorded observation |
| Gitleaks public-tree scan | PASS — 0 findings |

Product source commitment:
`a84c3f10079594ba49646e4f7953f12aae87813247d63897cecb5faf98565567`

Build tree commitment:
`95e0afbeb2e576e2082c2ffbed4dde38d524445be30eaf5b8b3f66f7afbd12cf`

The production build emitted one advisory: the initial JavaScript chunk is
larger than 500 kB after minification. This is recorded as a performance
optimization item and did not fail the build. Generated `dist/` and
`node_modules/` directories are deliberately excluded from the candidate.

The owner-metadata and public-status revalidation used Node.js `24.19.0`, pnpm `11.19.0`,
TypeScript `5.7.3`, Vite `6.4.3`, Python `3.13.1` and Syft `1.51.0`.
