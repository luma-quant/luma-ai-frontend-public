# Export reproducibility report

- Exporter version: `1.2.0`
- Source classification: `SANITIZED_PRODUCTION_SOURCE`
- Production alignment: `SANITIZED_MIRROR`
- Source Git commit: `b39c2d752abfc9a1c4d151db8519e7b070c7c869`
- Git-object files selected: 131
- Product source commitment after first verified build:
  `0fd7782e6d04e4719744ee89b7ed505e2235a6740fa26483c861af68adba7ade`
- Product source commitment after a clean second export:
  `0fd7782e6d04e4719744ee89b7ed505e2235a6740fa26483c861af68adba7ade`

The identical commitments prove deterministic source export from the pinned
commit. The exporter reads `git show <commit>:<path>` objects and does not read
the private working tree. Every reviewed transformation aborts on unexpected
source drift. Each transformed source file is additionally bound to its exact
expected Git blob SHA before structural sanitization; removed private values
are neither embedded nor reconstructible from candidate script literals.

`PUBLIC_SOURCE_MANIFEST.json` binds every candidate file except the manifest
itself. The final archive has a separate detached SHA-256 file.
