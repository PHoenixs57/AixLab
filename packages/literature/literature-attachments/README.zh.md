# @deepseek-ai/dsh-literature-attachments

[English](README.md) | 中文

deepseek-aix 的会话级文献加入能力：用户从文献界面（文献卡片与收藏行上的加号）把论文加入当前对话。每次加入/移出都是一条持久会话事件，每个模型请求都会把这些事件折叠成一个有字节上限的运行时上下文块，供 agent 通过内置 literature-search MCP 进行精读。

## 配置

```yaml
- id: literature-attachments
  name: '@deepseek-ai/dsh-literature-attachments'
  config:
    maxPapers: 24    # optional; longest number of papers listed in the injected context
    maxBytes: 16384  # optional; complete byte bound of the injected context (header included)
```

`maxPapers` 必须是 `1..1000` 的整数；`maxBytes` 必须是 `>= 1024` 的整数。非法值在插件加载时报错。

## 事件存储

会话日志是唯一存储。`literature/attach` 携带一个冻结的 `AttachedPaper`（`id`、`title`、`authors`、`year`、`venue`、`abstract`、`url`，以及可取 `doi` / `pmid` / `pmcid` / `arxiv` 任意子集的 `identifiers`）；`literature/detach` 携带稳定 id。两者都是 log-only、非 surface 事件（读取时必需——不认识这些类型的构建会拒绝解析日志）。重复加入相同 id、移出不存在的 id 均为幂等无操作。

Typert Remote 命名空间 `literatureAttachments` 提供 `attach(sessionId, paper)`、`detach(sessionId, id)`、`list(sessionId)` 与 `byTurn(sessionId)`；Web 客户端通过按会话 id 索引的浏览器缓存镜像已提交的回复。文献是按消息消费的：文献注入下一条请求，并在该轮关闭时被消费（移除），因此每条消息都从空的已加入集合开始；`byTurn` 仍会报告每条消息携带了哪些文献。

## 注入上下文

服务注册 `literature:attached` 提示上下文（order 130）。每次带 agent 的组装都会折叠会话日志，渲染固定头部：列出当前已加入的文献，并指示 agent 在用户要求精读时以 pmcid（优先）、pmid 或 doi 调用 `mcp__literature__literature_get_fulltext`。文献按加入顺序列出标识符与摘要；`maxPapers` 把超出部分折叠成省略说明，`maxBytes` 约束完整渲染块（溢出的摘要以 `…` 截断）。没有任何已加入文献时渲染空文本。服务在 `agent/turn-stopping` 时为每篇已加入文献追加一条 `literature/detach`，因此上下文只存在恰好一轮（按消息消费），并从下一条请求消失。

## Model Experience

### 已加入文献运行时上下文

#### 模型看到的内容

仅当至少有一篇文献被加入时，当前运行时上下文快照中出现 `## Attached papers` 块：

##### 已加入文献块

```markdown
## Attached papers

The user attached these papers to this conversation from the literature UI.
Treat them as reading material for this conversation. When the user asks for
detailed reading (精读) or more information about one of them, call
`mcp__literature__literature_get_fulltext` with its pmcid (preferred), pmid,
or doi; papers without open-access full text return a structured status of
"not_found" — report that honestly instead of inventing content.

1. Example paper one (2024) — Alice, Bob · Journal of Examples
   id: 10.1000/example.1
   identifiers: DOI 10.1000/example.1, PMID 123456, PMCID PMC1234567
   url: https://example.org/paper
   Abstract: An abstract about examples.
```

#### Token 影响

该块按请求从会话日志渲染（不累积进历史）：大小受 `maxBytes` 约束，移出最后一篇文献后下一个请求即不再出现。

#### KV Cache 影响

运行时上下文快照在已声明批次之后由 driver 追加；加入或移出文献只改变尾部上下文，可复用的请求前缀不受影响。

## Known Limitations and Deferred Work

- **仅开放获取子集** — 精读只能取得 `literature_get_fulltext` 可抓取的内容（Europe PMC 开放获取）；无开放获取全文的文献返回 `not_found`，指令要求 agent 如实报告。
- **仅当前会话** — 界面只向打开的会话加入；服务本身接受任意已解析的会话 id。
- **会话级作用域** — 已加入文献不跨会话跟随用户；跨会话持久收藏由 literature-favorites 侧车承担。
- **无标识符的收藏行** — 在收藏 `identifiers` 字段存在之前收藏的论文只携带合成 id 加入，精读时可能缺少最快的 pmcid 查找键。
