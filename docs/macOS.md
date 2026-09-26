# macOS 试用版 · Beta 1

本项目代码使用 GPT-6 Astra 生成，部分素材使用 image 生成。代码 MIT；原创文档与明确列出的原创素材 CC BY 4.0，第三方资源保留各自许可。

## 选择下载

- **Apple 芯片（M1 / M2 / M3 / M4 等）**：`ControlResonant-0.1.0-beta.1-mac-arm64.zip`
- **Intel Mac**：`ControlResonant-0.1.0-beta.1-mac-x64.zip`

目标系统为 **macOS 14.2 及以上**。在“关于本机”中查看芯片与系统版本。解压后将 **Control Resonant.app** 拖到“应用程序”，再打开。运行包包含 Electron，无需安装 Node.js 或 Python。

**当前 Mac 包由 Windows 交叉打包，尚未经过 Mac 实机启动、系统权限、音频或 OBS 联调验证。** 它保留了官方 Electron 的二进制、执行权限和框架符号链接；不是将 Windows EXE 改名。随包 `BUILD-INFO.json` 明确记录构建平台、架构和签名状态。

## 首次打开

本项目暂未购买 Apple Developer ID，也未经过 Apple 公证。如果 macOS 阻止打开，请先核对下载来源和 SHA-256，再使用“系统设置 → 隐私与安全性”中针对本应用的“仍要打开”。不要关闭系统整体安全保护。如果系统没有提供此选项，请暂用源码启动，并提交完整提示与系统版本。

1. 启动后进入“直播预览”。右侧顶部选择弹幕来源、扫码登录并连接房间。
2. 在 OBS 添加“浏览器”来源，粘贴客户端复制的地址，大小设为 1920 × 1080。游戏采集另放在主题下方。
3. 关闭主窗口只会隐藏窗口，本地服务继续运行。点击菜单栏倒三角图标可重新打开或完全退出；Command-Q 会退出并停止服务。
4. 登录密钥由 Electron safeStorage 通过 macOS 钥匙串保护，登录凭据以 AES-256-GCM 加密写入应用数据目录。钥匙串不可用时会禁用保存，不会退回明文保存。

## 音乐与音频

- **歌曲识别**：原生适配 Music 和 Spotify 的公开自动化接口，读取歌名、歌手、专辑与进度。请先启动播放器并播放歌曲。首次读取可能需要在“隐私与安全性 → 自动化”允许读取播放器。
- **封面**：Spotify 会尝试获取播放器提供的封面；Music 封面暂未适配，使用皮肤默认封面。这一限制不会影响歌名和进度显示。
- **系统音频**：点击页面的音频采集开关后，客户端尝试通过 Electron 的 macOS 系统音频接口传入实时 PCM，再交给现有频谱处理。首次使用需允许系统音频 / 屏幕与系统音频录制权限。权限改变后可能需要重新打开客户端。
- **采集范围**：目前是系统声音，未提供 Windows 版的按进程选择功能。采集接口附带的视频轨道只用于维持系统音频会话，不显示、不保存，也不发送给本地服务。
- **外部 Now Playing**：原作者 [Widdit](https://github.com/Widdit) 的 [now-playing-service](https://github.com/Widdit/now-playing-service) 仍保留署名与兼容接口。项目中的官方安装器自动下载功能仅用于 Windows，Mac 界面会隐藏该安装入口。

音乐识别不等于音频采集；应用不会自动开始 OBS 直播、录制或音频捕获。

## 从源码启动与构建

安装 Node.js 24+ 和 npm。执行 `npm install`，然后 `npm start`。Mac 不运行 `build:audio` 或 `.cmd` 启动脚本；系统采集由桌面客户端管理。

开发者打包还需要 Python 3：

```sh
npm run check
npm test
npm run build:mac -- --arch=arm64
npm run build:mac -- --arch=x64
```

构建脚本校验固定版本的官方 Electron 下载，并保留 ZIP 中 Unix 执行权限及框架符号链接。在 Mac 上构建会调用系统 codesign 生成临时签名并验证；临时签名不是 Apple Developer ID，也不代表公证完成。Windows 交叉构建保留原始 Mach-O 字节，不伪造已签名状态。

仓库包含可手动触发的 **Build macOS Beta** 工作流，分别在 Apple 芯片和 Intel macOS runner 上检查并打包。工作流产物供下载，不自动发布 Release。界面、权限弹窗、Music / Spotify、实际系统音频和 OBS 仍需要人工实测。

## 【实验功能】编辑器

主题编辑器与弹幕编辑器处于极早版本，存在诸多 bug 和问题。日常使用直播主题无需经过编辑器。自定义前请导出 JSON 备份，操作说明见《使用说明》最后的实验功能部分。
