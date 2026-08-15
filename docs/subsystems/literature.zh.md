# 文献

[English](literature.md) | 中文

deepseek-aix 的文献平面：[`@deepseek-ai/dsh-literature-attachments`](../../packages/literature/literature-attachments) 持有用户加入当前对话的会话级文献——`literature/attach` / `literature/detach` 会话事件是唯一存储，每次请求折叠进 `literature:attached` 运行时上下文——[`@deepseek-ai/dsh-literature-favorites`](../../packages/literature/literature-favorites) 在 storage-domain 接缝上持有带扁平分类文件夹的跨会话持久收藏。两者都通过 Typert Remote 服务发布操作；下方生成的 Cordis API 是方法级权威。包 README 拥有配置项、注入上下文格式与 Model Experience 章节；生成的[持久化目录](../persistence-catalog.md)拥有事件声明。

来源：[`packages/literature/literature-attachments/src/index.ts`](../../packages/literature/literature-attachments/src/index.ts)、[`packages/literature/literature-favorites/src/index.ts`](../../packages/literature/literature-favorites/src/index.ts)

## 已加入文献

`literatureAttachments` 在 Remote 边界校验每个加入请求，冻结提交的文献，并以 `literature/attach` 事件追加；移出则以稳定 id 追加 `literature/detach`。重复加入相同 id、移出不存在的 id 均为幂等无操作，按会话的变更串行化保证并发点击安全。服务注册 `literature:attached` 提示上下文（order 130），在 `maxPapers` 与完整 `maxBytes` 边界内渲染已加入集合——元数据、标识符，以及指明调用 `mcp__literature__literature_get_fulltext` 的精读指令。

## 收藏

`literatureFavorites` 持久化一条全局收藏行：以稳定 id（DOI 优先，其次 PMID，再次 arXiv id）为键的文献，加扁平分类文件夹。重复 id 与重复文件夹名是显式业务失败；删除文件夹会将其文献移回未分类。每个 Remote 调用返回冻结的成功或失败分支，所有变更都在一条串行队列后执行。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxliteratureattachments--literatureattachmentsservice"></a>

### `ctx.literatureAttachments` — `LiteratureAttachmentsService`

Log-backed per-session attachment service: validates attach requests, appends the paired session events, and renders the injected context.

```ts cordis-catalog
/**
 * Attach one paper to the calling agent's conversation. Attaching the same
 * stable id again is idempotent and logs nothing.
 * @param agent - the receiving agent whose session logs the attach.
 * @param input - the paper to attach (id = DOI / PMID / arXiv id).
 * @returns the committed paper and whether it was already attached.
 */
@Remote('attach') attach(agent: Agent, input: AttachedPaperInput): Promise<AttachResult>

/**
 * Remove one attached paper by stable id. Removing an id that is not
 * attached is idempotent and logs nothing.
 * @param agent - the receiving agent whose session logs the detach.
 * @param id - the stable identifier used when the paper was attached.
 * @returns the removed id and whether it was attached.
 */
@Remote('detach') detach(agent: Agent, id: string): Promise<DetachResult>

/**
 * List the calling agent's currently attached papers in attach order.
 * @param agent - the receiving agent whose session log is folded.
 * @returns the frozen current attached set.
 */
@Remote('list') list(agent: Agent): Promise<readonly AttachedPaper[]>

/**
 * List the papers each user message carried, keyed by that message's seq.
 * Consumed papers stay visible here so the UI can render them under the
 * message that sent them.
 * @param agent - the receiving agent whose session log is folded.
 * @returns one frozen entry per user message that carried papers.
 */
@Remote('byTurn') byTurn(agent: Agent): Promise<readonly AttachedTurn[]>
```

Types: [Agent](core.md)

Source: [`packages/literature/literature-attachments/src/index.ts:125`](../../packages/literature/literature-attachments/src/index.ts)

<a id="ctxliteraturefavorites--literaturefavoritesservice"></a>

### `ctx.literatureFavorites` — `LiteratureFavoritesService`

Storage-domain sidecar service. One global row holds the whole per-user collection; every mutation runs behind one serial queue.

```ts cordis-catalog
/**
 * List the whole collection: folders in creation order, papers newest
 * first.
 * @returns the current frozen collection.
 */
@Remote('list') list(): Promise<FavoritesListResult>

/**
 * Bookmark one paper into the collection (optionally under a folder). A
 * duplicate id is a business failure, not a silent no-op, so the panel can
 * tell the user "already saved".
 * @param request - the paper to save (id = DOI / PMID / arXiv id).
 * @returns the committed entry or an explicit duplicate / folder failure.
 */
@Remote('add') add(request: FavoritesAddRequest): Promise<FavoritesAddResult>

/**
 * Remove one bookmark by stable id. The wire name is `delete`: `remove` is
 * reserved by the Typert gateway and conflicts with its namespace service.
 * @param request - the id to unbookmark.
 * @returns the removed id or an explicit not-found failure.
 */
@Remote('delete') delete(request: FavoritesRemoveRequest): Promise<FavoritesRemoveResult>

/**
 * Create one category folder. Names are unique case-insensitively, so the
 * panel can resolve a folder by its display name.
 * @param request - the display name.
 * @returns the committed folder or an explicit name failure.
 */
@Remote('folderCreate') folderCreate(request: FavoritesFolderCreateRequest): Promise<FavoritesFolderCreateResult>

/**
 * Rename one folder, keeping its papers filed under the same id.
 * @param request - the folder id and its new display name.
 * @returns the renamed folder or an explicit failure.
 */
@Remote('folderRename') folderRename(request: FavoritesFolderRenameRequest): Promise<FavoritesFolderRenameResult>

/**
 * Delete one folder; its papers move back to uncategorized (the folder
 * delete is a classification change, never a paper loss).
 * @param request - the folder id to delete.
 * @returns the removed folder id or an explicit not-found failure.
 */
@Remote('folderDelete') folderDelete(request: FavoritesFolderDeleteRequest): Promise<FavoritesFolderDeleteResult>

/**
 * File one paper under a folder (or back into uncategorized).
 * @param request - the paper id and the target folder id (null = uncategorized).
 * @returns the moved paper id or an explicit failure.
 */
@Remote('move') move(request: FavoritesMoveRequest): Promise<FavoritesMoveResult>
```

Source: [`packages/literature/literature-favorites/src/index.ts:177`](../../packages/literature/literature-favorites/src/index.ts)
<!-- END GENERATED cordis-surface -->
