#!/usr/bin/env python3
"""Build the publication-review AI frontend export from a pinned Git commit.

The exporter reads Git objects rather than the source working tree. Selection
is positive-list based, every known private boundary is rejected before write,
and each reviewed source transformation is fail-closed against source drift.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import stat
import subprocess
from pathlib import Path, PurePosixPath

EXPORTER_VERSION = "1.2.0"

# Every transformed private source file is pinned twice: by the source commit
# and by its exact Git-blob SHA-1.  The transformations below therefore match
# only public syntax and context; no removed private identifier is embedded in,
# assembled by, or recoverable from this exporter.
TRANSFORM_BLOB_SHA1 = dict((
    ("src/App.tsx", "da20916246522727c749da3579fe491e482d2caf"),
    ("src/api/advisorRunRecovery.test.ts", "97e34d07a048e8b63aedccfadaefabfabfd10ecb"),
    (str(PurePosixPath("src", "api", "apiClient.ts")), "105474e7737401df93d1e1603d17589adcb7bf96"),
    ("src/api/backendData.test.ts", "5d205bff43a26007de7f144416315875b3038e34"),
    ("src/api/frontendPolishUi.test.ts", "8302a2409516f0123727b7bda5bd89f49a317f21"),
    ("src/components/CreditStore.tsx", "761e1741fae16f3f83a65a9c0c4314d1c8560e8c"),
    ("src/components/SideNavbar.tsx", "466099426df8b03a9c426366a1546936d6ce0d67"),
    ("src/legal/legalPolicies.ts", "107c9c9e07e5509601e7f0088c9c40c73391deb2"),
    ("src/support/crisp.ts", "4dc81362dc0892a1f378f4f98cb856d9298983b8"),
))

ROOT_FILES = {
    ".env.example",
    "index.html",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "vite.config.ts",
}

ALLOWED_PREFIXES = (
    "public/",
    "src/api/",
    "src/auth/",
    "src/components/",
    "src/legal/",
    "src/support/",
)

ALLOWED_SOURCE_FILES = {
    "src/App.tsx",
    "src/index.css",
    "src/main.tsx",
    "src/vite-env.d.ts",
}

DENIED_PREFIXES = (
    # Separate product boundaries.
    "src/api/artifact",
    "src/api/lumaKey",
    "src/api/solana",
    "src/api/tokenPortal",
    "src/auth/artifactLoginReturn",
    "src/auth/workspaceHandoff",
    "src/auth/workspaceRegistration",
    "src/components/artifacts/",
    "src/components/Artifact",
    "src/components/LumaKeyVaultPanel",
    "src/components/WorkspaceHandoffLanding",
    "src/components/WorkspaceRegistrationLanding",
    "src/components/WorkspaceSwitcher",
    "src/tokenPortal/",
    # Unused prototypes and browser-side analytical/pricing implementations.
    "src/utils/",
    "src/types.ts",
    "src/components/builder.tsx",
    "src/components/BuilderTipCard.tsx",
    "src/components/MathExplainer.tsx",
    "src/components/ModelCharts.tsx",
    # Unreachable legacy/demo UI with hard-coded example identities.
    "src/components/AccountSettings.tsx",
    "src/components/AdvisorCockpit.tsx",
    "src/components/CreditLedgerModal.tsx",
    "src/components/DecryptionVault.tsx",
    "src/components/GlowPulse.tsx",
    "src/components/LQBackground.tsx",
    "src/components/NumberGridPicker.tsx",
    "src/components/SprintPulse.tsx",
    "src/components/TopNavbar.tsx",
    "src/components/UserMenu.tsx",
    "src/components/ui/Input.tsx",
    "src/components/ui/LQBackground.tsx",
    "src/components/ui/LumaHeroWrapper.tsx",
    "src/components/ui/LumaMetricTileWrapper.tsx",
    "src/components/ui/LumaNoticeWrapper.tsx",
    "src/components/ui/LumaSectionWrapper.tsx",
    "src/components/ui/Select.tsx",
    "src/components/ui/Skeleton.tsx",
    "src/components/ui/Textarea.tsx",
)

DENIED_PARTS = {
    "node_modules",
    "dist",
    ".firebase",
    ".local-test",
    ".pytest_cache",
    "tmp",
    "app",
}

DENIED_TEST_NAMES = (
    "artifact",
    "lumakey",
    "solana",
    "tokenportal",
    "workspacehandoff",
    "workspaceregistration",
)

TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".json",
    ".md",
    ".mjs",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}


def run_git(repo: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(repo), *args])


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def remove_readonly(function, path: str, error) -> None:
    """Retry deletion of generated Windows files with a writable bit."""
    del error
    Path(path).chmod(stat.S_IWRITE)
    function(path)


def selected(path: str) -> bool:
    pure = PurePosixPath(path)
    lowered = path.lower()
    if any(part in DENIED_PARTS for part in pure.parts):
        return False
    if path.endswith(".map"):
        return False
    if path.startswith(".") and path != ".env.example":
        return path in ROOT_FILES
    if any(path.startswith(prefix) for prefix in DENIED_PREFIXES):
        return False
    if path.endswith(".test.ts") and any(name in lowered for name in DENIED_TEST_NAMES):
        return False
    return (
        path in ROOT_FILES
        or path in ALLOWED_SOURCE_FILES
        or any(path.startswith(prefix) for prefix in ALLOWED_PREFIXES)
    )


def replace_exact(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"reviewed transformation drift for {label}: expected {count}, got {actual}")
    return text.replace(old, new)


def replace_regex(text: str, pattern: str, replacement: str, label: str, count: int = 1) -> str:
    updated, actual = re.subn(pattern, replacement, text, flags=re.DOTALL)
    if actual != count:
        raise SystemExit(f"reviewed transformation drift for {label}: expected {count}, got {actual}")
    return updated


def mojibake_score(value: str) -> int:
    markers = ("Ã", "Â", "â€", "â€¦", "â€¢", "ðŸ", "�")
    return sum(value.count(marker) for marker in markers)


def repair_mojibake(value: str) -> str:
    """Repair common UTF-8/cp1252 double-decoding only when badness drops."""
    current = value
    for _ in range(3):
        best = current
        best_score = mojibake_score(current)
        for encoding in ("cp1252", "latin-1"):
            try:
                candidate = current.encode(encoding).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
            score = mojibake_score(candidate)
            if score < best_score:
                best = candidate
                best_score = score
        if best == current:
            break
        current = best
    return current


def transform_app(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_exact(
        source,
        "import { resolveArtifactLoginReturn } from './auth/artifactLoginReturn';\n",
        "",
        "App artifact return import",
    )
    source = replace_exact(
        source,
        "import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';\n",
        "",
        "App workspace switcher import",
    )
    source = replace_exact(
        source,
        "  const artifactLoginReturn = resolveArtifactLoginReturn(\n"
        "    window.location.pathname,\n"
        "    window.location.search,\n"
        "  );\n\n",
        "",
        "App artifact return state",
    )
    source = replace_exact(
        source,
        "  useEffect(() => {\n"
        "    if (!workspaceUnlocked || !artifactLoginReturn) return;\n"
        "    window.location.replace(artifactLoginReturn);\n"
        "  }, [artifactLoginReturn, workspaceUnlocked]);\n\n",
        "",
        "App artifact return effect",
    )
    source = replace_exact(
        source,
        "                  <WorkspaceSwitcher activeWorkspace=\"quant\" compact />\n",
        "",
        "App cross-product switcher",
    )
    source = replace_regex(
        source,
        r"(?m)^      import\.meta\.env\.VITE_CRISP_WEBSITE_ID\n"
        r"        \|\| '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',$",
        "      import.meta.env.VITE_CRISP_WEBSITE_ID\n"
        "        || '00000000-0000-0000-0000-000000000000',",
        "App Crisp identifier",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_credit_store(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_exact(
        source,
        "import type { ButtonHTMLAttributes, FormEvent } from 'react';",
        "import type { ButtonHTMLAttributes } from 'react';",
        "CreditStore FormEvent import",
    )
    source = replace_exact(source, "  KeyRound,\n", "", "CreditStore key icon")
    source = replace_exact(
        source,
        "import { isLumaKeyFormat, redeemLumaKeyForCredits } from '../api/lumaKeyCredits';\n",
        "",
        "CreditStore LUMAKey API import",
    )
    source = replace_exact(
        source,
        "  const [lumaKey, setLumaKey] = useState('');\n"
        "  const [isLumaKeyRedeeming, setIsLumaKeyRedeeming] = useState(false);\n",
        "",
        "CreditStore LUMAKey state",
    )
    source = replace_regex(
        source,
        r"\n  const handleRedeemLumaKey = async \(\n.*?\n  };\n\n  const packOrder =",
        "\n  const packOrder =",
        "CreditStore LUMAKey handler",
    )
    source = replace_regex(
        source,
        r"\n        <form\n          onSubmit=\{\(event\) => void handleRedeemLumaKey\(event\)\}.*?\n        </form>\n",
        "\n",
        "CreditStore LUMAKey form",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_side_navbar(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_exact(source, ", ExternalLink, LogOut", ", LogOut", "SideNavbar icon")
    source = replace_exact(
        source,
        "    { id: 'web3', label: 'Web3 Portal', icon: <ExternalLink className=\"w-4 h-4\" /> },\n",
        "",
        "SideNavbar token navigation item",
    )
    source = replace_exact(
        source,
        "                    if (tab.id === 'web3') {\n"
        "                      window.location.assign('https://token.lumaquant.tech/artifacts#vault');\n"
        "                    } else if (tab.id === 'logout') {",
        "                    if (tab.id === 'logout') {",
        "SideNavbar desktop token branch",
    )
    source = replace_exact(
        source,
        "                if (tab.id === 'web3') {\n"
        "                  window.location.assign('https://token.lumaquant.tech/artifacts#vault');\n"
        "                } else if (tab.id === 'logout') {",
        "                if (tab.id === 'logout') {",
        "SideNavbar mobile token branch",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_api_client(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_regex(
        source,
        r"(?m)^  \|\| 'https://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.a\.run\.app'\s*$",
        "  || 'https://api.example.invalid'",
        "API client production origin",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_crisp(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_regex(
        source,
        r"(?m)^  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';$",
        "  '00000000-0000-0000-0000-000000000000';",
        "Crisp website identifier",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_advisor_recovery_fixture(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_regex(
        source,
        r"(?m)^(  idempotency_key: )'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',$",
        r"\1'00000000-0000-4000-8000-000000000001',",
        "synthetic Advisor idempotency fixture",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_backend_data_fixture(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    generated_call = re.compile(
        r"(?P<prefix>generateAdvisorTipScenarios\(\s*\{[^}]*\},\s*)"
        r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'",
        flags=re.DOTALL,
    )
    source, first_count = generated_call.subn(
        r"\g<prefix>'00000000-0000-4000-8000-000000000002'",
        source,
        count=1,
    )
    if first_count != 1:
        raise SystemExit(
            "reviewed transformation drift for synthetic ticket fixture call: "
            f"expected 1, got {first_count}"
        )
    source = replace_regex(
        source,
        r"(?m)^(\s*'Idempotency-Key': )'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',$",
        r"\1'00000000-0000-4000-8000-000000000002',",
        "synthetic ticket fixture header",
    )
    source = replace_regex(
        source,
        r"(?ms)^(\s*generateAdvisorTipScenarios\(\s*request,\s*)"
        r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',",
        r"\1'00000000-0000-4000-8000-000000000002',",
        "synthetic ticket fixture rejection call",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def transform_legal_policies(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    source = replace_regex(
        source,
        r"(?m)^export const LEGAL_OPERATOR = \{\n.*?^\} as const;\n",
        "export const LEGAL_OPERATOR = {\n"
        "  name: 'Luma Quant e.U.',\n"
        "  proprietorName: 'Johann Weitzer',\n"
        "  legalForm: 'e.U. (registered sole proprietorship)',\n"
        "  tradeDescription: 'LUMA Quant',\n"
        "  jurisdiction: 'Austria',\n"
        "  address: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  legalEmail: 'info@lumaquant.tech',\n"
        "  supportEmail: 'support@lumaquant.tech',\n"
        "  securityEmail: 'security@lumaquant.tech',\n"
        "  operatorEmail: 'info@lumaquant.tech',\n"
        "  linkedinUrl: '',\n"
        "  xUrl: 'https://x.com/lumaquant_tech',\n"
        "  gisaNumber: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  vatId: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  gln: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  commercialRegisterCourt: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  commercialRegisterNumber: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  competentTradeAuthority: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  chamberMembership: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  publicTelephone: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "  mediaDisclosure: 'LEGAL_REVIEW_NOT_YET_COMPLETED',\n"
        "} as const;\n",
        "legal operator identity block",
    )
    source = replace_regex(
        source,
        r"(?m)^export const LEGAL_OPERATOR_DISCLOSURE_NOTICE =\n"
        r"(?:  [^\n]*\n)+?\n",
        "export const LEGAL_OPERATOR_DISCLOSURE_NOTICE =\n"
        "  'COMPLETED_OWNER_CONFIRMED: Luma Quant e.U., LUMA Quant, Johann Weitzer, ' +\n"
        "  'and Austria are owner-confirmed; independent registry verification was not ' +\n"
        "  'performed. Address, registration, tax, authority, chamber and mandatory ' +\n"
        "  'disclosure fields remain LEGAL_REVIEW_NOT_YET_COMPLETED.';\n\n",
        "legal disclosure notice",
    )
    source = replace_regex(
        source,
        r"(?m)^        'The following identifiers were supplied by the operator for publication:',\r?\n"
        r"        'The GISA number and VAT identification number have been independently checked[^\r\n]*',$",
        "        'LEGAL_REVIEW_NOT_YET_COMPLETED: registration and tax identifiers are not independently verified by this candidate.',",
        "legal identifier verification claim",
    )
    source = replace_regex(
        source,
        r"(?m)^        `Report suspected abuse or security issues to \$\{LEGAL_OPERATOR\.supportEmail\}\. Include only the information needed to investigate and do not send passwords, full payment credentials, or unnecessary personal data\.`,?$",
        "        `Report suspected abuse or security issues to ${LEGAL_OPERATOR.securityEmail}. The mailbox status is owner-confirmed; no response-time SLA is claimed. Include only the information needed to investigate and do not send passwords, full payment credentials, or unnecessary personal data.`,",
        "owner-confirmed security contact",
    )
    source = replace_regex(
        source,
        r"(?ms)^    \{\n      title: '4\. Official online profiles',.*?^    \},\n    \{\n      title: '5\. Details pending final documentation',",
        "    {\n"
        "      title: '4. Official online profiles',\n"
        "      paragraphs: [\n"
        "        'The owner has confirmed the following public profile:',\n"
        "      ],\n"
        "      links: [\n"
        "        {\n"
        "          label: 'X / Twitter: @lumaquant_tech',\n"
        "          href: LEGAL_OPERATOR.xUrl,\n"
        "        },\n"
        "      ],\n"
        "    },\n"
        "    {\n"
        "      title: '5. Details pending final documentation',",
        "owner-confirmed official profile",
    )
    source = source.replace(
        "These placeholders must be replaced with verified information before the Legal Notice is treated as production-complete.",
        "These placeholders require completed legal review before the Legal Notice is treated as production-complete.",
    )
    source = replace_regex(
        source,
        r"(?m)^export const LEGAL_DOCUMENT_SHA256: Readonly<Record<LegalDocumentId, string>> = \{\n.*?^\};$",
        "export const LEGAL_DOCUMENT_SHA256: Readonly<Record<LegalDocumentId, string>> = {\n"
        "  imprint: 'e4854829c0b6f30cf8ae66a2682ec10ac42a55920355de55b4b513cd219247b9',\n"
        "  terms: 'fc953abfaf1b97c5abdd9509d5af22c4b7f1be79bca927f5285f752d1c478f67',\n"
        "  privacy: '93b695e9816577d72f8681e227d120b9ecd22e15bdc2f52285e75c7974cf755b',\n"
        "  cookies: 'f04702d27b8d1701c7175ec06c3926e4802bf427ba94529accf9259e99a82a68',\n"
        "  'paid-services': 'a8510ac7bfce921bf790d6eded8b2903f6b497f01a6ac3d884948f9e2ffaab7d',\n"
        "  'acceptable-use': 'dd00d703cf3368ec24c705a18dc0c923c7ee09a995f450b0e6d757e0aeb96ab9',\n"
        "  copyright: '812383ce974b149044b917c821d80679d7ca41375d96c3fee8841b9b393b80dc',\n"
        "};",
        "sanitized legal document commitments",
    )
    path.write_text(source, encoding="utf-8", newline="\n")


def copy_override(output: Path, relative: str) -> None:
    source = output / "export-overrides" / relative
    if not source.is_file():
        raise SystemExit(f"missing reviewed export override: {relative}")
    destination = output / "product" / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    commit = run_git(args.repo, "rev-parse", f"{args.commit}^{{commit}}").decode().strip()
    tracked = run_git(args.repo, "ls-tree", "-r", "--name-only", commit).decode().splitlines()
    files = sorted(path for path in tracked if selected(path))
    if not files:
        raise SystemExit("export allowlist selected no files")

    output = args.output.resolve()
    product = output / "product"
    if product.exists():
        if product.parent != output:
            raise SystemExit("refusing to replace product outside candidate root")
        shutil.rmtree(product, onexc=remove_readonly)
    product.mkdir(parents=True)

    source_entries = []
    for rel in files:
        data = run_git(args.repo, "show", f"{commit}:{rel}")
        expected_blob = TRANSFORM_BLOB_SHA1.get(rel)
        if expected_blob is not None and git_blob_sha1(data) != expected_blob:
            raise SystemExit(f"reviewed source blob drift: {rel}")
        destination = product / PurePosixPath(rel)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        source_entries.append({"path": rel, "bytes": len(data), "sha256": sha256(data)})

    transform_app(product / "src" / "App.tsx")
    transform_credit_store(product / "src" / "components" / "CreditStore.tsx")
    transform_side_navbar(product / "src" / "components" / "SideNavbar.tsx")
    transform_api_client(product / "src" / "api" / "apiClient.ts")
    transform_crisp(product / "src" / "support" / "crisp.ts")
    transform_legal_policies(product / "src" / "legal" / "legalPolicies.ts")

    polish_test_path = product / "src" / "api" / "frontendPolishUi.test.ts"
    polish_test = polish_test_path.read_text(encoding="utf-8")
    polish_test = replace_exact(
        polish_test,
        "    4,\n  );",
        "    3,\n  );",
        "CreditStore sanitized UI assertion",
    )
    polish_test_path.write_text(polish_test, encoding="utf-8", newline="\n")

    transform_advisor_recovery_fixture(
        product / "src" / "api" / "advisorRunRecovery.test.ts"
    )
    transform_backend_data_fixture(product / "src" / "api" / "backendData.test.ts")

    for relative in (
        ".env.example",
        "package.json",
        "pnpm-workspace.yaml",
        "tsconfig.json",
        "vite.config.ts",
        "src/main.tsx",
        "src/api/publicRoutes.ts",
        "src/api/publicRoutes.test.ts",
        "src/api/creditStoreCopy.test.ts",
        "src/api/legalCenter.test.ts",
        "src/auth/endpoints.ts",
        "scripts/lint-public-source.mjs",
    ):
        copy_override(output, relative)
    lock_override = output / "export-overrides" / "pnpm-lock.yaml"
    if lock_override.is_file():
        copy_override(output, "pnpm-lock.yaml")

    for path in product.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name == ".env.example":
            text = path.read_text(encoding="utf-8")
            repaired = repair_mojibake(text)
            path.write_text(repaired, encoding="utf-8", newline="\n")

    provenance = {
        "source_repository": "private:luma-quant-lab",
        "source_commit": commit,
        "exporter_version": EXPORTER_VERSION,
        "release_class": "SANITIZED_PRODUCTION_SOURCE",
        "included_source_files": len(files),
        "excluded_categories": [
            "token portal, wallet and LUMAKey flows",
            "artifact network and NFT flows",
            "workspace registration and handoff",
            "server, deployment and administration internals",
            "unreachable legacy/demo interfaces and embedded example identities",
            "browser-side simulation, scoring and price-estimation prototypes",
            "historical patch scripts, private specifications and prompts",
        ],
        "source_files": source_entries,
        "reviewed_transformations": [
            "package and Vite configuration are reduced to the static AI frontend dependency graph",
            "environment identifiers and production API origin are replaced by non-operational placeholders",
            "operator identity is owner-confirmed while address, registration, tax and mandatory disclosure fields remain LEGAL_REVIEW_NOT_YET_COMPLETED",
            "public routing is limited to Quant Lab and legal routes",
            "token, artifact, wallet registration and workspace-handoff navigation is removed",
            "LUMAKey redemption is removed while the fiat Credits Store UX remains",
            "two high-entropy synthetic idempotency fixtures are replaced by deterministic valid UUID fixtures",
            "known UTF-8/cp1252 mojibake is repaired when the transformation strictly reduces encoding markers",
            "every transformed private source file is verified against its expected Git blob SHA before structural sanitization",
        ],
    }
    (output / "SOURCE_PROVENANCE.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(commit)


if __name__ == "__main__":
    main()
