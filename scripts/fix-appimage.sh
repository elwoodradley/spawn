#!/usr/bin/env bash
# Repack a Tauri AppImage without the Wayland client libraries it bundles.
#
# linuxdeploy copies libwayland-*.so from the build machine (Ubuntu 22.04 in
# CI) into the AppImage. On newer distributions (Arch, Fedora, recent Ubuntu)
# the host's Mesa then fails with "Could not create default EGL display:
# EGL_BAD_PARAMETER" and the window stays blank. Every desktop that can show
# a Wayland window already has these libraries, so the AppImage uses the
# host's copies instead.
#
# Usage: scripts/fix-appimage.sh path/to/SPAWN_x.y.z_amd64.AppImage
# The file is replaced in place.
set -euo pipefail

image="$(realpath "$1")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

tool="${APPIMAGETOOL:-$work/appimagetool}"
if [[ ! -x "$tool" ]]; then
  curl -fsSL -o "$tool" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$tool"
fi

cd "$work"
chmod +x "$image"
APPIMAGE_EXTRACT_AND_RUN=1 "$image" --appimage-extract >/dev/null

removed=$(find squashfs-root -name 'libwayland-*.so*' -print -delete | wc -l)
echo "removed $removed bundled libwayland files"

APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$tool" --no-appstream squashfs-root "$work/out.AppImage" >/dev/null
mv "$work/out.AppImage" "$image"
chmod +x "$image"
echo "repacked $image"
