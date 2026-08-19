# deepseek-aix

[English](README.md) | 中文

<img src="assets/deepseek-aix.png" width="220" alt="deepseek-aix" />

**deepseek-aix** 是一个面向科学研究的 AI 文献助手：用对话描述研究主题，agent 通过内置的多源文献检索服务（PubMed、arXiv、Semantic Scholar、Crossref 等）帮你搜集相关文献，并把结果整理成可折叠、可收藏的文献卡片。

deepseek-aix 以 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 为底座 fork 而来：保留其完整的 agent 基础设施（会话、工具、子代理、工作流、沙箱代码执行、Web GUI），并在此基础上新增文献能力 —— 多源文献检索服务、带分类文件夹的持久化收藏、皮肤中心、右侧面板，以及把检索结果和收藏渲染为卡片的一等公民 Web UI。

## 功能

### 文献检索

- **对话式文献检索**：新建会话即默认进入 deepseek-aix 科研助手模式，用自然语言（中英文均可）描述研究主题，agent 会自动检索、去重、排序。
- **多源检索**：通过内置 MCP 服务并行检索 PubMed、Europe PMC、bioRxiv/medRxiv、Crossref、OpenAlex、Semantic Scholar、arXiv 七个数据源。
- **自动去重与多轮合并**：同一会话内多轮检索结果自动去重融合。
- **对话内论文卡片**：每次检索结果渲染为卡片，包含作者、年份、期刊、摘要和 DOI/PMID/arXiv 标识。
- **全文获取**：支持开放获取子集的全文检索与精读。
- **右侧文献面板**：每轮对话结束后自动展开，汇总当前会话所有搜集到的文献。

### 文献收藏

- **带文件夹的收藏**：跨会话把论文收藏进持久的个人收藏夹，在侧边栏中按分类文件夹管理。
- **跨会话持久化**：收藏存储在服务端（`$DSH_HOME/storages/literature_favorites.json`），跨会话、跨浏览器保留。
- **文件夹管理**：新建、重命名、删除分类文件夹，在文件夹之间移动文献。
- **Agent 工具**：agent 也可通过 `literature_favorites_add/remove/list/folder_create/folder_rename/folder_delete/move` 工具读写收藏。

### 皮肤中心

- **多主题皮肤**：内置 blue-fantasy、dragon-heir、harbor、miku、minecraft、qq98、ths、trading、whale-song、xp、home 等多种 UI 皮肤。
- **实时预览**：应用前可预览皮肤效果，一键切换。
- **可扩展**：新皮肤可通过插件方式安装。

### 右侧面板（Aionui 面板）

- **文件浏览器**：浏览工作区目录树，支持文件名搜索。
- **多标签预览**：在多个标签页中预览文件（Markdown、图片、代码等）。
- **拖拽输入**：从文件浏览器直接拖拽文件到对话输入框。
- **工作区门控**：尊重当前工作区根目录。

### 文件 @ 引用

- **文件引用**：在输入框中输入 `@` 可引用工作区中的文件。
- **内联文件芯片**：选中的文件以芯片形式显示在输入区域。

### 底层框架能力

- **工作区与文件管理**：完整的文件系统访问，带沙箱权限控制。
- **沙箱代码执行**：bash 和 PowerShell，带权限审批。
- **子代理与并行研究**：派生子代理进行多任务并行研究。
- **Goal 目标自动续跑**：自主推进目标进度。
- **计划模式与任务拆解**：结构化规划与执行。
- **持久会话、回放与多模型配置**：历史对话持久化，灵活的模型选择。
- **插件化架构**：一切皆插件，由 [Cordis](https://github.com/cordiverse/cordis) 驱动。

## 快速开始

### 环境要求

- Node.js ≥ 22
- pnpm
- 受支持 LLM 提供方的 API Key（见下文的 [API Key](#api-key)）

### 从源码运行

仓库用了一个 git 子模块来内置 literature-search MCP 服务；请用 `--recurse-submodules` 克隆（或在普通克隆后执行 `git submodule update --init`）。

```sh
git clone --recurse-submodules https://github.com/PHoenixs57/deepseek-aix.git
cd deepseek-aix
pnpm install
pnpm run build
pnpm dsh web --patch dev.cordis.yml
```

打开 `http://127.0.0.1:3090`，新建会话，试试：

> "帮我搜集 IL-6 信号通路在类风湿关节炎中的最新文献，3 篇即可。"

### API Key

为你的 provider 的凭证引用配置 Key，可以是环境变量，也可以写入 `~/.dsh/.credentials.yaml`（纯 YAML 映射，每行一个 `KEY: value`）。环境变量优先于文件。

- `DEEPSEEK_API_KEY` —— 默认的 `deepseek-official` provider。
- `JIYUAN_API_KEY` —— 内置 `llm-pi-ai` 路由使用的 `jiyuan` provider；如需选用，在 `~/.dsh/settings.yaml` 中添加 `llm-pi-ai` 配置段。

### Windows

```powershell
git clone --recurse-submodules https://github.com/PHoenixs57/deepseek-aix.git
cd deepseek-aix
pnpm install
pnpm run build
$env:DEEPSEEK_API_KEY = "sk-..."    # 或写入 ~/.dsh/.credentials.yaml
pnpm dsh web --patch dev.cordis.yml
```

- Web 应用会自动选择 Windows 的 shell 栈：使用基于 ConPTY 的 PowerShell 而非 bash，并启用 Windows ACL 沙箱。
- `node-pty` 在首次 `pnpm install` 时会从源码编译；Windows 上需要 Visual Studio Build Tools（MSVC）。其余部分均为跨平台 Node.js。

### 开发迭代

客户端插件热更新：

```sh
pnpm run dev:web
pnpm dsh web --patch dev.cordis.yml
```

## 架构

```
aixlab/
├── apps/cli/config/agent-presets/aixlab/   # Production "deepseek-aix" preset
│   ├── preset.yml
│   ├── agent.cordis.yml
│   └── skills/literature-search/
├── presets/aixlab/                         # Same content for customization
├── mcp/literature-search-mcp/              # Multi-source literature search MCP (stdio)
├── packages/
│   ├── literature/literature-favorites/    # Host plugin: favorites tools + panel
│   ├── literature/literature-attachments/  # Full-text retrieval service
│   ├── client/ui-literature/               # Client plugin: paper cards + favorites panel
│   ├── client/ui-aionui-panel/             # Right-side panel: explorer + preview + drag
│   ├── client/ui-skin-center/              # Skin management center
│   ├── client/ui-skin-*/                   # Individual theme skins
│   └── client/ui-sidebar/                  # Modified: sidebar.favorites slot
├── packages/api/remotes/                   # literatureFavorites Remote registration
├── packages/bundle/web-app/                # Web app bundle with all integrations
└── dev.cordis.yml                          # Development overlay (port 3090)
```

## 模式与功能

| 功能 | 文献搜索模式 | 科研模式 |
|---|---|---|
| 对话式研究主题描述（中英文） | ✓ | ✓ |
| 多源文献检索（PubMed、Europe PMC、bioRxiv/medRxiv、Crossref、OpenAlex、Semantic Scholar、arXiv） | ✓ | — |
| 自动去重与多轮结果合并 | ✓ | — |
| 文献卡片（作者、年份、期刊、摘要、DOI/PMID/arXiv、开放获取标记） | ✓ | — |
| 收藏与分类文件夹（跨会话持久化） | ✓ | — |
| 全文获取（开放获取子集） | ✓ | — |
| 皮肤中心（多主题切换） | ✓ | ✓ |
| 右侧面板（文件浏览器、预览、拖拽输入） | ✓ | ✓ |
| 文件 @ 引用 | ✓ | ✓ |
| 工作区与文件管理 | ✓ | ✓ |
| 沙箱代码执行（bash / PowerShell） | ✓ | ✓ |
| 子代理与并行研究 | ✓ | ✓ |
| Goal 目标自动续跑 | ✓ | ✓ |
| 计划模式与任务拆解 | ✓ | ✓ |
| 持久会话、回放与多模型配置 | ✓ | ✓ |

## 配置

- **MCP 服务位置**：默认使用 `<仓库根目录>/mcp/literature-search-mcp/dist/server.js`（相对于执行 `pnpm dsh` 的目录）；由 `pnpm run build` 构建。可通过环境变量 `AIXLAB_MCP_SERVER` 覆盖。
- **MCP 工作目录**：通过 `AIXLAB_MCP_DIR` 环境变量覆盖。
- **默认预设**：`agent-presets.default: aixlab` 配置在 `~/.dsh/settings.yaml` 中（内置预设位于 `apps/cli/config/agent-presets/aixlab/`）；可改为 standard 使用普通预设。
- **端口**：`dev.cordis.yml` 使用 3090 端口，冲突时可修改。

## 测试

```sh
# Literature favorites service
pnpm exec vitest run packages/literature/literature-favorites/tests/literature-favorites.spec.ts

# Paper card model (client)
pnpm exec vitest run packages/client/ui-literature/tests/paper-model.client.spec.ts

# GUI end-to-end smoke test (requires running server on 3090; playwright chromium)
node scripts/e2e-smoke.mjs
```

如需从仓库源码运行（同[快速开始](#快速开始)，build 已包含内置 MCP 服务）：

```sh
git clone --recurse-submodules https://github.com/PHoenixs57/deepseek-aix.git
cd deepseek-aix
pnpm install
pnpm run build
pnpm dsh web --patch dev.cordis.yml
```

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/PHoenixs57/deepseek-aix/discussions) 提交反馈或 bug 报告。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
