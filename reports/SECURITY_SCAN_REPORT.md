# Security scan report

Candidate release: `0.1.0-rc1`  
Gitleaks version: `8.30.1`  
Syft version: `1.51.0`

## Final candidate

| Check | Result |
|---|---|
| Gitleaks directory scan | PASS — 0 findings |
| Secret-pattern scan | PASS — 0 findings |
| Private/internal endpoint scan | PASS — 0 findings |
| Local absolute-path scan | PASS — 0 findings |
| Personal/test-data boundary scan | PASS — 0 findings |
| Wallet key/seed/service-account scan | PASS — 0 findings |
| Proprietary browser-logic scan | PASS — 0 findings |
| Generated/cache/source-map denylist | PASS — 0 findings |
| Dependency vulnerability audit | PASS — 0 findings |
| Exact all-file manifest closure | PASS |
| Exporter private-value reconstruction regression | PASS |
| Transformed-source Git blob binding | PASS |
| Operator identity metadata | PASS — owner-confirmed; independent registry verification not performed |
| Security disclosure route | PASS — owner-confirmed address; independent mailbox verification not performed |
| Outbound license decision | PASS — proprietary source-available, all rights reserved |
| Open review matters | PASS — legal review and independent third-party audit only |

## Private source history triage

The complete private mixed-frontend Git history produced four Gitleaks generic
key detections. Manual redacted triage classified all four as non-secret test
fixtures; no credential value is reproduced here.

| Rule | Path | Commit | Severity | Redacted fingerprint | Remediation |
|---|---|---|---|---|---|
| generic-api-key | `src/api/tokenPortalValueRail.test.ts` | `0b4d8314c2c843e26a6d56c2b5fd93ca8140e661` | false positive | `...:generic-api-key:186` | Token-only synthetic account fixture; excluded from AI candidate |
| generic-api-key | `src/api/tokenPortalValueRail.test.ts` | `0b4d8314c2c843e26a6d56c2b5fd93ca8140e661` | false positive | `...:generic-api-key:188` | Token-only synthetic account fixture; excluded from AI candidate |
| generic-api-key | `src/api/advisorRunRecovery.test.ts` | `c5b28ff3d8ef535058ba45cc575ff2b819aa038d` | false positive | `...:generic-api-key:71` | Synthetic UUID replaced in public export |
| generic-api-key | `src/api/backendData.test.ts` | `c5b28ff3d8ef535058ba45cc575ff2b819aa038d` | false positive | `...:generic-api-key:709` | Synthetic UUID replaced in public export |

The initial public CodeQL run identified four test-only
`js/incomplete-sanitization` findings. This candidate replaces the incomplete
dynamic regular-expression handling with deterministic literal checks and is
locally verified; the public CodeQL rerun is still pending, so no zero-alert
claim is made yet. Dependency Review is enabled for public pull requests. The
review workflow uses a checksum-verified Gitleaks 8.30.1 CLI without PR write
or API access.
No independent third-party audit has been completed. Legal review and the
independent third-party audit remain the two open review matters. Owner
confirmation of identity, asset policy, outbound license and the security
contact is recorded without presenting it as independent verification.
