# Dependency audit report

The reviewed candidate used pnpm `11.19.0` and a frozen lockfile.

Final audit result:

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Info | 0 |

The first review detected vulnerable transitive versions of `nanoid` and
`postcss`. The public candidate now applies narrow pnpm overrides to patched
versions (`nanoid` `3.3.17` and `postcss` `8.5.23`), after which the complete
audit returned zero known vulnerabilities.

The CycloneDX SBOM contains 343 components, including platform-specific
optional packages resolved by the lockfile. Dependency risk can change after
this report; CI reruns the audit for every review branch and pull request.
