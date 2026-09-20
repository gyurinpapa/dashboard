#!/usr/bin/env bash
# Build-only installer. Does NOT initialize/start PostgreSQL or execute SQL.
# Run in a non-root Linux/macOS environment with build prerequisites installed.
set -euo pipefail
umask 077

if [[ "${1:-}" == "--help" ]]; then
  echo 'Usage: bash prepare-meta-ads-postgres-runtime.sh --runtime-root NEW_DIRECTORY'
  echo 'Requires: non-root user, Python 3, curl, tar, cc, make, bison, flex, perl, pkg-config, OpenSSL/zlib development headers.'
  echo 'Installs PostgreSQL 17.6 and pgcrypto 1.3 only inside NEW_DIRECTORY. Starts no DB.'
  exit 0
fi
if [[ $# -ne 2 || "$1" != '--runtime-root' ]]; then
  echo 'ERROR: --runtime-root NEW_DIRECTORY is required.' >&2
  exit 2
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo 'BLOCKED: PostgreSQL runtime preparation requires a real non-root OS user. No files changed.' >&2
  exit 3
fi
for tool in python3 curl tar cc make bison flex perl pkg-config; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "BLOCKED: missing build prerequisite: $tool. No automatic system installation." >&2
    exit 4
  fi
done

# Resolve before creating anything; reject protected storage and existing paths.
meta_runtime_root="$(python3 - "$2" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]).expanduser().resolve()
protected = Path('/Users/damon/Projects/dashboard')
if p == protected or protected in p.parents:
    raise SystemExit('BLOCKED: protected repository path')
if p.exists() or not p.parent.is_dir():
    raise SystemExit('BLOCKED: output must be a new directory with an existing parent')
if any(c in str(p) for c in "\n\r\t' "):
    raise SystemExit('BLOCKED: use a simple absolute path without whitespace or quotes')
print(p)
PY
)"
mkdir -m 700 -- "$meta_runtime_root"
meta_source_archive="$meta_runtime_root/postgresql-17.6.tar.bz2"
curl --fail --location --proto '=https' --proto-redir '=https' --max-time 180 \
  --output "$meta_source_archive" \
  'https://ftp.postgresql.org/pub/source/v17.6/postgresql-17.6.tar.bz2'

python3 - "$meta_source_archive" <<'PY'
from pathlib import Path
import hashlib, sys, tarfile
p = Path(sys.argv[1])
expected = 'e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0'
if hashlib.sha256(p.read_bytes()).hexdigest() != expected:
    raise SystemExit('BLOCKED: official PostgreSQL source SHA-256 mismatch')
with tarfile.open(p) as archive:
    for member in archive.getmembers():
        parts = Path(member.name).parts
        if member.name.startswith('/') or '..' in parts or not parts or parts[0] != 'postgresql-17.6':
            raise SystemExit('BLOCKED: archive path outside source root')
        if member.issym() or member.islnk() or member.isdev() or member.isfifo():
            raise SystemExit('BLOCKED: unsupported archive member')
print('SOURCE_SHA256=PASS')
PY
tar -xjf "$meta_source_archive" -C "$meta_runtime_root"
meta_source_root="$meta_runtime_root/postgresql-17.6"
meta_install_root="$meta_runtime_root/install"
(
  cd "$meta_source_root"
  ./configure --prefix="$meta_install_root" --without-readline --without-icu --with-ssl=openssl >"$meta_runtime_root/configure.log" 2>&1
  make -j2 >"$meta_runtime_root/build.log" 2>&1
  make install >"$meta_runtime_root/install.log" 2>&1
  make -C contrib/pgcrypto -j2 >>"$meta_runtime_root/build.log" 2>&1
  make -C contrib/pgcrypto install >>"$meta_runtime_root/install.log" 2>&1
)

python3 - "$meta_install_root" "$meta_runtime_root" <<'PY'
from pathlib import Path
import hashlib, json, os, re, subprocess, sys
prefix, root = map(Path, sys.argv[1:])
if os.geteuid() == 0:
    raise SystemExit('BLOCKED: non-root user required')
versions = {}
for name in ('postgres', 'initdb', 'pg_ctl', 'psql'):
    exe = prefix / 'bin' / name
    version = subprocess.check_output([str(exe), '--version'], text=True).strip()
    if not re.search(r'\b17\.6(?:\s|$)', version):
        raise SystemExit('BLOCKED: PostgreSQL 17.6 version mismatch')
    versions[name] = {'version': version, 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest()}
sharedir = Path(subprocess.check_output([str(prefix / 'bin/pg_config'), '--sharedir'], text=True).strip())
if prefix not in sharedir.parents:
    raise SystemExit('BLOCKED: extension files outside private prefix')
control = sharedir / 'extension/pgcrypto.control'
if not re.search(r"default_version\s*=\s*'1\.3'", control.read_text()):
    raise SystemExit('BLOCKED: pgcrypto 1.3 control file missing')
result = {'status': 'PASS_BINARY_PREPARATION_ONLY', 'uid': os.geteuid(), 'pg_bin': str(prefix / 'bin'),
          'versions': versions, 'pgcrypto_control_version': '1.3',
          'server_started': False, 'db_executions': 0, 'runtime_harness': 'NOT_RUN',
          'source_sha256': 'e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0'}
(root / 'runtime-readiness.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
PY
