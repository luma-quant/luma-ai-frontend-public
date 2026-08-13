from __future__ import annotations

import json
import ast
import re
import unittest
from pathlib import Path

from scripts import finalize_public_candidate


ROOT = Path(__file__).resolve().parents[1]


class CandidateContractTests(unittest.TestCase):
    def test_publication_hashes_normalize_text_line_endings(self) -> None:
        self.assertEqual(
            finalize_public_candidate.canonical_bytes(b"alpha\r\nbeta\rgamma\n"),
            b"alpha\nbeta\ngamma\n",
        )
        binary = b"\x00\r\n"
        self.assertEqual(finalize_public_candidate.canonical_bytes(binary), binary)

    def test_release_records_verified_public_component_without_product_claims(self) -> None:
        release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
        self.assertEqual(release["public_release"], "0.1.0-rc1")
        self.assertEqual(release["trust_layer_component_version"], "1.0")
        self.assertEqual(release["component_status"], "PUBLIC_OPERATIONAL")
        self.assertEqual(release["trust_layer_master_status"], "OUTSIDE_COMPONENT_SCOPE")
        self.assertEqual(release["production_alignment"], "SANITIZED_MIRROR")
        self.assertEqual(release["independent_audit"], "NOT_YET_COMPLETED")
        self.assertEqual(release["legal_review"], "NOT_YET_COMPLETED")
        self.assertEqual(
            release["license_status"],
            "PROPRIETARY_SOURCE_AVAILABLE_ALL_RIGHTS_RESERVED",
        )
        self.assertEqual(
            release["open_review_matters"],
            [
                "LEGAL_REVIEW_NOT_YET_COMPLETED",
                "INDEPENDENT_THIRD_PARTY_AUDIT_NOT_YET_COMPLETED",
            ],
        )
        self.assertNotIn("publication_blockers", release)
        self.assertEqual(release["publication_review_status"], "COMPLETED_VERIFIED")
        self.assertEqual(release["publication_status"], "PUBLIC")
        self.assertTrue(release["publication_performed"])
        self.assertEqual(release["repository"], "luma-quant/luma-ai-frontend-public")
        self.assertEqual(
            release["repository_url"],
            "https://github.com/luma-quant/luma-ai-frontend-public",
        )
        self.assertEqual(release["repository_creation_status"], "COMPLETED_VERIFIED")
        self.assertEqual(release["repository_url_verification"], "COMPLETED_VERIFIED")
        self.assertEqual(release["repository_visibility"], "PUBLIC")
        self.assertEqual(release["source_private_commit_sha"],
                         "b39c2d752abfc9a1c4d151db8519e7b070c7c869")
        self.assertEqual(release["public_root_commit_sha"],
                         "fb645a93c1501b7251137130adca56530d206a98")
        self.assertEqual(release["verified_pre_status_head_commit_sha"],
                         "53a12f3a7e1203729a85104a722f4ce1ccb55bd5")
        self.assertEqual(release["ci_status"], "SUCCESS")
        self.assertEqual(release["codeql_status"], "SUCCESS_ZERO_OPEN_ALERTS")
        self.assertEqual(release["codeql_open_alerts"], 0)
        self.assertEqual(release["deployment_status"], "NOT_CLAIMED")
        self.assertEqual(release["payment_and_delivery_status"], "NOT_CLAIMED")
        self.assertEqual(
            release["publication_evidence"]["public_review_run_url"],
            "https://github.com/luma-quant/luma-ai-frontend-public/actions/runs/31696137890",
        )
        self.assertEqual(
            release["publication_evidence"]["codeql_run_url"],
            "https://github.com/luma-quant/luma-ai-frontend-public/actions/runs/31696137753",
        )
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

    def test_workflow_actions_are_commit_pinned(self) -> None:
        references: list[tuple[str, str]] = []
        for workflow in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            text = workflow.read_text(encoding="utf-8")
            references.extend(
                (workflow.name, value)
                for value in re.findall(r"uses:\s*[^@\s]+@([^\s]+)", text)
            )
        self.assertTrue(references)
        for workflow, reference in references:
            self.assertRegex(reference, r"^[0-9a-f]{40}$", workflow)

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
