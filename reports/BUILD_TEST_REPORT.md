# Build and test report

Candidate: `luma-ai-frontend` `0.1.0-rc1`  
Source commit: `b39c2d752abfc9a1c4d151db8519e7b070c7c869`
Owner-metadata revalidation: `2026-08-13`

| Check | Result |
|---|---|
| Clean pnpm install | PASS |
| Public source lint | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Unit and UI-contract tests | PASS — 245/245 |
| Vite production build | PASS — 2,340 modules |
| Dependency audit | PASS — 0 known vulnerabilities |
| Candidate contract tests | PASS — 6/6 |
| Owner-decision metadata contract | PASS |
| Exact manifest closure | PASS |

Product source commitment:
`0fd7782e6d04e4719744ee89b7ed505e2235a6740fa26483c861af68adba7ade`

Build tree commitment:
`020ff73549371d0ae43e63810d9da3937e17add946a25f7b037424f908c5a3c6`

The production build emitted one advisory: the initial JavaScript chunk is
larger than 500 kB after minification. This is recorded as a performance
optimization item and did not fail the build. Generated `dist/` and
`node_modules/` directories are deliberately excluded from the candidate.

The owner-metadata revalidation used Node.js `24.19.0`, pnpm `11.19.0`,
TypeScript `5.7.3`, Vite `6.4.3`, Python `3.13.1` and Syft `1.51.0`.
