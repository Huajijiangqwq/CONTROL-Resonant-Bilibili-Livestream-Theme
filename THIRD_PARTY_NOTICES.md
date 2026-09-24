# 第三方来源与许可

原创代码使用根目录 MIT；原创文档与自绘素材使用 CC BY 4.0；下列代码、字体或参考来源按各自许可保留声明。

| 来源 | 使用情况 | 版本 / 许可 |
| --- | --- | --- |
| [fft.js](https://github.com/indutny/fft.js/tree/v4.0.4) | `app/now-playing-fft.js`，实际随包使用的 FFT 实现 | 4.0.4，MIT，[全文](licenses/fft.js-MIT.txt) |
| [psrdnoise](https://github.com/stegu/psrdnoise/blob/main/src/psrdnoise2.glsl) | 信号 / 流纹 shader 中改编的非周期二维噪声；保留源文件头 | 源版本 2021-12-02，MIT，[全文](licenses/psrdnoise-MIT.txt) |
| [xfgryujk/blivedm](https://github.com/xfgryujk/blivedm/tree/3bf17fe862b8c2fc6bc04c81c3f0c5db95de93d6) | Bilibili 网页消息协议、WBI 混排表、字段参考，JS 接入实现位于 `bilibili-protocol.js` | 提交 3bf17fe8，MIT，[声明](licenses/blivedm-MIT.txt) |
| [Windows classic samples](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback) | WASAPI Application Loopback API 参考；本项目 C# 互操作实现，不打包微软二进制文件 | MIT，[声明](licenses/Microsoft-samples-MIT.txt) |

## 字体

字体随包本地加载，许可文本与字体一起放在 `app/now-playing-fonts/`。来源列表：[字体来源](app/now-playing-fonts/字体来源.md)。

- Anton
- Roboto Condensed
- Noto Sans CJK SC Black
- Noto Sans Arabic
- Noto Sans Hebrew
- Noto Sans Devanagari
- Noto Sans Thai

以上采用 SIL Open Font License 1.1。字体转为 WOFF2，未刻意删减字符。CJK 使用 SC 地区字形；不保证每个汉字都有对应语言地区的专用字形。

## 外部服务与研究资料

[Widdit/now-playing-service](https://github.com/Widdit/now-playing-service) 是独立安装的歌曲信息服务；本包只调用本机接口，不包含它的程序或源码。OBS 通过自写的 websocket v5 桥接，不依赖 `obs-websocket-js`。Windows 音频捕获不依赖 NAudio。

audioMotion-analyzer、CAVA、MilkDrop / Butterchurn 等曾用于研究音频可视化，没有把它们的代码作为本包运行时依赖，不能把研究参考写成已集成的功能。

游戏美术和商标不适用本项目 MIT。具体替换及未分发的素材见 [素材与许可](docs/素材与许可.md)。

主题保留 CONTROL RESONANT 官方中英文 Logo（`app/live-logo-en.png` / `live-logo-zh.png`）及用户提供参考录像中的 FBC 标志画面（`app/fbc-reference-frame.png`）。原图权利属于 Remedy 等原权利方；项目不将这些文件标为原创、AI 生成或 CC BY 4.0 素材。[游戏官方页面](https://www.remedygames.com/games/control-2)。

## 桌面运行环境

- **Electron 44.4.3**：[官方项目](https://github.com/electron/electron)，MIT，许可副本在 `licenses/Electron-MIT.txt`。桌面二进制包保留官方 `LICENSE` 与 `LICENSES.chromium.html`，其中包含 Chromium、Node.js 及附带依赖的许可说明。
- 运行环境 ZIP 的 SHA-256 固定在构建脚本中，构建时验证后解压；源码包不嵌入 Electron 二进制。
- 桌面图标由本项目程序绘制，CC BY 4.0，并非 Control 官方 Logo。

## now-playing-service 与内置识别

**Widdit/now-playing-service v2.2.0**，MIT，Copyright (c) 2024 Widdit。核查提交 `2336c5fc6c57300bc7cf5fa85c7f273042bb86b1`。许可副本：`licenses/now-playing-service-MIT.txt`。

实际集成是本机 HTTP API 兼容。本包不捆绑上游二进制；音乐皮肤提供可选的官方 v2.2.0 安装器自动下载、SHA-256 校验和配置，下载后保留官方安装内容及原许可。界面标明原作者 Widdit、项目链接与 MIT。内置 Windows SMTC 适配器是本项目原创 MIT 代码，不是上游组件的重命名。详细边界、官方链接与安装包校验值见 [音乐集成](docs/音乐集成.md)。

## AI 与游戏中文文本

本项目代码使用 GPT-6 Astra 生成，部分素材使用 image 生成。AI 说明不替代本文件中的第三方版权署名。礼物物证图使用原有 image 生成素材；其余历史 image 视觉参考不随源码包分发。

少量游戏中文任务标题用于演示，版权仍属原权利方；来源与原文 / 模拟弹幕区分见 [中文预设与术语](docs/中文预设与术语.md)。

## 本机扫码登录

- 二维码编码使用 [Kazuhiko Arase / qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)，固定提交 `83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`，本地文件 `app/qr-code-generator.js`，MIT，见 [许可全文](licenses/qrcode-generator-MIT.txt)。不会调用第三方在线二维码生成服务。
- 登录流程由本项目实现，使用 Bilibili 网页二维码登录端点；新版跨域回调行为参考 [public-clis/bilibili-cli 的维护者修复说明](https://github.com/public-clis/bilibili-cli/pull/27)。没有打包该项目源码。网页接口不是直播开放平台的正式身份码 API，兼容性可能随平台变化。
- 暂未开放的身份码实验代码参考 [Bilibili 官方 OpenLive C# 示例](https://github.com/bilibili-openplatform/OpenLive_CSharpDemo) 的协议与字段，并未打包其源码。
