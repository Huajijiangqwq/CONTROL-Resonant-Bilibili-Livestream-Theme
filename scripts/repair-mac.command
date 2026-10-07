#!/bin/bash
set -euo pipefail
finish() {
  result=$?
  if [[ $result -ne 0 ]]; then printf '\n修复未完成，请将上方错误发给开发者。\n'; fi
  printf '\n按回车关闭窗口。'; read -r _ || true
  exit "$result"
}
trap finish EXIT
[[ "$(uname -s)" == Darwin ]] || { printf '请在 Mac 上运行。\n'; exit 1; }
here="$(cd "$(dirname "$0")" && pwd -P)"
bundle="${1:-$here/Control Resonant.app}"
if [[ ! -d "$bundle" ]]; then
  if [[ -d '/Applications/Control Resonant.app' ]]; then bundle='/Applications/Control Resonant.app';
  else
    printf '请将本脚本和 prepare-mac.sh 放在 Control Resonant.app 旁边，再运行。\n'
    exit 1
  fi
fi
printf '将为以下应用生成本机临时签名，并移除这个应用的下载隔离标记：\n%s\n' "$bundle"
printf '请先退出 Control Resonant。仅在确认此包来自你信任的项目下载时继续。\n'
printf '这不是 Apple 开发者签名或公证，不会修改系统整体保护设置。\n'
printf '输入 YES 继续，其他输入取消：'
read -r answer
[[ "$answer" == YES ]] || exit 0
/bin/bash "$here/prepare-mac.sh" "$bundle"
# Scoped to the verified app selected above, never a parent folder or system setting.
/usr/bin/xattr -dr com.apple.quarantine "$bundle"
/usr/bin/open "$bundle"
printf '\n已请求打开应用；启动、音频和 OBS 功能仍需在本机检查。\n'
