# Agent Note: 文献加入对话与精读

Status: implemented

[English](2026-08-15-attach-papers-to-conversation.md) | 中文

## Problem

文献界面只能搜集和收藏文献，但没有任何机制把文献带进对话本身：agent 只知道某次检索恰好返回了什么，从「这篇看起来合适」（会话文献卡片或收藏行）到「agent 精读这篇文献」之间没有产品路径。精读能力早已存在（`mcp__literature__literature_get_fulltext` MCP 工具），但 agent 缺少用户选中了哪些文献的持久信号。

## Decision

会话文献卡片（`PaperCard`）与收藏行（`FavoriteRow`）上的加号图标为下一条消息切换加入状态，待发送期间变为减号。新宿主包 `@deepseek-ai/dsh-literature-attachments` 持有状态：`literature/attach` / `literature/detach` 会话事件（log-only、非 surface、读取时必需）是唯一存储，由 Typert Remote 服务（`literatureAttachments.attach/detach/list/byTurn`）在按会话串行化的前提下追加。服务注册 `literature:attached` 提示上下文（order 130），每次请求折叠日志并渲染有界块——元数据、标识符，以及用户要求精读时以 pmcid（优先）/ pmid / doi 调用 `literature_get_fulltext` 的指令——受 `maxPapers`（24）与 `maxBytes`（16 KiB，完整结果边界，摘要以 `…` 截断并附省略说明）约束。文献是按消息消费的：服务在 `agent/turn-stopping` 时为每篇已加入文献追加一条 `literature/detach`，因此文献只注入恰好一轮，下一条消息从空集合开始（加号恢复为加号）；`byTurn` 报告每条用户消息携带了哪些文献。客户端在按会话 id 索引的模块级 store 中镜像已提交回复（声明式 store 无法把一个句柄同时挂到 `session` 与 `root` 两个槽位作用域，故沿用本包既有的 favorites-store 风格）；收藏面板通过 `useSessions` 读取当前会话。`FavoritePaper` 增加可选加法式 `identifiers` 字段（schema version 保持 0，沿用 `folderId` 先例），使收藏行能以精读所需标识符加入；`PaperItem` 增加 `pmcid`。已提交的加入以紧凑、横向换行的小方格展示，带 `已加入对话 · 已注入上下文 · N 篇` 标题——每篇文献显示标题与作者-年份元信息：待发送文献填充既有的 `conversation.input.dock` 输入停靠槽位（order 30），每条消息携带的文献通过新增的 `conversation.chat.user-tail` 槽位（由 ui-conversation 的 `user` 聊天渲染器声明、ui-literature 填充）渲染在该条消息下方。两份 persona 拷贝（`apps/cli/config/agent-presets/aixlab` 与 `presets/aixlab`）都向 agent 说明运行时上下文中的 `Attached papers`。

## Testing

宿主：`literature-attachments.spec.ts` 在真 `SystemPrompt` 与 `Session.create` 之上用假 agent 驱动真服务——加入/列出/移出往返、幂等重复、zod 输入拒绝、按会话串行化、turn-stopping 消费、`byTurn` 逐消息记录、组装上下文注入及其在 dispose 后的移除，另有纯 fold/render 测试覆盖固定头部、缺失字段省略、`maxPapers` 省略说明、精确字节边界与仅头部预算。客户端：`attached-store.client.spec.ts`（一次性加载、逐轮映射、已提交回复应用、串行化、resync），`paper-card.client.spec.tsx` 与 `favorites-panel.client.spec.tsx`（jsdom）覆盖加号/减号切换、已加入态、无会话禁用与进行中状态；`attached-context-bar.client.spec.tsx`（jsdom）覆盖待发送的输入停靠区方格与逐消息尾部方格；`paper-model.client.spec.ts` 覆盖 pmcid 提取与载荷构建。Favorites：identifiers 往返、缺省省略、旧格式行迁移。另有无模型 headless 快照场景（重放携带 `literature/attach` 的 fixture 日志）钉住组装转录中的注入上下文。

## Alternatives considered

**Surface（聊天可见）的加入事件。** 否决：面板已渲染状态；log-only 事件保持聊天干净，详情栏权威。

**像 favorites 一样的持久侧车。** 否决：加入是会话级的，且必须可从日志重建（模型可见 ⟺ 已记录）；侧车会与会话日志重复并破坏回放。

**专设一个包装 MCP 的精读工具。** 否决：`literature_get_fulltext` 已存在且可用；注入块指示 agent 即可，不引入第二个工具面。

**宿主命令 `/attach`。** 否决：命令会作为聊天行出现且需在参数里塞 JSON；Remote 让手势不可见且强类型。

## Consequences

文献现在只在加入后的那一轮进入模型的运行时上下文，随后服务在轮末将其移除；回放、重启、多标签页状态都从会话日志重新推导。本构建写出的日志包含必需事件 `literature/attach`，旧构建会拒绝解析（pre-release 立场；持久化目录已重新生成）。在 `identifiers` 字段存在之前收藏的行只携带合成 id 加入，仅这些行的最快全文查找键变弱。该功能是按消息的：跨会话持久收藏仍由 literature-favorites 承担。
