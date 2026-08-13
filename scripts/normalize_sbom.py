#!/usr/bin/env python3
"""Normalize Syft CycloneDX output for a deterministic publication candidate."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SBOM = ROOT / "SBOM.cdx.json"
SOURCE_COMMIT = "b39c2d752abfc9a1c4d151db8519e7b070c7c869"


def main() -> None:
    data = json.loads(SBOM.read_text(encoding="utf-8-sig"))
    data["serialNumber"] = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, 'luma-ai-frontend:' + SOURCE_COMMIT)}"
    metadata = data.setdefault("metadata", {})
    metadata["timestamp"] = "2026-08-13T00:00:00Z"
    metadata["component"] = {
        "type": "application",
        "name": "luma-ai-frontend-public-candidate",
        "version": "0.1.0-rc1",
    }
    SBOM.write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
