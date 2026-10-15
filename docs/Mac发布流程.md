# 在 GitHub 构建和发布 Mac 客户端

本项目代码使用 GPT-6 Astra 生成，部分素材使用 image 生成。代码采用 MIT，原创文档及明确列出的原创素材采用 CC BY 4.0，第三方资源保留各自署名与许可。

## 1. 准备目标版本源码

1. 在 [项目仓库](https://github.com/Huajijiangqwq/CONTROL-Resonant-Bilibili-Livestream-Theme) 选择用于发布的分支。当前版本为 **1.0.2**，以该分支 `package.json` 为准。
2. 提交并推送完整变更，包括桌面启动代码、`scripts/build-mac.py`、`scripts/prepare-mac.sh`、`scripts/smoke-mac.js` 和 `.github/workflows/macos.yml`；不要只修改版本号或只上传工作流。
3. 确认 GitHub 上的文件及提交号与准备发布的源码一致。可以先使用独立候选分支验证，检查通过后再按项目流程合并。

## 2. 运行原生构建

1. 打开仓库 **Actions → Build macOS → Run workflow**。
2. Branch 选择刚推送的分支，启动后核对运行记录中的提交号。
3. 等待 **Native macOS arm64** 与 **Native macOS x64** 两个任务完成，分别在 `macos-15` 和 `macos-15-intel` 上运行。

如果没有 Run workflow 按钮，检查是否已登录、是否拥有写入权限，以及默认分支是否包含工作流。也可使用 GitHub CLI，在 `--ref` 中填写已推送的目标分支：

```sh
gh workflow run macos.yml --ref <目标分支>
```

## 3. 检查结果并取包

每个架构依次进行源码检查、测试、原生 ZIP / DMG 构建、临时签名与磁盘映像校验，然后启动打包后的应用，验证窗口、本地服务和钥匙串初始化。

**只发布对应架构全部步骤成功的分发文件。** 若两种架构一起发布，两个任务均须成功。报告中的版本、架构与运行提交号应与发布包对应。

在运行记录底部 **Artifacts** 下载：

| 附件名称 | 内容 |
| --- | --- |
| `ControlResonant-mac-arm64` | Apple 芯片 ZIP、DMG 与 SHA-256 清单 |
| `ControlResonant-mac-x64` | Intel ZIP、DMG 与 SHA-256 清单 |
| `Mac-verification-arm64` / `Mac-verification-x64` | 检查报告、截图和诊断日志，不是安装包 |

下载结果是外层 ZIP，解压后取出实际安装文件。当前文件名如 `ControlResonant-1.0.2-mac-arm64.dmg`。原生安装包无需分发首次修复脚本。

分发附件保留 **30 天**，诊断附件保留 **14 天**。下载需要登录 GitHub；失败任务可能只生成诊断附件，甚至尚未生成报告，此时查看步骤日志。请及时保存成功的分发包，避免把限时 Actions 附件作为长期下载地址。

## 4. 发布到 Releases

工作流不会自动创建 GitHub Release。正式发布前：

1. 核对目标版本、源码提交、两个架构的通过结果和安装文件 SHA-256。
2. 在正确提交上创建版本标签及 Release，附上实际 DMG / ZIP、Windows 包、源码和校验清单。
3. 发布说明注明 Apple 芯片选 arm64、Intel 选 x64，以及实际验证范围。不要将 `Mac-verification-*` 诊断附件当作安装包。
4. 用公开下载的文件再次核对校验值，并检查 README 的版本和下载入口。

Mac 用户打开 DMG 后，将 `Control Resonant.app` 拖入 Applications，再从“应用程序”启动。

原生包使用 **ad-hoc 临时签名**，尚未完成 Apple Developer ID 签名与公证。云端启动检查不替代用户设备上的 Music / Spotify、系统音频权限、游戏采集及 OBS 验证。反馈时附芯片、系统、版本、错误提示与脱敏后的启动日志。
