#!/bin/bash
set -euo pipefail
# Run on the user's Mac. No checkout/reset/clean of the existing repository.
expected_sha="${1:-}"
if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Usage: /bin/bash %s <verified-production-40-character-SHA>\n' "$0" >&2
  exit 1
fi
repo='/Users/damon/Projects/dashboard'
target="/Users/damon/Projects/dashboard-production-${expected_sha:0:12}"
test -d "$repo"
remote=$(git -C "$repo" remote get-url origin)
case "$remote" in
  https://github.com/gyurinpapa/dashboard|https://github.com/gyurinpapa/dashboard.git|git@github.com:gyurinpapa/dashboard.git) ;;
  *) printf 'Unexpected repository origin; nothing changed.\n' >&2; exit 1 ;;
esac
# Fetch only the exact approved source; do not update a local working branch.
git -C "$repo" fetch --no-tags origin "$expected_sha"
test "$(git -C "$repo" rev-parse "${expected_sha}^{commit}")" = "$expected_sha"
if test -e "$target"; then
  test -d "$target"
  test "$(git -C "$target" rev-parse --show-toplevel)" = "$target"
  test "$(git -C "$target" rev-parse HEAD)" = "$expected_sha"
  test -z "$(git -C "$target" status --porcelain --untracked-files=all)"
else
  git -C "$repo" worktree add --detach "$target" "$expected_sha"
fi
test "$(git -C "$target" rev-parse HEAD)" = "$expected_sha"
test -z "$(git -C "$target" status --porcelain --untracked-files=all)"
printf 'PRODUCTION_SOURCE_SYNC_VERIFIED\nSHA=%s\nPATH=%s\n' "$expected_sha" "$target"
if command -v code >/dev/null 2>&1; then
  code "$target"
else
  open -a 'Visual Studio Code' "$target"
fi
