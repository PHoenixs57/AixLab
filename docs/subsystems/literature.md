# Literature

English | [中文](literature.zh.md)

The deepseek-aix literature plane: [`@deepseek-ai/dsh-literature-attachments`](../../packages/literature/literature-attachments) owns per-session papers the user attaches to a conversation — `literature/attach` / `literature/detach` session events are the only store, folded into the `literature:attached` runtime context every request — and [`@deepseek-ai/dsh-literature-favorites`](../../packages/literature/literature-favorites) owns the durable cross-session bookmark collection with flat category folders over the storage-domain seam. Both publish their operations through Typert Remote services; the generated Cordis API below is the method-level authority. Package READMEs own the config knobs, the injected-context format, and the Model Experience sections; the generated [persistence catalog](../persistence-catalog.md) owns the event declarations.

Sources: [`packages/literature/literature-attachments/src/index.ts`](../../packages/literature/literature-attachments/src/index.ts), [`packages/literature/literature-favorites/src/index.ts`](../../packages/literature/literature-favorites/src/index.ts)

## Attached papers

`literatureAttachments` validates each attach request at the Remote boundary, freezes the committed paper, and appends it as a `literature/attach` event; a detach appends `literature/detach` with the stable id. Attaching an already-attached id and detaching an unattached id are idempotent no-ops, and per-session mutation serialization makes concurrent clicks safe. The service registers the `literature:attached` prompt context (order 130), which renders the attached set — metadata, identifiers, and the deep-reading instruction naming `mcp__literature__literature_get_fulltext` — under `maxPapers` and a complete `maxBytes` bound.

## Favorites

`literatureFavorites` persists one global collection row: papers keyed by their stable id (DOI preferred, else PMID, else arXiv id) plus flat category folders. Duplicate ids and duplicate folder names are explicit business failures; deleting a folder moves its papers back to uncategorized. Every Remote call returns a frozen success or failure branch, and all mutations run behind one serial queue.

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
