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
PUBLICATION_OBSERVED_AT = "2026-08-13T12:32:19Z"
SOURCE_COMMIT = "b39c2d752abfc9a1c4d151db8519e7b070c7c869"
PUBLIC_ROOT_COMMIT = "fb645a93c1501b7251137130adca56530d206a98"
PUBLIC_ROOT_TREE = "85887a094c1bdea6b0f704ba27b8c6e6adf3d5f1"
VERIFIED_PRE_STATUS_HEAD = "53a12f3a7e1203729a85104a722f4ce1ccb55bd5"
VERIFIED_PRE_STATUS_TREE = "992834f253af26760481446e8cbc986397baddbc"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_bytes(data: bytes) -> bytes:
    """Match the LF-normalized bytes committed by Git for UTF-8 text files."""
    if b"\x00" in data:
        return data
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    return text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def file_bytes(path: Path) -> bytes:
    return canonical_bytes(path.read_bytes())


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
        data = file_bytes(path)
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
        data = file_bytes(path)
        result.append({"path": rel, "bytes": len(data), "sha256": digest(data)})
    return result


def main() -> None:
    product_entries = entries(PRODUCT, exclude_generated=True)
    product_sha = tree_digest(product_entries)

    release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
    owner_status = json.loads(OWNER_STATUS_PATH.read_text(encoding="utf-8"))
    release.update(
        {
            "repository": "wotanIII/luma-ai-frontend-public",
            "repository_url": "https://github.com/wotanIII/luma-ai-frontend-public",
            "repository_creation_status": "COMPLETED_VERIFIED",
            "repository_url_verification": "COMPLETED_VERIFIED",
            "repository_visibility": "PUBLIC",
            "trust_layer_component_version": "1.0",
            "component_status": "PUBLIC_OPERATIONAL",
            "trust_layer_master_status": "OUTSIDE_COMPONENT_SCOPE",
            "public_root_commit_sha": PUBLIC_ROOT_COMMIT,
            "public_root_tree_sha": PUBLIC_ROOT_TREE,
            "verified_pre_status_head_commit_sha": VERIFIED_PRE_STATUS_HEAD,
            "verified_pre_status_head_tree_sha": VERIFIED_PRE_STATUS_TREE,
            "publication_status_observed_at_utc": PUBLICATION_OBSERVED_AT,
            "publication_review_status": "COMPLETED_VERIFIED",
            "publication_status": "PUBLIC",
            "publication_performed": True,
            "ci_status": "SUCCESS",
            "codeql_status": "SUCCESS_ZERO_OPEN_ALERTS",
            "codeql_open_alerts": 0,
            "deployment_status": "NOT_CLAIMED",
            "payment_and_delivery_status": "NOT_CLAIMED",
            "open_review_matters": [
                "LEGAL_REVIEW_NOT_YET_COMPLETED",
                "INDEPENDENT_THIRD_PARTY_AUDIT_NOT_YET_COMPLETED",
            ],
            "publication_evidence": {
                "public_review_run_url": "https://github.com/wotanIII/luma-ai-frontend-public/actions/runs/31696137890",
                "codeql_run_url": "https://github.com/wotanIII/luma-ai-frontend-public/actions/runs/31696137753",
                "verified_head_commit_sha": VERIFIED_PRE_STATUS_HEAD,
                "self_reference_policy": "CURRENT_STATUS_COMMIT_IS_BOUND_BY_GIT_TREE_AND_DETACHED_ARCHIVE_NOT_EMBEDDED_IN_ITS_OWN_CONTENT",
            },
        }
    )
    release.pop("publication_blockers", None)
    release["product_source_sha256"] = product_sha
    release["asset_rights_inventory_sha256"] = digest(file_bytes(ASSET_INVENTORY_PATH))
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
        data = file_bytes(path)
        public_files.append({
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": len(data),
            "sha256": digest(data),
        })
    manifest = {
        "source_private_commit": SOURCE_COMMIT,
        "export_tool_version": "1.2.0",
        "export_timestamp_utc": EXPORTED_AT,
        "publication_status_observed_at_utc": PUBLICATION_OBSERVED_AT,
        "public_release": "0.1.0-rc1",
        "trust_layer_component_version": "1.0",
        "component_status": "PUBLIC_OPERATIONAL",
        "release_class": "SANITIZED_PRODUCTION_SOURCE",
        "repository": "wotanIII/luma-ai-frontend-public",
        "repository_url": "https://github.com/wotanIII/luma-ai-frontend-public",
        "repository_creation_status": "COMPLETED_VERIFIED",
        "repository_url_verification": "COMPLETED_VERIFIED",
        "repository_visibility": "PUBLIC",
        "public_root_commit_sha": PUBLIC_ROOT_COMMIT,
        "public_root_tree_sha": PUBLIC_ROOT_TREE,
        "verified_pre_status_head_commit_sha": VERIFIED_PRE_STATUS_HEAD,
        "verified_pre_status_head_tree_sha": VERIFIED_PRE_STATUS_TREE,
        "ci_status": "SUCCESS",
        "codeql_status": "SUCCESS_ZERO_OPEN_ALERTS",
        "owner_gate_status": {
            "operator_identity": owner_status["operator_identity"]["status"],
            "license": owner_status["license"],
            "asset_rights": owner_status["asset_rights"]["status"],
            "security_contact": owner_status["security_contact"]["status"],
            "open_review_matters": owner_status["open_review_matters"],
            "asset_rights_inventory_sha256": digest(file_bytes(ASSET_INVENTORY_PATH)),
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
