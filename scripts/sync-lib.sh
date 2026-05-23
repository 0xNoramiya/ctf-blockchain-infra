#!/usr/bin/env bash
# Vendor contracts-template/lib/ into each examples/*/lib/ctf-infra/.
# Forge's "outside allowed directories" sandboxing makes cross-dir
# imports painful in CI; copying the shared lib into each example
# keeps imports local. Run this whenever contracts-template/lib/
# changes; CI calls it before forge build.
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/contracts-template/lib"
[ -d "$SRC" ] || { echo "missing $SRC"; exit 1; }

for d in "$REPO_ROOT"/examples/*/; do
  [ -f "$d/foundry.toml" ] || continue
  target="$d/lib/ctf-infra"
  mkdir -p "$target"
  find "$SRC" -maxdepth 1 -type f -name '*.sol' -exec cp -f {} "$target/" \;
  cp -f "$SRC/README.md" "$target/README.md" 2>/dev/null || true
  printf "  synced %s\n" "$target"
done
