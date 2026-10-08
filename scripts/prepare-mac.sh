#!/bin/bash
# Local development signature only. Never disables Gatekeeper or uses sudo.
set -euo pipefail
fail() { printf '\n准备失败：%s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || fail '请在 Mac 上运行此脚本。'
bundle="${1:-}"
[[ -d "$bundle" && "$bundle" == *.app ]] || fail '请选择 Control Resonant.app。'
bundle="$(cd "$bundle" && pwd -P)"
info="$bundle/Contents/Info.plist"
[[ -f "$info" ]] || fail '应用结构不完整，请重新解压。'
identifier=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")
[[ "$identifier" == com.huajijiang.controlresonant ]] || fail '这不是 Control Resonant 应用，已停止。'
entitlements="$bundle/Contents/Resources/app/desktop/mac-entitlements.plist"
[[ -f "$entitlements" ]] || fail '缺少应用签名配置，请重新下载完整包。'
if [[ -f "$bundle/Contents/Resources/app/SHA256SUMS.txt" ]]; then
  (cd "$bundle/Contents/Resources/app" && /usr/bin/shasum -a 256 -c SHA256SUMS.txt > /dev/null) || fail '应用源码校验失败，请重新下载。'
fi
# Collect before signing: signing a bundle's main executable can also seal its
# container, so no parent executable may run ahead of unsigned nested code.
targets=()
depths=()
count=0
add_target() {
  targets[$count]="$1"
  local separators="${1//[^\/]/}"
  depths[$count]=${#separators}
  count=$((count + 1))
}
while IFS= read -r -d '' binary; do
  kind=$(/usr/bin/file -b "$binary")
  if [[ "$kind" == Mach-O* ]]; then add_target "$binary"; fi
done < <(/usr/bin/find "$bundle/Contents" -type f -print0)
while IFS= read -r -d '' nested; do
  add_target "$nested"
done < <(/usr/bin/find "$bundle/Contents" -depth -type d \( -name '*.app' -o -name '*.framework' \) -print0)
add_target "$bundle"
# Bash 3.2 arrays preserve spaces and Unicode without relying on sort -z.
# Deeper paths precede containers; longer peers place nested bundle roots before
# the outer Contents/MacOS executable at the same depth.
for ((index = 1; index < count; index++)); do
  target="${targets[$index]}"
  depth="${depths[$index]}"
  position=$((index - 1))
  while ((position >= 0)); do
    if ((depths[position] > depth || (depths[position] == depth && ${#targets[position]} >= ${#target}))); then break; fi
    targets[$((position + 1))]="${targets[$position]}"
    depths[$((position + 1))]="${depths[$position]}"
    position=$((position - 1))
  done
  targets[$((position + 1))]="$target"
  depths[$((position + 1))]="$depth"
done
for ((index = 0; index < count; index++)); do
  target="${targets[$index]}"
  if [[ "$target" == *.app || "$target" == */Contents/MacOS/* ]]; then
    /usr/bin/codesign --force --sign - --timestamp=none --entitlements "$entitlements" "$target"
  else
    /usr/bin/codesign --force --sign - --timestamp=none "$target"
  fi
done
/usr/bin/codesign --verify --deep --strict --verbose=2 "$bundle"
printf '\nControl Resonant 本地签名已生成并通过结构校验。\n'
