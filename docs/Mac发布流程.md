# 在 GitHub 生成原生 Mac 分发包

本项目代码使用 GPT-6 Astra 生成，部分素材使用 image 生成。代码采用 MIT，原创文档及明确列出的原创素材采用 CC BY 4.0，第三方资源保留各自署名与许可。

**取包原则：** 原生 ZIP / DMG 只从对应架构全部检查成功的 Actions 运行中获取。本轮已有原生验证记录，具体以所选运行的提交号、任务结果、报告和截图为准。此前提供的 `-setup.zip` 是 Windows 交叉准备包，与原生分发包不同。

## 1. 先提交完整最新源码

打开 [项目仓库](https://github.com/Huajijiangqwq/CONTROL-Resonant-Bilibili-Livestream-Theme)。**先确认目标分支包含完整最新 1.0.1 源码，再启动工作流**，不要只上传 `.github/workflows/macos.yml`；只改版本号也不会带入启动与签名修复。

1. 使用本轮完整源码 ZIP 或单独准备的 Git 提交候选，核对仓库地址正确。不要用整目录覆盖已有未提交修改的本地仓库；使用独立副本检查更清楚。
2. 确认提交同时包含 `package.json` 的 `1.0.1`、`desktop/main.js`、`desktop/app-protocol.js`、相关启动修复、`scripts/build-mac.py`、`scripts/smoke-mac.js` 和 `.github/workflows/macos.yml`。这些只是核对点，仍应提交整份源码更新。
3. 在 GitHub Desktop 查看 Changes，填写提交说明，提交到 `main` 后点击 **Push origin**；使用其他 Git 客户端时，完成等效的提交和推送。
4. 回到 GitHub 的 **Code → main**，确认最新提交已出现，`package.json` 为 1.0.1，并能打开上述新增文件。若还显示 1.0.0，先完成源码更新。

如果使用独立候选分支，例如 `codex/mac-native-dmg`，先在 GitHub Desktop 核对改动并推送该分支，再在下一步选择同一分支。记录对应提交号，避免把旧提交的通过结果当作新提交的结果；检查通过后再决定是否合并到 `main`。

## 2. 手动运行两种架构

1. 登录有仓库写入权限的 GitHub 账户，进入仓库的 **Actions**。
2. 左侧选择 **Build macOS**。
3. 点击 **Run workflow**，Branch 选择包含完整最新源码的 **main**（或已推送的候选分支），再点击绿色 **Run workflow**。
4. 打开新出现的运行记录，核对提交号是刚刚更新的源码。
5. 查看两个任务：**Native macOS arm64** 与 **Native macOS x64**。分别使用 `macos-15` 和 `macos-15-intel`。

如果看不到 **Run workflow**，先确认完整工作流已经在默认分支、已登录且拥有写入权限；该工作流使用手动触发配置。[GitHub 手动运行说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 3. 看检查结果，再下载

每个架构会依次检查源码与测试、构建原生 ZIP / DMG、校验临时签名与磁盘映像，然后用 `scripts/smoke-mac.js` 启动实际打包的应用，检查 GUI 和本地服务，并记录截图。

**只有该架构全部检查通过，才会执行分发包上传。** 同时提供两种架构前，应确认两个任务都成功；失败任务中的报错和诊断文件用于排查，不能替代通过结果。

回到本次运行的 Summary，下滚到 **Artifacts**。下载需要登录并具有仓库读取权限。[GitHub 产物下载说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui)

| Artifact 名称 | 用途 |
| --- | --- |
| `ControlResonant-mac-arm64` | Apple 芯片分发文件；含原生 ZIP、DMG 与 SHA-256 清单。 |
| `ControlResonant-mac-x64` | Intel 分发文件；含原生 ZIP、DMG 与 SHA-256 清单。 |
| `Mac-verification-arm64` | Apple 芯片检查报告、截图或已生成的诊断文件；不是安装包。 |
| `Mac-verification-x64` | Intel 检查报告、截图或已生成的诊断文件；不是安装包。 |

GitHub 下载的是外层 Artifact ZIP，先解压，再取出其中的 `ControlResonant-1.0.1-mac-arm64.dmg` 或对应 x64 文件。分发 ZIP 文件名不带 `-setup`；原有交叉准备包带这个后缀。

当前工作流的分发 Artifact 保留 30 天，诊断 Artifact 保留 14 天。检查失败时会尝试上传诊断目录；若失败发生在诊断文件产生前，可能没有诊断 Artifact，此时查看失败步骤日志。

## 4. 使用与发布

Mac mini M4 和其他 Apple 芯片机器选择 arm64，Intel 机器选择 x64。获得实际检查成功的 DMG 后，打开映像，将 `Control Resonant.app` 拖到 Applications，再从“应用程序”打开。ZIP 也包含同版本 app，可按随包说明使用。

这些原生包使用 **ad-hoc 临时签名**，不是 Apple Developer ID 签名或公证，系统仍可能提示无法验证开发者。CI 的窗口与服务检查只证明该次 runner 的启动路径通过，不代表已验证用户的 Music / Spotify、系统音频权限或 OBS。实际问题请附芯片、系统、版本、错误窗口及 `desktop.log` 的相关启动记录。

工作流不自动创建 GitHub Release。需要公开发布时，先核对对应任务成功及 SHA-256，再将解压得到的实际 DMG / ZIP 与校验清单作为 Release 附件；不要将诊断 Artifact 当作安装包上传。
