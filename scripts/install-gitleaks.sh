#!/usr/bin/env bash
# Downloads a pinned, checksum-verified gitleaks binary into .tools/bin/.
# Usage: scripts/install-gitleaks.sh   (prints the binary path on success)
set -euo pipefail

GITLEAKS_VERSION="8.30.1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT_DIR}/.tools/bin"
BIN="${BIN_DIR}/gitleaks"

if [ -x "$BIN" ] && "$BIN" version 2>/dev/null | grep -q "^${GITLEAKS_VERSION}$"; then
  echo "$BIN"
  exit 0
fi

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "install-gitleaks: unsupported OS $(uname -s); install gitleaks ${GITLEAKS_VERSION} manually" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "install-gitleaks: unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

# SHA-256 checksums from gitleaks_${GITLEAKS_VERSION}_checksums.txt
case "${os}_${arch}" in
  linux_x64) sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;;
  linux_arm64) sha=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;;
  darwin_x64) sha=dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709 ;;
  darwin_arm64) sha=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5 ;;
esac

tarball="gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"
url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarball}"
tmp="$(mktemp -d)"
trap 'rm -r "$tmp"' EXIT

curl -fsSL -o "${tmp}/${tarball}" "$url"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp}/${tarball}" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "${tmp}/${tarball}" | cut -d' ' -f1)"
fi
if [ "$actual" != "$sha" ]; then
  echo "install-gitleaks: checksum mismatch for ${tarball}" >&2
  exit 1
fi

tar -xzf "${tmp}/${tarball}" -C "$tmp" gitleaks
mkdir -p "$BIN_DIR"
mv "${tmp}/gitleaks" "$BIN"
chmod +x "$BIN"
echo "$BIN"
