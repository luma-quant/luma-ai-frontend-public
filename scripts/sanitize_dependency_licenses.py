#!/usr/bin/env python3
"""Remove local install paths from pnpm's dependency-license inventory."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "licenses.raw.json"
OUTPUT = ROOT / "DEPENDENCY_LICENSES.json"


def main() -> None:
    source = json.loads(RAW.read_text(encoding="utf-8-sig"))
    packages = []
    for license_name in sorted(source):
        for package in source[license_name]:
            packages.append({
                "name": package.get("name"),
                "versions": sorted(package.get("versions", [])),
                "license": license_name,
                "homepage": package.get("homepage"),
            })
    packages.sort(key=lambda item: (item["name"] or "", item["versions"]))
    output = {
        "generated_from": "pnpm licenses list --json",
        "generated_at_utc": "2026-08-13T00:00:00Z",
        "package_count": len(packages),
        "license_review_status": "LEGAL_REVIEW_NOT_YET_COMPLETED",
        "packages": packages,
    }
    OUTPUT.write_text(
        json.dumps(output, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
