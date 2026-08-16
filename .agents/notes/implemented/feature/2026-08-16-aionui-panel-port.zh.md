# Agent Note: 将 dsh-web-ui aionui-panel 移植为 in-tree 双面插件

Status: implemented

[English](2026-08-16-aionui-panel-port.md) | 中文

## Problem

deepseek-aix 需要 dsh-web-ui 的「右侧面板」（AionUi Explorer + Preview）：带文件名搜索的文件树、多格式多 tab 预览、以及拖文件进输入框。dsh-web-ui 把它作为外部 npm bundle（`@linxin666/dsh-client-ui-aionui-panel`）发布，基于已发布的 `@deepseek-ai/*` SDK 编写，靠 `cordis.patch.yml` profile 层挂载，并在 shell 网格上做自己的 DOM 手术。而 aixlab 本身就是 harness 源码 checkout，所以该功能必须内置于 `packages/` 之下。

## Decision

把 aionui-panel 移植为单个 in-tree 双面包 `@deepseek-ai/dsh-client-ui-aionui-panel`，位于 `packages/client/ui-aionui-panel`。node 半区（`src/index.ts`，`inject = ['webServer', 'workspaceRegistry']`）拥有一个受工作区门控的 `FsService` 以及 `/aionui-panel/*` HTTP 路由（JSON list/read/write/search/delete + 一个 raw 字节路由 + 一个 fs 变更 SSE 流）。browser 半区（`src/client/`，`dsh.client` 清单）保留原来自成一体的架构：由 `PanelLayoutController` 追加两列网格轨道、把两个 `createRoot` 树挂进这些列；四个 store 减为三个（`layout`/`explorer`/`preview`）；直接同源 `fetch` + `EventSource`；拖拽 inlay 走 `conversation.input.dock` 槽位。

dsh-web-ui 的 npm 依赖与 in-tree 包的包名、服务 API 完全一致，所以 host 半区几乎逐字移植。唯一改动是机械化的严格性适配（见下）和缩减后的表面（见下）。

### Scope reduction

按移植时的产品决策，刻意省略 SCM（git 变更面板）与 `systemPrompt` 公告。移除了 `git-service.ts`、`poll-guard.ts`、git 路由、`ScmPanel`、scm store，以及预览 diff-tab 机制（`openDiff`/`handleGitChange`/`refreshDiffs`/`gitDiff`）。保留 `'diff'` 内容类型和 `DiffViewer`，因为 `.diff`/`.patch` 文件仍通过普通读取路径预览为 unified diff。host 的 `inject` 去掉了 `subprocess` 与 `systemPrompt`。

### Security model unchanged

原样保留「仅回环」信任栅栏（`isLoopbackRequest`：socket 地址 + Host 头 + 同源标记）与工作区门卫（`createWorkspaceGate`：realpath 根路径，要求属于 `workspaceRegistry.list()` 的路径）。`FsService.resolveInsideRoot` 保留其 symlink 逃逸防护和 `.git` 路径拒绝。面板仍直接读/写原生 `node:fs`，而非 `ctx.fs` 能力——这是忠实移植的选择；后续可改为 `ctx.fs` + `fs.contains`。

### Strictness adaptations

aixlab 的 `tsconfig.base.json` 启用了 `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes`，而 dsh-web-ui 源码并未假设。移植为数组下标加非空断言（`markdown.ts`、`layout.ts`、`probeImageSize`、`handleFsChange`），为可选 `image`/`mtime` 字段改条件展开（`loadContent`/`reloadTab`、`FsService.read`），并加 `IconProps.className?: string | undefined`。`layout.ts` 的 `findFrame` 获得可靠锚点：shell `AppFrame` 现在在其网格元素上打 `data-dsh-frame` 标记（原回退 `[class*="sidebarCol"]` 也能用，但对 hash 脆弱）。

### Drag inlay alignment

输入框放置目标注册进现成的 `conversation.input.dock` 槽位。其 `insertPath` 通过 `ctx.sessions.scope(sessionId)` 解析会话 scope，再经 `conversation.input.for(actx)` → `setDraft(...)` 写入草稿，对齐 aixlab 的 `SessionInputResolver` 门面（dsh-web-ui rc.6 形态是 `conversation.input.for(actx).state.getSnapshot().draft` + `setDraft`；aixlab 结构相同）。

## Consequences

「右侧面板」现在出现在 cwd 非空的 `dsh web` 会话中：Explorer 列（文件树 + 文件名搜索，带收起箭头）与 Preview 列（markdown/html/code/diff/csv/pdf/image/text/url 的多 tab 源码/预览/分屏/保存/下载），以及输入框上方一个把工作区相对路径插入草稿的放置目标。面板宽度、折叠状态、tab、展开目录按项目根持久化到 `localStorage`（沿用 AionUi 原始键名）。host 在共享 webserver 上暴露 `/aionui-panel/*`（JSON）与 `/aionui-panel/events`（SSE），仅回环且受工作区门控。SCM 与 system-prompt 公告在显式恢复前缺席。

## Alternatives considered

**原生 slot 系统重写** —— 拒绝。把约 30 个 React 文件重写到 `ctx.slots.register`/Typert Remote/声明式 store 上，并把 `AppFrame` 扩展为第五网格轨道，工作量大得多、风险也更高。忠实移植保留了功能的精确行为，后续可渐进原生化。

**外部 bundle 安装** —— 拒绝。aixlab 从源码运行；`@linxin666/*` bundle 面向已发布 SDK，无法 in-tree 解析。

**host 服务复用 `ctx.fs` 能力** —— 推迟。`FsService` 会改为解析 target 并检查 `fs.contains`，而非 realpath + 前缀比较；这是自包含的后续项，不影响正确性。
