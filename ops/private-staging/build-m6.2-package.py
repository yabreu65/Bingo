#!/usr/bin/env python3
"""Build an allowlisted, deterministic M6.2 source archive; never invokes Docker."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
POLICY_PATH = SCRIPT_DIR / "m6.2-package-inputs.json"

PLACEHOLDER_USERS = frozenset({b"user", b"username", b"test", b"test-user", b"example", b"example-user", b"dummy", b"placeholder"})
PLACEHOLDER_PASSWORDS = frozenset({b"password", b"pass", b"test", b"test-password", b"example", b"example-password", b"dummy", b"placeholder", b"changeme"})
SECRET_PATTERNS = (
    ("private-key", re.compile(rb"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(rb"\bAKIA[A-Z0-9]{16}\b")),
    ("github-token", re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b")),
    ("slack-token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("credential-uri", re.compile(rb"\b(?:mongodb(?:\+srv)?|postgres(?:ql)?)://[^/\s:@]+:[^@\s/]+@")),
)
MANDATORY_EXCLUSIONS = frozenset(
    {
        "**/.env*", "**/secrets/**", "**/node_modules/**", "**/dist/**",
        "**/coverage/**", "**/logs/**", "**/uploads/**", "**/*.log",
        "**/*.wt", "**/*.bson", "**/*.bak", "**/*.backup", "**/WiredTiger*",
        "**/journal/**", "**/diagnostic.data/**", "backend/.tmp-*",
        "backend/.t7-*.json", "backend/.t8-*.json", "bingo-react/public/music/**",
        "**/.DS_Store", "docs/m6-t8-inventory.json", "odd/**", "*.patch",
    }
)


class PackageError(RuntimeError):
    """A fail-closed package input or integrity error."""


@dataclass(frozen=True)
class SourceFile:
    path: str
    content: bytes
    mode: int
    source: str
    git_status: str

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()

    def manifest_entry(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "sizeBytes": len(self.content),
            "sha256": self.sha256,
            "mode": f"{self.mode:04o}",
            "source": self.source,
            "gitStatus": self.git_status,
        }


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def is_excluded_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    parts = PurePosixPath(normalized).parts
    name = parts[-1] if parts else ""
    low = normalized.lower()
    return (
        normalized.startswith("bingo-react/public/music/")
        or name == ".DS_Store"
        or any(part in {"node_modules", "dist", "coverage", "logs", "uploads", "secrets"} for part in parts)
        or name.startswith(".env")
        or name.endswith((".log", ".wt", ".bson", ".bak", ".backup", ".tmp"))
        or "wiredtiger" in low
        or "/journal/" in low
        or "/diagnostic.data/" in low
        or name.startswith((".t7-", ".t8-", ".tmp-"))
        or normalized.startswith("odd/")
        or name.endswith(".patch")
    )


def validate_relative_path(path: str) -> str:
    if not isinstance(path, str) or not path or "\\" in path:
        raise PackageError("invalid allowlist path")
    candidate = PurePosixPath(path)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        raise PackageError("allowlist path escapes or aliases the source root")
    normalized = candidate.as_posix()
    if normalized != path:
        raise PackageError("allowlist path is not canonical")
    return normalized


def run_git(root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise PackageError("required Git metadata is unavailable")
    return result.stdout


def git_status_map(root: Path) -> dict[str, str]:
    raw = run_git(root, "status", "--porcelain=v1", "--untracked-files=all", "-z")
    statuses: dict[str, str] = {}
    for entry in raw.split(b"\0"):
        if not entry:
            continue
        if len(entry) < 4:
            raise PackageError("cannot parse Git status metadata")
        status = entry[:2].decode("ascii", errors="strict")
        path = os.fsdecode(entry[3:])
        statuses[path] = status
    return statuses


def validate_exclusion_policy(policy: dict[str, Any]) -> None:
    patterns = policy.get("excludedPatterns")
    if not isinstance(patterns, list) or len(patterns) != len(set(patterns)):
        raise PackageError("exclusion policy must be a unique explicit list")
    missing = MANDATORY_EXCLUSIONS.difference(patterns)
    if missing:
        raise PackageError("exclusion policy is missing mandatory safety patterns")


def tracked_input_paths(root: Path, policy: dict[str, Any]) -> list[str]:
    validate_exclusion_policy(policy)
    paths = [
        os.fsdecode(item)
        for item in run_git(root, "ls-files", "-z", "--", *policy["trackedRoots"]).split(b"\0")
        if item
    ]
    selected = sorted(path for path in paths if not is_excluded_path(path))
    snapshot = hashlib.sha256(("\n".join(selected) + "\n").encode("utf-8")).hexdigest()
    if snapshot != policy["trackedPathSnapshotSha256"]:
        raise PackageError("tracked source path snapshot differs from the reviewed allowlist")
    return selected


def validate_repository(root: Path, policy: dict[str, Any]) -> dict[str, str]:
    branch = run_git(root, "branch", "--show-current").decode("utf-8").strip()
    head = run_git(root, "rev-parse", "HEAD").decode("ascii").strip()
    if branch != policy["sourceBranch"] or head != policy["sourceHead"]:
        raise PackageError("source branch or HEAD differs from the reviewed release base")
    staged = subprocess.run(
        ["git", "-C", str(root), "diff", "--cached", "--quiet"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if staged.returncode != 0:
        raise PackageError("staged changes are not permitted in this release build")
    return git_status_map(root)


def validate_image_lock(root: Path, policy: dict[str, Any]) -> dict[str, Any]:
    lock_path = root / validate_relative_path(policy["imageLockPath"])
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if lock.get("targetPlatform") != policy["targetPlatform"]:
        raise PackageError("image lock platform does not match release policy")
    images = lock.get("images")
    expected = {"mongo:7.0", "node:22-alpine", "nginx:1.27-alpine", "traefik:v3.3"}
    if not isinstance(images, list) or {image.get("configuredTag") for image in images} != expected:
        raise PackageError("image lock does not contain the exact reviewed image set")
    for image in images:
        ref = image.get("pinnedReference", "")
        digest = image.get("platformManifestDigest", "")
        if not re.fullmatch(r"[^@\s]+@sha256:[a-f0-9]{64}", ref):
            raise PackageError("image reference is not digest-pinned")
        if digest != ref.rsplit("@", 1)[1] or not re.fullmatch(r"sha256:[a-f0-9]{64}", image.get("ociIndexDigest", "")):
            raise PackageError("image lock digest fields are inconsistent")
        if not image.get("metadataUrl", "").startswith("https://hub.docker.com/v2/repositories/"):
            raise PackageError("image lock is missing official registry metadata provenance")
    return lock


def resolve_source_file(root: Path, relative_path: str, source: str, git_status: str) -> SourceFile:
    relative_path = validate_relative_path(relative_path)
    if is_excluded_path(relative_path):
        raise PackageError("an excluded path was requested by the allowlist")
    current = root
    for part in PurePosixPath(relative_path).parts:
        current = current / part
        if current.is_symlink():
            raise PackageError("symlinked release inputs are not permitted")
    resolved = current.resolve(strict=True)
    if not resolved.is_relative_to(root.resolve()) or not resolved.is_file():
        raise PackageError("release input is not a regular file within the source root")
    content = resolved.read_bytes()
    mode = 0o755 if stat.S_IMODE(resolved.stat().st_mode) & 0o111 else 0o644
    return SourceFile(relative_path, content, mode, source, git_status)


def is_placeholder_credential_uri(value: bytes, source_path: str) -> bool:
    authority = value.split(b"://", 1)[1].split(b"@", 1)[0]
    if any(marker in authority for marker in (b"$", b"<", b">", b"{", b"}")):
        return True
    username, separator, password = authority.partition(b":")
    if not separator:
        return False
    if username.lower() in PLACEHOLDER_USERS and password.lower() in PLACEHOLDER_PASSWORDS:
        return True
    is_test_fixture = source_path.endswith((".test.js", ".test.cjs", ".test.mjs", ".test.py"))
    return is_test_fixture and username.lower().startswith(b"test-") and password.lower().startswith(b"test-")


def scan_secrets(files: list[SourceFile]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for source_file in files:
        for rule, pattern in SECRET_PATTERNS:
            for match in pattern.finditer(source_file.content):
                if rule == "credential-uri" and is_placeholder_credential_uri(match.group(0), source_file.path):
                    continue
                findings.append((source_file.path, rule))
                break
    return findings


def collect_source_files(root: Path, policy: dict[str, Any], statuses: dict[str, str]) -> list[SourceFile]:
    tracked = tracked_input_paths(root, policy)
    additional = [validate_relative_path(path) for path in policy["additionalFiles"]]
    if len(set(additional)) != len(additional):
        raise PackageError("additional allowlist contains duplicate paths")
    tracked_set = set(tracked)
    if tracked_set.intersection(additional):
        raise PackageError("additional allowlist overlaps tracked source paths")
    files = [resolve_source_file(root, path, "tracked-root", statuses.get(path, "clean")) for path in tracked]
    for path in sorted(additional):
        if statuses.get(path) != "??":
            raise PackageError("explicit additional input is not an untracked file")
        files.append(resolve_source_file(root, path, "explicit-additional", "??"))
    if len({source_file.path for source_file in files}) != len(files):
        raise PackageError("release allowlist contains duplicate paths")
    total_bytes = sum(len(source_file.content) for source_file in files)
    if total_bytes > policy["maximumUncompressedBytes"]:
        raise PackageError("allowlisted source exceeds the configured size limit")
    findings = scan_secrets(files)
    if findings:
        summary = ", ".join(f"{path} ({rule})" for path, rule in findings)
        raise PackageError(f"high-confidence secret patterns found: {summary}")
    return sorted(files, key=lambda source_file: source_file.path)


def create_manifest(files: list[SourceFile], policy: dict[str, Any], image_lock: dict[str, Any]) -> dict[str, Any]:
    file_entries = [source_file.manifest_entry() for source_file in files]
    identity = {
        "sourceHead": policy["sourceHead"],
        "targetPlatform": policy["targetPlatform"],
        "trackedPathSnapshotSha256": policy["trackedPathSnapshotSha256"],
        "files": file_entries,
        "images": image_lock["images"],
    }
    identity_sha = hashlib.sha256(canonical_json(identity)).hexdigest()
    return {
        "schemaVersion": 1,
        "releaseId": f"m6.2-{policy['sourceHead'][:8]}-{identity_sha[:12]}",
        "source": {
            "branch": policy["sourceBranch"],
            "baseHead": policy["sourceHead"],
            "worktreeContentIncluded": True,
            "trackedPathSnapshotSha256": policy["trackedPathSnapshotSha256"],
        },
        "targetPlatform": policy["targetPlatform"],
        "images": image_lock["images"],
        "inputAllowlist": {
            "trackedRoots": policy["trackedRoots"],
            "additionalFiles": sorted(policy["additionalFiles"]),
            "exclusions": policy["excludedPatterns"],
        },
        "files": file_entries,
        "archive": {
            "format": "deterministic-gzip-ustar",
            "metadataPolicy": "mtime=0, uid=0, gid=0, normalized mode",
            "sha256": "recorded in the external SHA256SUMS sidecar after archive creation",
        },
    }


def build_archive_bytes(files: list[SourceFile], manifest_bytes: bytes) -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0, compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for source_file in sorted(files, key=lambda item: item.path):
                info = tarfile.TarInfo(source_file.path)
                info.size = len(source_file.content)
                info.mode = source_file.mode
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                info.mtime = 0
                archive.addfile(info, io.BytesIO(source_file.content))
            info = tarfile.TarInfo("MANIFEST.json")
            info.size = len(manifest_bytes)
            info.mode = 0o644
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mtime = 0
            archive.addfile(info, io.BytesIO(manifest_bytes))
    return output.getvalue()


def verify_archive_bytes(archive_bytes: bytes, files: list[SourceFile], manifest_bytes: bytes) -> None:
    expected = {source_file.path: source_file for source_file in files}
    expected["MANIFEST.json"] = None
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or set(names) != set(expected):
            raise PackageError("archive member set differs from the exact allowlist")
        for member in members:
            if not member.isfile() or member.uid != 0 or member.gid != 0 or member.mtime != 0:
                raise PackageError("archive contains non-regular or non-normalized members")
            if member.name != "MANIFEST.json" and is_excluded_path(member.name):
                raise PackageError("archive contains a forbidden path")
            stream = archive.extractfile(member)
            if stream is None:
                raise PackageError("archive member could not be read")
            content = stream.read()
            if member.name == "MANIFEST.json":
                if content != manifest_bytes:
                    raise PackageError("embedded manifest differs from the reviewed manifest")
                continue
            source_file = expected[member.name]
            if len(content) != len(source_file.content) or hashlib.sha256(content).hexdigest() != source_file.sha256:
                raise PackageError("archive member content hash differs from its manifest")
            if member.mode != source_file.mode:
                raise PackageError("archive member mode differs from normalized manifest mode")


def write_exclusive(path: Path, content: bytes, mode: int = 0o600) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(descriptor, "wb") as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())


def build_package(root: Path, output_root: Path) -> dict[str, Any]:
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    authorized = Path(policy["authorizedOutputDirectory"])
    if output_root != authorized:
        raise PackageError("output directory differs from the owner-authorized exact path")
    if output_root.exists() or output_root.is_symlink():
        raise PackageError("authorized output directory already exists; refusing to overwrite")
    statuses = validate_repository(root, policy)
    files = collect_source_files(root, policy, statuses)
    image_lock = validate_image_lock(root, policy)
    manifest = create_manifest(files, policy, image_lock)
    manifest_bytes = canonical_json(manifest)
    archive_bytes = build_archive_bytes(files, manifest_bytes)
    if len(archive_bytes) > policy["maximumArchiveBytes"]:
        raise PackageError("compressed archive exceeds the configured size limit")
    verify_archive_bytes(archive_bytes, files, manifest_bytes)

    output_root.mkdir(mode=0o700, parents=False, exist_ok=False)
    manifest_path = output_root / "MANIFEST.json"
    archive_path = output_root / f"{manifest['releaseId']}.tar.gz"
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    archive_hash = hashlib.sha256(archive_bytes).hexdigest()
    sidecar = f"{archive_hash}  {archive_path.name}\n{manifest_hash}  MANIFEST.json\n".encode("ascii")
    write_exclusive(archive_path, archive_bytes)
    write_exclusive(manifest_path, manifest_bytes)
    write_exclusive(output_root / "SHA256SUMS", sidecar)
    return {
        "releaseId": manifest["releaseId"],
        "outputDirectory": str(output_root),
        "archive": archive_path.name,
        "archiveBytes": len(archive_bytes),
        "archiveSha256": archive_hash,
        "manifestSha256": manifest_hash,
        "fileCount": len(files),
        "targetPlatform": policy["targetPlatform"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--output-root", type=Path)
    args = parser.parse_args(argv)
    try:
        policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
        output_root = args.output_root if args.output_root is not None else Path(policy["authorizedOutputDirectory"])
        result = build_package(args.source_root.resolve(), output_root)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, PackageError) as error:
        print(f"PACKAGE_BUILD_FAIL {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
