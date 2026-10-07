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
# Signing inside out avoids --deep signing's implicit entitlement inheritance.
while IFS= read -r -d '' binary; do
  kind=$(/usr/bin/file -b "$binary")
  if [[ "$kind" == Mach-O* ]]; then
    if [[ "$binary" == */Contents/MacOS/* ]]; then
      /usr/bin/codesign --force --sign - --timestamp=none --entitlements "$entitlements" "$binary"
    else
      /usr/bin/codesign --force --sign - --timestamp=none "$binary"
    fi
  fi
done < <(/usr/bin/find "$bundle/Contents" -type f -print0)
while IFS= read -r -d '' nested; do
  if [[ "$nested" == *.app ]]; then
    /usr/bin/codesign --force --sign - --timestamp=none --entitlements "$entitlements" "$nested"
  else
    /usr/bin/codesign --force --sign - --timestamp=none "$nested"
  fi
done < <(/usr/bin/find "$bundle/Contents" -depth -type d \( -name '*.app' -o -name '*.framework' \) -print0)
/usr/bin/codesign --force --sign - --timestamp=none --entitlements "$entitlements" "$bundle"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$bundle"
printf '\nControl Resonant 本地签名已生成并通过结构校验。\n'
