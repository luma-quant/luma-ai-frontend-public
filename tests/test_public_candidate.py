from __future__ import annotations

import json
import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CandidateContractTests(unittest.TestCase):
    def test_release_is_publication_review_ready_without_publish_claim(self) -> None:
        release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
        self.assertEqual(release["public_release"], "0.1.0-rc1")
        self.assertEqual(release["production_alignment"], "SANITIZED_MIRROR")
        self.assertEqual(release["independent_audit"], "NOT_YET_COMPLETED")
        self.assertEqual(release["legal_review"], "NOT_YET_COMPLETED")
        self.assertEqual(
            release["license_status"],
            "PROPRIETARY_SOURCE_AVAILABLE_ALL_RIGHTS_RESERVED",
        )
        self.assertEqual(
            release["publication_blockers"],
            [
                "LEGAL_REVIEW_NOT_YET_COMPLETED",
                "INDEPENDENT_THIRD_PARTY_AUDIT_NOT_YET_COMPLETED",
            ],
        )
        self.assertEqual(release["publication_review_status"], "PUBLICATION_REVIEW_READY")
        self.assertEqual(release["publication_status"], "PUBLIC_REPOSITORY_PENDING")
        self.assertFalse(release["publication_performed"])
        self.assertEqual(release["repository"], "wotanIII/luma-ai-frontend-public")
        self.assertEqual(
            release["repository_url"],
            "https://github.com/wotanIII/luma-ai-frontend-public",
        )
        self.assertEqual(release["repository_creation_status"], "PENDING")
        self.assertEqual(len(release["product_source_sha256"]), 64)
        self.assertEqual(len(release["public_candidate_sha256"]), 64)

    def test_candidate_has_no_private_staging_self_labels(self) -> None:
        forbidden = (
            "private" + "-review",
            "private" + " staging",
            "private" + "_external_review",
            "ready_for_external_review_" + "private",
            "draft" + "_pr",
            "draft pull" + " request",
        )
        findings: list[str] = []
        for path in ROOT.rglob("*"):
            if not path.is_file() or "node_modules" in path.parts:
                continue
            try:
                text = path.read_text(encoding="utf-8").casefold()
            except (UnicodeDecodeError, OSError):
                continue
            for marker in forbidden:
                if marker.casefold() in text:
                    findings.append(f"{path.relative_to(ROOT).as_posix()}:{marker}")
        self.assertEqual(findings, [])

    def test_environment_contains_placeholders_only(self) -> None:
        value = (ROOT / "product" / ".env.example").read_text(encoding="utf-8")
        self.assertIn("api.example.invalid", value)
        self.assertIn("YOUR_GOOGLE_OAUTH_CLIENT_ID", value)
        self.assertNotIn(".a." + "run.app", value)

    def test_separate_product_modules_are_absent(self) -> None:
        denied = ("tokenPortal", "artifacts", "WorkspaceHandoff", "WorkspaceRegistration")
        paths = [path.as_posix() for path in (ROOT / "product" / "src").rglob("*") if path.is_file()]
        for marker in denied:
            self.assertFalse(any(marker in path for path in paths), marker)

    def test_exporter_cannot_reconstruct_removed_private_identifiers(self) -> None:
        exporter_path = ROOT / "scripts" / "build_public_ai_frontend_export.py"
        source = exporter_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        literals = [
            node.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        ]
        joined = "\n".join(literals)
        self.assertNotIn(".join(", source)
        self.assertNotRegex(joined, r"[a-z0-9-]+\.a\.run\.app")
        uuids = set(__import__("re").findall(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            joined,
        ))
        self.assertLessEqual(
            uuids,
            {
                "00000000-0000-0000-0000-000000000000",
                "00000000-0000-4000-8000-000000000001",
                "00000000-0000-4000-8000-000000000002",
            },
        )
        for size in range(2, min(6, len(literals)) + 1):
            for start in range(len(literals) - size + 1):
                combined = "".join(literals[start:start + size])
                self.assertNotRegex(combined, r"[a-z0-9-]+\.a\.run\.app")

    def test_all_transformed_source_files_are_blob_bound(self) -> None:
        exporter = ROOT / "scripts" / "build_public_ai_frontend_export.py"
        module = ast.parse(exporter.read_text(encoding="utf-8"))
        assignment = next(
            node for node in module.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "TRANSFORM_BLOB_SHA1" for target in node.targets)
        )
        self.assertIsInstance(assignment.value, ast.Call)
        bindings: dict[str, str] = {}
        for pair in assignment.value.args[0].elts:
            key_node, value_node = pair.elts
            if isinstance(key_node, ast.Call):
                path_call = key_node.args[0]
                self.assertIsInstance(path_call, ast.Call)
                key = "/".join(ast.literal_eval(argument) for argument in path_call.args)
            else:
                key = ast.literal_eval(key_node)
            bindings[key] = ast.literal_eval(value_node)
        expected = {
            "src/App.tsx",
            "src/api/advisorRunRecovery.test.ts",
            "src/api/apiClient.ts",
            "src/api/backendData.test.ts",
            "src/api/frontendPolishUi.test.ts",
            "src/components/CreditStore.tsx",
            "src/components/SideNavbar.tsx",
            "src/legal/legalPolicies.ts",
            "src/support/crisp.ts",
        }
        self.assertEqual(set(bindings), expected)
        self.assertTrue(all(len(value) == 40 for value in bindings.values()))

    def test_owner_metadata_is_confirmed_without_overstating_legal_review(self) -> None:
        policies = (ROOT / "product" / "src" / "legal" / "legalPolicies.ts").read_text(encoding="utf-8")
        self.assertIn("COMPLETED_OWNER_CONFIRMED", policies)
        self.assertIn("LEGAL_REVIEW_NOT_YET_COMPLETED", policies)
        self.assertNotIn("independently checked", policies)
        self.assertIn("Luma Quant e.U.", policies)
        owner = json.loads((ROOT / "OWNER_GATE_STATUS.json").read_text(encoding="utf-8"))
        self.assertEqual(owner["operator_identity"]["status"], "COMPLETED_OWNER_CONFIRMED")
        self.assertEqual(owner["operator_identity"]["legal_operator"], "Luma Quant e.U.")
        self.assertEqual(owner["security_contact"]["address"], "security@lumaquant.tech")
        self.assertEqual(owner["security_contact"]["independent_verification"], "NOT_PERFORMED")
        self.assertEqual(
            owner["open_review_matters"],
            [
                "LEGAL_REVIEW_NOT_YET_COMPLETED",
                "INDEPENDENT_THIRD_PARTY_AUDIT_NOT_YET_COMPLETED",
            ],
        )

    def test_binary_assets_have_exact_owner_attested_inventory(self) -> None:
        inventory = json.loads((ROOT / "ASSET_RIGHTS_INVENTORY.json").read_text(encoding="utf-8"))
        extensions = {".gif", ".ico", ".jpeg", ".jpg", ".mp4", ".otf", ".png", ".svg", ".ttf", ".webm", ".webp", ".woff", ".woff2"}
        actual = sorted(
            path.relative_to(ROOT).as_posix()
            for path in ROOT.rglob("*")
            if path.is_file() and path.suffix.lower() in extensions
        )
        entries = inventory["assets"]
        self.assertEqual([entry["path"] for entry in entries], actual)
        self.assertEqual(inventory["asset_count"], len(actual))
        self.assertEqual(inventory["unresolved_asset_count"], 0)
        for entry in entries:
            path = ROOT / entry["path"]
            payload = path.read_bytes()
            self.assertEqual(entry["bytes"], len(payload))
            self.assertEqual(entry["sha256"], __import__("hashlib").sha256(payload).hexdigest())
            self.assertIn(entry["status"], {"OWNED", "LICENSED_FOR_PUBLIC_REPOSITORY"})
            self.assertEqual(entry["attestation"], "OWNER_CONFIRMED")


if __name__ == "__main__":
    unittest.main()
