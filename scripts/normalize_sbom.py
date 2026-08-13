#!/usr/bin/env python3
"""Normalize Syft CycloneDX output for a deterministic publication candidate."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SBOM = ROOT / "SBOM.cdx.json"
SOURCE_COMMIT = "b39c2d752abfc9a1c4d151db8519e7b070c7c869"
PUBLIC_ROOT_COMMIT = "fb645a93c1501b7251137130adca56530d206a98"
VERIFIED_PRE_STATUS_HEAD = "53a12f3a7e1203729a85104a722f4ce1ccb55bd5"


def main() -> None:
    data = json.loads(SBOM.read_text(encoding="utf-8-sig"))
    data["serialNumber"] = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, 'luma-ai-frontend:' + SOURCE_COMMIT)}"
    metadata = data.setdefault("metadata", {})
    metadata["timestamp"] = "2026-08-13T00:00:00Z"
    metadata["component"] = {
        "type": "application",
        "name": "luma-ai-frontend-public",
        "version": "0.1.0-rc1",
        "externalReferences": [
            {
                "type": "distribution",
                "url": "https://github.com/luma-quant/luma-ai-frontend-public",
            }
        ],
        "properties": [
            {"name": "luma:source-private-commit", "value": SOURCE_COMMIT},
            {"name": "luma:public-root-commit", "value": PUBLIC_ROOT_COMMIT},
            {"name": "luma:verified-pre-status-head", "value": VERIFIED_PRE_STATUS_HEAD},
            {"name": "luma:component-status", "value": "PUBLIC_OPERATIONAL"},
        ],
    }
    SBOM.write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
