#!/usr/bin/env python3
"""Verify exact manifest closure and the TRUST-CODE-01 public boundary."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "PUBLIC_SOURCE_MANIFEST.json"
SOURCE_COMMIT = "b39c2d752abfc9a1c4d151db8519e7b070c7c869"

DENIED_SEGMENTS = {
    ".git", "__pycache__", "dist", "node_modules", "tmp",
}
DENIED_SUFFIXES = {".map", ".pyc", ".pyo"}
DENIED_FILENAMES = {
    ".env", "dependency-audit.raw.json", "tests.raw.log", "build.raw.log",
}
SECRET_RULES = {
    "private-key-block": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "stripe-live-secret": re.compile(r"\bsk_live_[A-Za-z0-9]{12,}"),
    "stripe-webhook-secret": re.compile(r"\bwhsec_[A-Za-z0-9]{12,}"),
    "github-token": re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}"),
    "aws-access-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "google-service-account": re.compile(r'"private_key"\s*:\s*"-----BEGIN'),
}
LOCAL_PATH = re.compile(
    r"(?i:[A-Za-z]:[\\/](?:Users|frontend|backend|trust-layer-v1)[\\/])|/(?:Users|home)/",
)
PRIVATE_ORIGIN = re.compile(
    r"(?:\.a\.run\.app\b|https?://(?:localhost|127\.0\.0\.1)(?::\d+)?\b)",
    re.IGNORECASE,
)
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
ALLOWED_EMAIL_DOMAINS = {"example.com", "lumaquant.tech"}
PRODUCT_BOUNDARY = re.compile(
    r"(?:token\.lumaquant\.tech|/auth/(?:handoff|wallet-registration)|/artifacts\b|"
    r"(?:lumaKey|tokenPortal|workspaceHandoff|workspaceRegistration|wallet[-_ ]sign))",
    re.IGNORECASE,
)
PROPRIETARY_LOGIC = re.compile(
    r"(?:system[_ -]?prompt|engine[_ -]?prompt|you are (?:an?|the) (?:ai|assistant)|"
    r"deriveOptimizedTips|calculateEstimatedAnalysisCost|mock set of lottery numbers)",
    re.IGNORECASE,
)
UNVERIFIED_LEGAL_CLAIM = re.compile(
    r"(?:independently checked|GISA\s+39671448|ATU83243624|9110039288025)",
    re.IGNORECASE,
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tree_digest(items: list[dict[str, object]]) -> str:
    canonical = "".join(
        f"{item['path']}\0{item['bytes']}\0{item['sha256']}\n" for item in items
    ).encode("utf-8")
    return digest(canonical)


def candidate_commitment(files: list[Path]) -> str:
    excluded = {
        "BUILD_PROVENANCE.json",
        "DEPENDENCY_LICENSES.json",
        "PUBLIC_SOURCE_MANIFEST.json",
        "RELEASE.json",
        "SBOM.cdx.json",
        "SOURCE_PROVENANCE.json",
    }
    entries = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if rel in excluded or any(part in {"dist", "node_modules"} for part in path.relative_to(ROOT).parts):
            continue
        data = path.read_bytes()
        entries.append({"path": rel, "bytes": len(data), "sha256": digest(data)})
    return tree_digest(entries)


def candidate_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        relative = path.relative_to(ROOT)
        if any(part in {".git", "dist", "node_modules"} for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError(f"symlink: {relative.as_posix()}")
        if path.is_file() and path != MANIFEST_PATH:
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(ROOT).as_posix())


def check_paths(files: list[Path], findings: list[tuple[str, str]]) -> None:
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        pure = PurePosixPath(rel)
        lowered_parts = {part.lower() for part in pure.parts}
        if lowered_parts & DENIED_SEGMENTS:
            findings.append(("denied-generated-path", rel))
        if path.suffix.lower() in DENIED_SUFFIXES:
            findings.append(("denied-generated-suffix", rel))
        if path.name.lower() in DENIED_FILENAMES:
            findings.append(("denied-file", rel))
        if path.name.startswith(".env") and path.name != ".env.example":
            findings.append(("environment-file", rel))


def check_text(files: list[Path], findings: list[tuple[str, str]]) -> None:
    for path in files:
        data = path.read_bytes()
        if b"\x00" in data:
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            findings.append(("non-utf8-text", path.relative_to(ROOT).as_posix()))
            continue
        rel = path.relative_to(ROOT).as_posix()
        if LOCAL_PATH.search(text):
            findings.append(("absolute-local-path", rel))
        if PRIVATE_ORIGIN.search(text):
            findings.append(("private-service-origin", rel))
        for rule_id, pattern in SECRET_RULES.items():
            if pattern.search(text):
                findings.append((rule_id, rel))
        for match in EMAIL.finditer(text):
            domain = match.group(0).rsplit("@", 1)[1].lower()
            if domain not in ALLOWED_EMAIL_DOMAINS and not domain.endswith(".example.invalid"):
                findings.append(("unapproved-email-domain", rel))
                break
        if rel.startswith("product/src/") and not rel.endswith(".test.ts"):
            if PRODUCT_BOUNDARY.search(text):
                findings.append(("separate-product-boundary", rel))
            if PROPRIETARY_LOGIC.search(text):
                findings.append(("client-side-proprietary-logic", rel))
        if rel == "product/src/legal/legalPolicies.ts":
            if "COMPLETED_OWNER_CONFIRMED" not in text:
                findings.append(("legal-operator-owner-marker", rel))
            if "LEGAL_REVIEW_NOT_YET_COMPLETED" not in text:
                findings.append(("legal-review-marker", rel))
            if UNVERIFIED_LEGAL_CLAIM.search(text):
                findings.append(("unverified-legal-identity-claim", rel))


def check_metadata(files: list[Path], findings: list[tuple[str, str]]) -> None:
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
    provenance = json.loads((ROOT / "SOURCE_PROVENANCE.json").read_text(encoding="utf-8"))
    owner = json.loads((ROOT / "OWNER_GATE_STATUS.json").read_text(encoding="utf-8"))
    if release.get("source_private_commit_sha") != SOURCE_COMMIT:
        findings.append(("release-source-commit", "RELEASE.json"))
    if provenance.get("source_commit") != SOURCE_COMMIT:
        findings.append(("provenance-source-commit", "SOURCE_PROVENANCE.json"))
    if release.get("operator_identity_status") != "COMPLETED_OWNER_CONFIRMED":
        findings.append(("operator-owner-status", "RELEASE.json"))
    if release.get("license_status") != "PROPRIETARY_SOURCE_AVAILABLE_ALL_RIGHTS_RESERVED":
        findings.append(("outbound-license-status", "RELEASE.json"))
    if release.get("security_contact") != "security@lumaquant.tech":
        findings.append(("security-contact", "RELEASE.json"))
    expected_open = [
        "LEGAL_REVIEW_NOT_YET_COMPLETED",
        "INDEPENDENT_THIRD_PARTY_AUDIT_NOT_YET_COMPLETED",
    ]
    if release.get("publication_blockers") != expected_open:
        findings.append(("open-review-matters", "RELEASE.json"))
    if owner.get("open_review_matters") != expected_open:
        findings.append(("open-review-matters", "OWNER_GATE_STATUS.json"))
    if owner.get("operator_identity", {}).get("legal_operator") != "Luma Quant e.U.":
        findings.append(("operator-identity", "OWNER_GATE_STATUS.json"))
    if owner.get("security_contact", {}).get("independent_verification") != "NOT_PERFORMED":
        findings.append(("security-contact-evidence-class", "OWNER_GATE_STATUS.json"))
    if not (ROOT / "LICENSE.md").is_file():
        findings.append(("outbound-license-file", "LICENSE.md"))
    if release.get("publication_review_status") != "PUBLICATION_REVIEW_READY":
        findings.append(("publication-review-status", "RELEASE.json"))
    if release.get("publication_status") != "PUBLIC_REPOSITORY_PENDING":
        findings.append(("publication-status", "RELEASE.json"))
    if release.get("publication_performed") is not False:
        findings.append(("publication-performed", "RELEASE.json"))
    if release.get("repository") != "wotanIII/luma-ai-frontend-public":
        findings.append(("repository-target", "RELEASE.json"))
    if release.get("repository_url") != "https://github.com/wotanIII/luma-ai-frontend-public":
        findings.append(("repository-url", "RELEASE.json"))
    if release.get("repository_creation_status") != "PENDING":
        findings.append(("repository-creation-status", "RELEASE.json"))
    try:
        inventory = json.loads((ROOT / "ASSET_RIGHTS_INVENTORY.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        findings.append(("asset-inventory-invalid", "ASSET_RIGHTS_INVENTORY.json"))
    else:
        asset_suffixes = {".gif", ".ico", ".jpeg", ".jpg", ".mp4", ".otf", ".png", ".svg", ".ttf", ".webm", ".webp", ".woff", ".woff2"}
        actual_assets = [path for path in files if path.suffix.lower() in asset_suffixes]
        entries = inventory.get("assets", [])
        if [entry.get("path") for entry in entries] != [path.relative_to(ROOT).as_posix() for path in actual_assets]:
            findings.append(("asset-inventory-closure", "ASSET_RIGHTS_INVENTORY.json"))
        elif inventory.get("asset_count") != len(actual_assets) or inventory.get("unresolved_asset_count") != 0:
            findings.append(("asset-inventory-count", "ASSET_RIGHTS_INVENTORY.json"))
        else:
            for path, entry in zip(actual_assets, entries, strict=True):
                data = path.read_bytes()
                if entry.get("bytes") != len(data) or entry.get("sha256") != digest(data):
                    findings.append(("asset-inventory-content", path.relative_to(ROOT).as_posix()))
                if entry.get("status") not in {"OWNED", "LICENSED_FOR_PUBLIC_REPOSITORY"} or entry.get("attestation") != "OWNER_CONFIRMED":
                    findings.append(("asset-inventory-rights-status", path.relative_to(ROOT).as_posix()))
    if release.get("public_candidate_sha256") != candidate_commitment(files):
        findings.append(("release-candidate-commitment", "RELEASE.json"))
    env_text = (ROOT / "product" / ".env.example").read_text(encoding="utf-8")
    required = ("api.example.invalid", "YOUR_GOOGLE_OAUTH_CLIENT_ID", "YOUR_APPLE_SERVICE_ID")
    if any(value not in env_text for value in required):
        findings.append(("environment-placeholder", "product/.env.example"))


def check_manifest(files: list[Path], findings: list[tuple[str, str]]) -> None:
    if not MANIFEST_PATH.is_file():
        findings.append(("manifest-missing", "PUBLIC_SOURCE_MANIFEST.json"))
        return
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest.get("files", [])
    expected_paths = [path.relative_to(ROOT).as_posix() for path in files]
    listed_paths = [entry.get("path") for entry in entries]
    if listed_paths != expected_paths:
        findings.append(("manifest-closure", "PUBLIC_SOURCE_MANIFEST.json"))
        return
    for path, entry in zip(files, entries, strict=True):
        data = path.read_bytes()
        if entry.get("bytes") != len(data) or entry.get("sha256") != digest(data):
            findings.append(("manifest-content", path.relative_to(ROOT).as_posix()))


def main() -> int:
    findings: list[tuple[str, str]] = []
    try:
        files = candidate_files()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    check_paths(files, findings)
    check_text(files, findings)
    check_metadata(files, findings)
    check_manifest(files, findings)
    if findings:
        for rule_id, rel in sorted(set(findings)):
            print(f"{rule_id}: {rel}", file=sys.stderr)
        return 1
    print(f"public candidate verification passed ({len(files)} manifested files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
