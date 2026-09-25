#!/usr/bin/env bash
# Install a locally built SPAWN into the current user's home so it shows up
# in the app launcher with its icon. No root needed. Run through
# `npm run install:linux` (which builds first) or directly after a build.
#
# Puts:
#   ~/.local/bin/spawn
#   ~/.local/share/applications/dev.stonetoad.spawn.desktop
#   ~/.local/share/icons/hicolor/<size>/apps/dev.stonetoad.spawn.png
#
# Uninstall with: scripts/install-linux.sh --uninstall
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
binary="$here/src-tauri/target/release/spawn"
icons="$here/src-tauri/icons"
app_id="dev.stonetoad.spawn"

bin_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
desktop_dir="$data_dir/applications"
icon_root="$data_dir/icons/hicolor"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$bin_dir/spawn" "$desktop_dir/$app_id.desktop"
  find "$icon_root" -name "$app_id.png" -delete 2>/dev/null || true
  command -v update-desktop-database >/dev/null && update-desktop-database "$desktop_dir" || true
  echo "SPAWN removed from $bin_dir and $desktop_dir"
  exit 0
fi

if [[ ! -x "$binary" ]]; then
  echo "No release binary at $binary. Run: npm run tauri build -- --no-bundle" >&2
  exit 1
fi

mkdir -p "$bin_dir" "$desktop_dir"
install -m 755 "$binary" "$bin_dir/spawn"

for size in 32 128 256 512; do
  src="$icons/${size}x${size}.png"
  [[ "$size" == "256" ]] && src="$icons/128x128@2x.png"
  [[ "$size" == "512" ]] && src="$icons/icon.png"
  [[ -f "$src" ]] || continue
  mkdir -p "$icon_root/${size}x${size}/apps"
  install -m 644 "$src" "$icon_root/${size}x${size}/apps/$app_id.png"
done

cat > "$desktop_dir/$app_id.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=SPAWN
GenericName=Python IDE
Comment=A Python IDE for machine learning work
Exec=$bin_dir/spawn %F
Icon=$app_id
Terminal=false
Categories=Development;IDE;
MimeType=text/x-python;
StartupWMClass=spawn
Keywords=python;ide;ml;torch;jupyter;
EOF

command -v update-desktop-database >/dev/null && update-desktop-database "$desktop_dir" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$icon_root" 2>/dev/null || true

echo "Installed: $bin_dir/spawn"
echo "Launcher entry: $desktop_dir/$app_id.desktop"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Note: $bin_dir is not on your PATH; the launcher still works." ;;
esac
