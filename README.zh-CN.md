# LingoLeaf · 语叶

[English](README.md) | **简体中文**

**把日常遇到的句子，变成长期掌握的语言能力。**

一个为 Windows 设计的英语学习伴侣。选中一句话，用快捷键纠错或翻译，把日常遇到的表达变成自己的学习积累。

## 日常怎么用

1. 打开「偏好设置」，选择 OpenAI、OpenAI 兼容接口、Anthropic、Azure OpenAI 或 Ollama，填写地址、模型和密钥，点击测试并保存。
2. 在其他应用选中文字，按 **Ctrl + Shift + G**。弹窗显示语法判断、具体错误片段、规则解释和新例句。表达建议与语法错误分开标明。
3. 按 **Ctrl + Shift + T**，将选中文字译成设置中的目标语言。默认在可验证的可编辑选区自动替换；原窗口、选区已改变时取消替换，可以在结果中复制译文。快捷键可修改。
4. 在「学习库」搜索句子，在「复习」先回忆、再揭晓答案，按记忆程度安排下一次复习。
5. 在「手机同步」启动连接，用手机扫描二维码。手机与电脑连接同一个可信网络时，复习进度直接保存到桌面。

关闭窗口会收起到系统托盘；右键托盘图标可完全退出。只有触发快捷键或点击分析时才读取并处理输入，不监听日常键入。

## 获取与开发

当前版本：**v0.2.0 预览版**。从 [Releases](https://github.com/liuxuan1-1/LingoLeaf/releases) 下载 Windows x64 免安装程序，启动后先配置自己的模型接口。

[![Windows checks](https://github.com/liuxuan1-1/LingoLeaf/actions/workflows/ci.yml/badge.svg)](https://github.com/liuxuan1-1/LingoLeaf/actions/workflows/ci.yml)

Windows 10 / 11，x64。原生桥使用系统自带的 Windows PowerShell 5.1、.NET Framework 和 UI Automation，无需另装 .NET SDK。桌面框架为 Electron，界面为 React + TypeScript。

从源码开发需安装 Node.js 22 或更新版本：

```powershell
npm ci
npm run dev
```

构建、测试和生成免安装版：

```powershell
npm test
npm run build
npm run package
```

生成的 Windows 可执行文件在 `release/`。目前构建不包含代码签名。发布前应自行签名，并在目标 Windows 环境检查安全提示。不要提交运行数据或密钥。

## 外观与阅读

在「偏好设置」最上方的「外观与阅读」中选择 **松林米白、晴空蓝白、雾紫、午夜深色**，或让明暗主题跟随 Windows 系统。主题覆盖主界面、表单、学习卡片、应用内对话框和划词结果弹窗。

文字提供 **标准 / 大号 / 特大** 三档，正文基准分别为 16 / 18 / 20px，默认大号。说明、标签和按钮使用各自的易读字号；窗口较小时会重新排列并滚动，避免放大文字后挤掉操作按钮。

点击后即时生效并独立保存，不需要点击模型设置的「保存设置」，也不会提交或覆盖尚未保存的接口修改。已打开的划词弹窗会跟随更新，重新打开应用仍保留选择。升级会保留原模型设置、密钥和学习库。

## 接口配置

| 服务 | 地址示例 | 模型栏 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | 有权访问的模型名 |
| OpenAI 兼容 | 服务商给出的 Base URL，例如 `https://example.com/v1` | 服务商模型名 |
| LM Studio（选择 OpenAI 兼容） | `http://127.0.0.1:1234/v1` | 本地已加载模型名 |
| Anthropic | `https://api.anthropic.com/v1` | 有权访问的 Claude 模型名 |
| Azure OpenAI | `https://YOUR-RESOURCE.openai.azure.com` | **部署名称**；API 版本可配置 |
| Ollama | `http://127.0.0.1:11434` | 已下载的模型名，例如 `qwen3:8b` |

OpenAI 和 OpenAI 兼容接口支持 **Chat Completions / Responses**，可在「请求协议」中选择「自动」或手动指定。服务商要求 Responses 时，选择 Responses 并填写 Base URL，也可直接填写以 `/responses` 结尾的完整接口地址，例如 `https://example.com/v1/responses`。Responses 支持 JSON 和 SSE 返回。

Anthropic 使用 Messages，Ollama 使用原生 `/api/chat`，Azure OpenAI 使用部署式 Chat Completions 接口。

模型必须能遵循 JSON 输出指令。填写所选服务要求的 API Key；无需认证的本地兼容接口或 Ollama 可以留空。模型权限和计费由用户自己的账户决定，软件没有内置共享 API Key。

远程 API 使用 HTTPS，本机环回地址可用 HTTP。自托管的远程服务请配置 HTTPS。API Key 由 Electron `safeStorage` 在 Windows 用户上下文加密保存，渲染界面读不到已保存的明文密钥，也不会写进 Markdown、移动页面或导出文件。

协议参考：[Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) · [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)。

## 学习库与手机

「偏好设置 → 学习笔记文件夹」可选择现有 Obsidian vault、OneDrive 等同步文件夹。应用创建：

```text
所选文件夹/
└─ LingoLeaf/
   ├─ index.md            # 按复习时间整理的学习索引
   └─ entries/
      └─ 日期-UUID.md     # 每句的原文、答案、解析、练习和个人批注
```

每条 Markdown 笔记创建后不覆盖，方便自己添加批注；索引由应用更新。电脑中的 `library.json` 是复习进度的权威来源。Markdown 文件夹同步供手机阅读和批注，**不会把 Markdown 修改自动导入复习进度**。手机扫码复习则直接写回同一桌面学习库，避免双端进度冲突。

扫码连接仅在你主动开启时运行；每次重新启动生成新的配对凭证，关闭连接立即撤销。连接为局域网 HTTP，请只在可信家庭网络使用。二维码代表访问学习库与提交复习的权限，请勿公开。首次启用如 Windows 防火墙询问，请自行决定是否允许专用网络访问。电脑必须保持运行；跨网离线阅读请使用你的文件同步工具。

学习采用透明的间隔复习：忘记后很快重试，记住后逐步延长间隔。它是辅助练习计划，不代表对记忆能力的精确测量。

## 能力边界

- 标准编辑框、记事本以及支持 UI Automation 选区的应用可进行安全替换。PDF、只读网页、自绘编辑器或部分终端可能只能提取 / 复制；权限更高的应用可能无法访问。
- 密码字段不读取。没有选区时不会把旧剪贴板误当成新选中的文字。
- 原生桥优先读取 UI Automation，必要时临时复制选区，尽力保留原剪贴板；遇到无法安全备份的特殊格式会拒绝该回退。结果不会跨应用盲目粘贴。
- LLM 仍可能理解错误。弹窗保留原句及解释，翻译自动替换可在设置中关闭；编辑器通常支持 Ctrl + Z 撤销粘贴。
- 未配置可用模型前，界面和学习库可启动，但真实翻译 / 纠错需要完成接口配置。

## 开源协作

MIT License。贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，架构见 [docs/architecture.md](docs/architecture.md)，验证范围见 [docs/verification.md](docs/verification.md)。
