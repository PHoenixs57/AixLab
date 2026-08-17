# @deepseek-ai/dsh-client-ui-aionui-panel

[English](README.md) | 中文

`dsh web` 的右侧面板系统，是 dsh-web-ui aionui-panel（AionUi Explorer + Preview，重新实现）的忠实 in-tree 移植。它是一个双面包：node 半区注册受工作区门控的文件系统服务与 `/aionui-panel/*` HTTP 路由，browser 半区挂载面板列。

node 半区（`src/index.ts`，`inject = ['webServer', 'workspaceRegistry']`）拥有一个 `FsService` 与这些路由：JSON `list` / `read` / `write` / `search` / `delete`、用于流式传输 pdf/markdown 图片字节的 `raw` 路由、以及在文件变更时推送 `{ kind: 'fs' }` 的 `events` SSE 流。每次操作都会过工作区门卫（`createWorkspaceGate`：根路径必须 realpath 到 `workspaceRegistry.list()` 的某个路径之内）与回环信任栅栏；服务拒绝 `.git` 路径并复检 symlink 逃逸。

browser 半区（`src/client/`，`dsh.client` 清单）保留原来自成一体的架构：`PanelLayoutController` 在 shell 框架上追加两列网格轨道（以 `data-dsh-frame` 为锚点），两个 React 根渲染进这些列。三个 store —— `layout`、`explorer`、`preview` —— 驱动带防抖文件名搜索的 Explorer 文件树、多 tab Preview（markdown/html/code/diff/csv/pdf/image/text/url，带源码/预览切换、分屏编辑、保存、下载），以及拖文件进输入框的 dock。从 Explorer 拖文件、或在输入框里输入 `@`，都会通过 conversation 输入门面把一个工作区文件作为内联引用 chip（以文件 basename 为标签）插入当前会话的草稿：`@` 源（`file-source.ts`）通过 fs 的 `list`/`search` 路由列出文件，其 codec 在发送时把 chip 还原成相对路径。宽度、折叠、tab、展开目录按项目根持久化到 `localStorage`（沿用 AionUi 原始键名）。

## Model Experience

无直接效果：面板纯展示，不添加任何 prompt 内容。唯一的模型可见影响是间接的——当用户把文件拖到输入框 dock、或用 `@` 提及文件时，一个内联文件 chip 被插入草稿，发送时还原成普通的工作区相对路径，成为用户消息的一部分（agent 随后通过自己的工具读取该文件）。

#### KV Cache effect

无，除了包含插入路径的用户消息的普通影响。

## Known Limitations and Deferred Work

- **SCM 推迟** —— git 变更面板与 system-prompt 公告按移植范围决策刻意省略。host 的 `inject` 去掉了 `subprocess` 与 `systemPrompt`；若要恢复 SCM，需还原 `git-service.ts`、`poll-guard.ts`、git 路由与 scm store。
- **忠实移植的分层偏离** —— browser 半区使用自己的 React 根、自己的 store、直接 `fetch`/`EventSource` 与 DOM 网格手术，而非 `ctx.slots.register`/Typert Remote/声明式 store。这是对既有自包含功能的刻意移植，可渐进原生化。
- **host 服务使用原生 `node:fs`** —— `FsService` 通过 realpath + 前缀比较门控，而非 `ctx.fs` 能力（`fs.contains`）。一个自包含的后续项可将其改到 `ctx.fs` 上。
- **暂无包级测试** —— 移植时未带回 dsh-web-ui 的 vitest 套件；源码目前仅由 typecheck 与 `test:gui` 组合覆盖。
