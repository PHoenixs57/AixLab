# deepseek-aix — 科研文献助手

deepseek-aix 是一个面向科学研究的 AI 助手产品：用**对话**描述研究主题，agent 通过内置的多源文献检索服务搜集文献，并把结果渲染成**可折叠、可收藏的文献卡片**。

deepseek-aix 以 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 为底座 fork 而来：保留其完整的 agent 基础设施（会话、工具、子代理、工作流、Web GUI），品牌替换为 deepseek-aix，并新增文献能力。

## 功能

- **文献 agent 对话**：新建会话即默认进入「deepseek-aix 文献助手」模式（也可从预设菜单切换），用自然语言（中英文均可）描述研究主题。
- **多源检索**：通过 [literature-search-mcp](mcp/literature-search-mcp)（stdio MCP）并行检索 PubMed、Europe PMC、bioRxiv/medRxiv、Crossref、OpenAlex、Semantic Scholar、arXiv，自动去重融合。工具：`mcp__literature__literature_search` / `_sources` / `_get_fulltext`。
- **文献卡片**：对话结束后，网页**右侧**自动展开「本次对话文献」窗口，把本次对话搜集到的所有文献（多轮检索自动去重合并）列成卡片——标题、作者、年份、期刊、DOI/PMID/arXiv 链接、开放获取标记、可折叠摘要。聊天里的检索工具行只保留摘要（"N 篇文献 + 查看卡片"按钮），不再内嵌卡片。
- **收藏（文件夹分类）**：右侧卡片上的星标一键收藏；点星标会弹出「收藏到分类」窗口，可把文献存进已有的分类文件夹或现场新建一个（不选则进「未分类」）。侧栏「文献收藏」是一个**扁平文件管理器**：按「全部 / 未分类 / 各分类文件夹」浏览，可新建、重命名、删除分类（删除时其中文献自动移回未分类，不丢文献），每篇文献可经「移动到分类」换文件夹；收藏持久化在服务端（`$DSH_HOME/storages/literature_favorites.json`），跨会话、跨浏览器保留，agent 也能读写（`literature_favorites_add/remove/list/folder_create/folder_rename/folder_delete/move` 工具，`add`/`move` 可带 `folder` 分类名，不存在时自动创建）。右侧「本次对话文献」窗口同样支持折叠。
- 其他 DeepSeek Harness 能力（工作区、代码执行、子代理、goal 自动续跑等）全部保留。

## 快速开始

环境要求：Node ≥ 22、pnpm、DeepSeek API Key（沿用 `~/.dsh` 环境配置，与 DeepSeek Harness 相同）。

```bash
cd /path/to/aixlab
pnpm install                    # 首次安装依赖
pnpm run build:lib              # 构建宿主库 + 客户端插件 bundle
pnpm run build:web              # 构建 Web 前端（Vite shell）

# 启动（端口 3090，避开默认 3080）：
pnpm dsh web --patch dev.cordis.yml
```

打开 `http://127.0.0.1:3090` → 新建会话（默认就是「deepseek-aix 文献助手」）→ 例如输入：

> 帮我搜集 IL-6 信号通路在类风湿关节炎中的最新文献，3 篇即可。

开发迭代（客户端插件热更新）：

```bash
pnpm run dev:web               # 监听重建所有客户端插件包
pnpm dsh web --patch dev.cordis.yml
```

## 架构

```
aixlab/
├── apps/cli/config/agent-presets/aixlab/   # 随产品发布的「deepseek-aix 文献助手」预设
│   ├── preset.yml                          #   模式名与描述
│   ├── agent.cordis.yml                    #   文献人设 + 工具组装 + 计划模式 + 压缩策略
│   └── skills/literature-search/           #   文献检索方法论技能（随预设发布）
├── presets/aixlab/                         # 同内容副本（供个人定制/另装他用）
├── mcp/literature-search-mcp/              # 多源文献检索 MCP 服务（stdio）
├── packages/
│   ├── literature/literature-favorites/    # 宿主插件：收藏工具 + 收藏面板 Remote
│   ├── client/ui-literature/               # 客户端插件：文献卡片 + 收藏面板
│   └── client/ui-sidebar/                  # 改动：新增 sidebar.favorites 槽位
├── packages/api/remotes/                   # 改动：注册 literatureFavorites Remote 贡献
├── packages/bundle/web-app/cordis.patch.yml  # 宿主行（mcp + favorites）+ roster 行 + 默认预设
├── apps/web/                               # 品牌：title / manifest / favicon / logo（deepseek-aix）
├── scripts/e2e-smoke.mjs                   # GUI 端到端冒烟脚本（Playwright）
└── dev.cordis.yml                          # 开发端口 overlay（3090）
```

数据流：

1. 用户在 Web GUI 对话 → agent 调用 `mcp__literature__literature_search`（宿主层 mcp-client 行挂载的 stdio MCP，所有会话可见；预设贡献人设与技能）。
2. MCP 服务返回 JSON（`SearchResponse{results: LiteratureResult[]}`），结果文本写入会话事件流。
3. 客户端 `ui-literature` 分两处消费这些结果：
   - **右侧文献窗口**（`conversation.details.literature` 槽位）：从当前会话快照聚合所有 `literature_search` 结果（去重），渲染卡片列表；对话轮次结束后自动展开右侧列。
   - **聊天工具行**（keyed toolview）：检索行只显示摘要 + 「查看卡片」按钮；全文/来源行保留行内折叠视图。
4. 收藏星标/文件夹操作 → 客户端经 Typert Remote（`literatureFavorites` 命名空间，`add` / `delete` / `move` / `folderCreate` / `folderRename` / `folderDelete` / `list`）调用宿主 `literature-favorites` 服务 → 写入 storage-domain 的 `literature_favorites` 域（`$DSH_HOME/storages/literature_favorites.json`，旧版无分类数据读入时自动归一化）→ 侧栏收藏面板即时同步。

**为什么 MCP 与收藏服务放在宿主层而不是预设里**：预设挂载的审计会拒绝把 Service 发布进根域的预设行，且预设子树里的工具注册不会进入 agent 的请求目录；文献工具是本产品的核心能力，属于宿主组成。

## 配置

- **MCP 位置**：宿主行默认使用本仓库 `mcp/literature-search-mcp/dist/server.js`；可用环境变量覆盖：
  - `AIXLAB_MCP_SERVER`：server.js 的绝对路径
  - `AIXLAB_MCP_DIR`：MCP 工作目录（如更换机器路径）
- **默认预设**：`packages/bundle/web-app/cordis.patch.yml` 中 `agent-presets.default: aixlab`；用户可在设置里改回 standard。
- **LLM 提供商 / 模型**：在 GUI 的设置中配置（与 DeepSeek Harness 一致）。
- **端口**：`dev.cordis.yml` 固定 3090；冲突时改为其他端口即可。

## 测试

```bash
# 收藏服务（宿主）：增删查、去重、持久化、工具注册
pnpm exec vitest run packages/literature/literature-favorites/tests/literature-favorites.spec.ts
# 卡片解析模型（客户端）：真实 MCP 输出形状、容错、回落
pnpm exec vitest run packages/client/ui-literature/tests/paper-model.client.spec.ts
# GUI 端到端冒烟（需先启动 3090 服务；需 playwright chromium）
node scripts/e2e-smoke.mjs
```

## 扩展方向（路线图）

- BibTeX / RIS 导出（`literature_favorites_export` 工具）
- 检索历史与"找相似文献"（基于 Semantic Scholar 引用/推荐）
- 多用户部署（当前为单用户本地产品，Harness 底座即单用户架构）
- 收藏按主题分文件夹/标签

## 与上游的关系

本仓库是 DeepSeek Harness 的 fork：npm 包名（`@deepseek-ai/*`）与内部协议保持不变（便于跟进上游），只替换了用户可见品牌（标题、logo、系统提示、引导文案）。跟进上游时 `git merge` 后重点检查 `packages/bundle/web-app/cordis.patch.yml`、`packages/client/ui-sidebar/`、`packages/api/remotes/` 与新插件的冲突。
