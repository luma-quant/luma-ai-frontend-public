# Known limitations

- This candidate proves a sanitized browser product boundary, not the private
  backend, payment processor, ledger or analytical engine.
- Production alignment is `SANITIZED_MIRROR`; deployment parity has not been
  independently verified.
- The committed environment file contains non-operational placeholders only.
- The public CodeQL rerun for this hotfix is pending; no zero-open-alert claim
  is made before that rerun completes.
- The production bundle warns that one initial JavaScript chunk exceeds 500 kB;
  this is a performance optimization item, not a build failure.
- Browser session storage and third-party dependencies require continuing
  threat-model and privacy review.
- Asset publication is fail-closed: the owner authorizes only assets validated
  as owned or licensed for public repository use; every unresolved asset must
  be excluded or replaced. Independent rights verification was not performed.
- Legal and privacy text review is `NOT_YET_COMPLETED`.
- No independent third-party audit has been completed.
- The owner selected
  `PROPRIETARY_SOURCE_AVAILABLE_ALL_RIGHTS_RESERVED`; source visibility grants
  no reuse license.
- `security@lumaquant.tech` is owner-confirmed as active, monitored and
  test-received; independent mailbox verification was not performed and no SLA
  is claimed.
