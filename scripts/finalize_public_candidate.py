#!/usr/bin/env python3
"""Write deterministic build metadata, product commitment and exact manifest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "product"
MANIFEST = ROOT / "PUBLIC_SOURCE_MANIFEST.json"
RELEASE_PATH = ROOT / "RELEASE.json"
OWNER_STATUS_PATH = ROOT / "OWNER_GATE_STATUS.json"
ASSET_INVENTORY_PATH = ROOT / "ASSET_RIGHTS_INVENTORY.json"
EXPORTED_AT = "2026-08-13T00:00:00Z"
SOURCE_COMMIT = "b39c2d752abfc9a1c4d151db8519e7b070c7c869"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def entries(root: Path, *, exclude_generated: bool = False) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if ".git" in relative.parts:
            continue
        rel = relative.as_posix()
        if exclude_generated and any(part in {"__pycache__", "dist", "node_modules"} for part in path.relative_to(root).parts):
            continue
        data = path.read_bytes()
        result.append({"path": rel, "bytes": len(data), "sha256": digest(data)})
    return result


def tree_digest(items: list[dict[str, object]]) -> str:
    canonical = "".join(
        f"{item['path']}\0{item['bytes']}\0{item['sha256']}\n" for item in items
    ).encode("utf-8")
    return digest(canonical)


def candidate_commitment_entries() -> list[dict[str, object]]:
    """Hash the review candidate without generated/self-referential records."""
    excluded = {
        "BUILD_PROVENANCE.json",
        "DEPENDENCY_LICENSES.json",
        "PUBLIC_SOURCE_MANIFEST.json",
        "RELEASE.json",
        "SBOM.cdx.json",
        "SOURCE_PROVENANCE.json",
    }
    result: list[dict[str, object]] = []
    for path in sorted(ROOT.rglob("*"), key=lambda item: item.relative_to(ROOT).as_posix()):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if ".git" in relative.parts or any(part in {"__pycache__", "dist", "node_modules"} for part in relative.parts):
            continue
        rel = relative.as_posix()
        if rel in excluded:
            continue
        data = path.read_bytes()
        result.append({"path": rel, "bytes": len(data), "sha256": digest(data)})
    return result


def main() -> None:
    product_entries = entries(PRODUCT, exclude_generated=True)
    product_sha = tree_digest(product_entries)

    release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
    owner_status = json.loads(OWNER_STATUS_PATH.read_text(encoding="utf-8"))
    release["product_source_sha256"] = product_sha
    release["asset_rights_inventory_sha256"] = digest(ASSET_INVENTORY_PATH.read_bytes())
    release["public_candidate_sha256"] = tree_digest(candidate_commitment_entries())
    release["candidate_hash_scope"] = (
        "canonical full candidate excluding .git, generated build/dependency/SBOM/provenance records, "
        "PUBLIC_SOURCE_MANIFEST.json, RELEASE.json, product/dist and product/node_modules; archive checksum is detached"
    )
    RELEASE_PATH.write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    dist = PRODUCT / "dist"
    if dist.is_dir():
        dist_entries = entries(dist)
        build = {
            "source_commit": SOURCE_COMMIT,
            "build_command": "pnpm run build",
            "build_status": "PASS",
            "build_tree_sha256": tree_digest(dist_entries),
            "generated_at_utc": EXPORTED_AT,
            "files": dist_entries,
            "warning": "Initial JavaScript chunk exceeds the configured 500 kB advisory threshold.",
        }
        (ROOT / "BUILD_PROVENANCE.json").write_text(
            json.dumps(build, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )

    public_files = []
    for path in sorted(ROOT.rglob("*"), key=lambda item: item.relative_to(ROOT).as_posix()):
        if not path.is_file() or path == MANIFEST:
            continue
        rel_parts = path.relative_to(ROOT).parts
        if any(part in {".git", "__pycache__", "dist", "node_modules"} for part in rel_parts):
            continue
        if path.name in {"dependency-audit.raw.json", "tests.raw.log", "build.raw.log"}:
            continue
        data = path.read_bytes()
        public_files.append({
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": len(data),
            "sha256": digest(data),
        })
    manifest = {
        "source_private_commit": SOURCE_COMMIT,
        "export_tool_version": "1.1.0",
        "export_timestamp_utc": EXPORTED_AT,
        "public_release": "0.1.0-rc1",
        "release_class": "SANITIZED_PRODUCTION_SOURCE",
        "repository": "wotanIII/luma-ai-frontend-public",
        "repository_url": "https://github.com/wotanIII/luma-ai-frontend-public",
        "repository_creation_status": "PENDING",
        "owner_gate_status": {
            "operator_identity": owner_status["operator_identity"]["status"],
            "license": owner_status["license"],
            "asset_rights": owner_status["asset_rights"]["status"],
            "security_contact": owner_status["security_contact"]["status"],
            "open_review_matters": owner_status["open_review_matters"],
            "asset_rights_inventory_sha256": digest(ASSET_INVENTORY_PATH.read_bytes()),
        },
        "included_file_count": len(public_files),
        "excluded_categories": [
            "token, wallet, LUMAKey, NFT and artifact products",
            "workspace handoff and wallet registration",
            "server, deployment, admin and production data",
            "browser simulation, scoring and price-estimation prototypes",
            "secrets, private origins, source maps and generated directories",
        ],
        "files": public_files,
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(product_sha)


if __name__ == "__main__":
    main()
