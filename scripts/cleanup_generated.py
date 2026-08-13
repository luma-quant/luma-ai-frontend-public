#!/usr/bin/env python3
"""Remove only generated review artifacts that are denied from the candidate."""

from __future__ import annotations

import shutil
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def remove_readonly(function, path: str, error) -> None:
    del error
    Path(path).chmod(stat.S_IWRITE)
    function(path)


def main() -> None:
    for relative in ("product/node_modules", "product/dist"):
        target = (ROOT / relative).resolve()
        if target.parent == ROOT or ROOT not in target.parents:
            raise SystemExit(f"refusing cleanup outside candidate: {relative}")
        if target.is_dir():
            shutil.rmtree(target, onexc=remove_readonly)
    for target in ROOT.rglob("__pycache__"):
        if target.is_dir() and ROOT in target.resolve().parents:
            shutil.rmtree(target, onexc=remove_readonly)
    for name in (
        "dependency-audit.raw.json",
        "licenses.raw.json",
        "tests.raw.log",
        "build.raw.log",
    ):
        target = ROOT / name
        if target.is_file():
            target.unlink()


if __name__ == "__main__":
    main()
