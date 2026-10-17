#!/usr/bin/env bash
# Installs a pinned, checksum-verified Litestream binary into .tools/bin for tests and CI.
set -euo pipefail

VERSION="0.5.17"

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="$root/.tools/bin"
target="$bin_dir/litestream"

if [[ -x "$target" ]] && "$target" version 2>/dev/null | grep -qx "v\{0,1\}$VERSION"; then
  exit 0
fi

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
[[ "$arch" == "aarch64" ]] && arch="arm64"
platform="$os-$arch"
case "$platform" in
  darwin-arm64) expected="e211f68ff7658d19f193f2914417afdf8f89a053ff8f263e5d6b3b1d3bbc7b08" ;;
  darwin-x86_64) expected="891875af09db152e93a4b31a8a79f538ce7ce702c132803cfe0a831e7cb1b7db" ;;
  linux-arm64) expected="f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5" ;;
  linux-x86_64) expected="cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d" ;;
  *)
    echo "No pinned Litestream build for $platform" >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
archive="litestream-$VERSION-$platform.tar.gz"
curl -fsSL -o "$tmp/$archive" "https://github.com/benbjohnson/litestream/releases/download/v$VERSION/$archive"
actual="$(shasum -a 256 "$tmp/$archive" | cut -d' ' -f1)"
if [[ "$actual" != "$expected" ]]; then
  echo "Checksum mismatch for $archive: expected $expected, got $actual" >&2
  exit 1
fi
tar -xzf "$tmp/$archive" -C "$tmp"
mkdir -p "$bin_dir"
install -m 0755 "$tmp/litestream" "$target"
"$target" version
