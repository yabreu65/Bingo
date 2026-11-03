from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("build-m6.2-package.py")
POLICY_PATH = Path(__file__).with_name("m6.2-package-inputs.json")
LOCK_PATH = Path(__file__).with_name("m6.2-image-lock.json")

spec = importlib.util.spec_from_file_location("m6_2_package", SCRIPT)
assert spec is not None and spec.loader is not None
package = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = package
spec.loader.exec_module(package)


class PackageBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
        cls.lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))

    def test_tracked_path_snapshot_matches_exact_allowlist_fingerprint(self) -> None:
        # M6.2 is an immutable historical package, pinned to commit 020d654.
        # On any later source tree the builder must reject snapshot drift.
        current = [
            package.os.fsdecode(item)
            for item in package.run_git(ROOT, "ls-files", "-z", "--", *self.policy["trackedRoots"]).split(b"\0")
            if item
        ]
        selected = sorted(path for path in current if not package.is_excluded_path(path))
        fingerprint = package.hashlib.sha256(
            ("\n".join(selected) + "\n").encode()
        ).hexdigest()
        if fingerprint != self.policy["trackedPathSnapshotSha256"]:
            with self.assertRaisesRegex(package.PackageError, "tracked source path snapshot differs"):
                package.tracked_input_paths(ROOT, self.policy)
            return
        paths = package.tracked_input_paths(ROOT, self.policy)
        self.assertEqual(len(paths), 229)
        self.assertEqual(
            package.hashlib.sha256(("\n".join(paths) + "\n").encode()).hexdigest(),
            self.policy["trackedPathSnapshotSha256"],
        )
        self.assertFalse(any(package.is_excluded_path(path) for path in paths))

    def test_explicit_additional_paths_are_canonical_and_not_excluded(self) -> None:
        paths = self.policy["additionalFiles"]
        self.assertEqual(len(paths), len(set(paths)))
        self.assertTrue(all(package.validate_relative_path(path) == path for path in paths))
        self.assertFalse(any(package.is_excluded_path(path) for path in paths))
        self.assertIn("backend/app.js", paths)
        self.assertIn("ops/private-staging/compose.yaml", paths)
        self.assertNotIn("docs/m6-t8-inventory.json", paths)

    def test_policy_rejects_missing_mandatory_exclusions(self) -> None:
        validate = getattr(package, "validate_exclusion_policy", None)
        self.assertIsNotNone(validate, "package policy must fail closed if a mandatory exclusion is removed")
        policy = dict(self.policy)
        policy["excludedPatterns"] = [pattern for pattern in self.policy["excludedPatterns"] if pattern != "**/.env*"]
        with self.assertRaises(package.PackageError):
            validate(policy)

    def test_image_lock_contains_only_digest_pinned_target_architecture_images(self) -> None:
        self.assertEqual(self.lock["targetPlatform"], "linux/amd64")
        validated = package.validate_image_lock(ROOT, self.policy)
        self.assertEqual(len(validated["images"]), 4)
        self.assertTrue(all("@sha256:" in image["pinnedReference"] for image in validated["images"]))

    def test_archive_bytes_are_reproducible_and_members_are_normalized(self) -> None:
        source = [
            package.SourceFile("backend/server.js", b"server source\n", 0o644, "tracked-root", " M"),
            package.SourceFile("ops/run.sh", b"#!/bin/sh\n", 0o755, "explicit-additional", "??"),
        ]
        manifest = b'{"releaseId":"fixture"}\n'
        first = package.build_archive_bytes(source, manifest)
        second = package.build_archive_bytes(source, manifest)
        self.assertEqual(first, second)
        package.verify_archive_bytes(first, source, manifest)

    def test_archive_verifier_rejects_a_forbidden_member(self) -> None:
        forbidden = package.SourceFile("backend/.env", b"ignored", 0o644, "test", "??")
        archive = package.build_archive_bytes([forbidden], b"{}\n")
        with self.assertRaisesRegex(package.PackageError, "forbidden path"):
            package.verify_archive_bytes(archive, [forbidden], b"{}\n")

    def test_secret_scanner_returns_path_and_rule_without_secret_material(self) -> None:
        marker = b"-----BEGIN " + b"PRIVATE KEY-----"
        fixture = package.SourceFile("fixture.txt", marker, 0o644, "test", "")
        self.assertEqual(package.scan_secrets([fixture]), [("fixture.txt", "private-key")])

    def test_secret_scanner_ignores_placeholders_but_flags_literal_credential_uris(self) -> None:
        template_uri = b"mongodb://" + b"test-user" + b":" + b"test-password" + b"@mongo:27017/db"
        template = package.SourceFile("template.js", template_uri, 0o644, "test", "")
        generated_uri = b"mongodb://${appUser}:${appPassword}@mongo:27017/db"
        generated = package.SourceFile("generated.js", generated_uri, 0o644, "test", "")
        self.assertEqual(package.scan_secrets([template, generated]), [])

        literal_uri = b"mongodb://" + b"alice" + b":" + b"x" * 32 + b"@mongo:27017/db"
        literal = package.SourceFile("fixture.js", literal_uri, 0o644, "test", "")
        self.assertEqual(package.scan_secrets([literal]), [("fixture.js", "credential-uri")])

        synthetic_test_uri = b"mongodb://" + b"test-app" + b":" + b"test-app-password" + b"@mongo:27017/db"
        test_fixture = package.SourceFile("mongo-bootstrap.test.js", synthetic_test_uri, 0o644, "test", "")
        self.assertEqual(package.scan_secrets([test_fixture]), [])
        application_config = package.SourceFile("config.js", synthetic_test_uri, 0o644, "test", "")
        self.assertEqual(package.scan_secrets([application_config]), [("config.js", "credential-uri")])

    def test_allowlist_path_rejects_traversal_and_noncanonical_forms(self) -> None:
        for path in ("../outside", "/absolute/file", "backend//app.js", "backend/./app.js", "backend\\app.js"):
            with self.subTest(path=path), self.assertRaises(package.PackageError):
                package.validate_relative_path(path)

    def test_current_inputs_are_regular_allowlisted_files_with_no_secret_pattern_hits(self) -> None:
        branch = package.run_git(ROOT, "branch", "--show-current").decode().strip()
        head = package.run_git(ROOT, "rev-parse", "HEAD").decode().strip()
        if branch != self.policy["sourceBranch"] or head != self.policy["sourceHead"]:
            # The historical package must fail closed; never rebase its locked
            # source identity silently onto a later main commit.
            with self.assertRaisesRegex(package.PackageError, "source branch or HEAD differs"):
                package.validate_repository(ROOT, self.policy)
            return
        statuses = package.validate_repository(ROOT, self.policy)
        files = package.collect_source_files(ROOT, self.policy, statuses)
        self.assertEqual(len(files), 229 + len(self.policy["additionalFiles"]))
        self.assertFalse(any(package.is_excluded_path(source_file.path) for source_file in files))
        self.assertEqual(package.scan_secrets(files), [])


if __name__ == "__main__":
    unittest.main()
