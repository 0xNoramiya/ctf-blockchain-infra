#!/usr/bin/env python3
from __future__ import annotations
import pathlib, shutil, sys, zipfile


def main() -> int:
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    out = pathlib.Path(__import__("os").environ.get("OUT") or repo_root / "dist")
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    shared = repo_root / "contracts-template" / "lib"

    examples_dir = repo_root / "examples"
    if not examples_dir.exists():
        print("no examples/ directory; nothing to do", file=sys.stderr)
        return 0

    count = 0
    for d in sorted(examples_dir.iterdir()):
        if not (d / "src").exists():
            continue
        name = d.name
        zpath = out / f"{name}.zip"
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for kind in ("src", "script", "test"):
                p = d / kind
                if not p.exists():
                    continue
                for f in p.rglob("*"):
                    if f.is_file():
                        z.write(f, arcname=f"{name}/{kind}/{f.name}")
            for f in shared.rglob("*"):
                if f.is_file():
                    z.write(f, arcname=f"{name}/lib/ctf/{f.name}")
            toml_src = d / "foundry.toml"
            if toml_src.exists():
                text = toml_src.read_text().replace(
                    "../../contracts-template/lib/", "lib/ctf/"
                )
                z.writestr(f"{name}/foundry.toml", text)
            readme = d / "README.md"
            if readme.exists():
                z.write(readme, arcname=f"{name}/README.md")
        size = zpath.stat().st_size
        print(f"  {name:25s}  {size:>6d} bytes")
        count += 1

    print(f"wrote {count} zip(s) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
