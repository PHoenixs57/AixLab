/**
 * Durable per-user literature favorites for deepseek-aix.
 *
 * Host half: a Typert Remote service (the favorites panel's face over one
 * global storage-domain row) plus model-facing tools so the agent can
 * bookmark papers the user asks for and organize them into flat category
 * folders. `list` / `add` / `delete` cover the collection; `folderCreate` /
 * `folderRename` / `folderDelete` / `move` manage the folder structure.
 * @module @deepseek-ai/dsh-literature-favorites
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { GLOBAL_ROW_KEY, literatureFavoritesDomainSpec } from './spec.ts'
import type { FavoritesRow } from './spec.ts'
import type {
  FavoriteFolder,
  FavoritePaper,
  FavoritePaperIdentifiers,
  FavoritesAddRequest,
  FavoritesAddResult,
  FavoritesDuplicateError,
  FavoritesDuplicateFolderError,
  FavoritesFolderCreateRequest,
  FavoritesFolderCreateResult,
  FavoritesFolderDeleteRequest,
  FavoritesFolderDeleteResult,
  FavoritesFolderNameError,
  FavoritesFolderNotFoundError,
  FavoritesFolderRenameRequest,
  FavoritesFolderRenameResult,
  FavoritesListResult,
  FavoritesMoveRequest,
  FavoritesMoveResult,
  FavoritesNotFoundError,
  FavoritesRemoveRequest,
  FavoritesRemoveResult,
  FavoritesRejected,
  FavoritesSuccess,
} from './types.ts'

export type * from './types.ts'
export { literatureFavoritesDomainSpec, GLOBAL_ROW_KEY } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    literatureFavorites: LiteratureFavoritesService
  }
}

/** Longest allowed folder name (a display label, kept short). */
const FOLDER_NAME_MAX = 64

/** The normalized in-memory collection shape (folders always present). */
interface Collection {
  folders: FavoriteFolder[]
  papers: FavoritePaper[]
}

/** Build a frozen success branch. */
function success<T>(value: T): FavoritesSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E>(error: E): FavoritesRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Copy and freeze one entry before it crosses the service boundary. */
function snapshotPaper(paper: FavoritePaper): FavoritePaper {
  const identifiers = paper.identifiers === undefined
    ? undefined
    : Object.freeze({
      ...paper.identifiers.doi !== undefined ? { doi: paper.identifiers.doi } : {},
      ...paper.identifiers.pmid !== undefined ? { pmid: paper.identifiers.pmid } : {},
      ...paper.identifiers.pmcid !== undefined ? { pmcid: paper.identifiers.pmcid } : {},
      ...paper.identifiers.arxiv !== undefined ? { arxiv: paper.identifiers.arxiv } : {},
    }) as FavoritePaperIdentifiers
  return Object.freeze({
    id: paper.id,
    title: paper.title,
    authors: Object.freeze([...paper.authors]),
    year: paper.year,
    venue: paper.venue,
    abstract: paper.abstract,
    url: paper.url,
    ...identifiers === undefined ? {} : { identifiers },
    folderId: paper.folderId ?? null,
    addedAt: paper.addedAt,
  }) as FavoritePaper
}

/** Copy and freeze one folder before it crosses the service boundary. */
function snapshotFolder(folder: FavoriteFolder): FavoriteFolder {
  return Object.freeze({
    id: folder.id,
    name: folder.name,
    createdAt: folder.createdAt,
  }) as FavoriteFolder
}

/** Copy and freeze a whole-collection value. */
function snapshotCollection(collection: Collection): Collection {
  return {
    folders: Object.freeze(collection.folders.map(snapshotFolder)) as FavoriteFolder[],
    papers: Object.freeze(collection.papers.map(snapshotPaper)) as FavoritePaper[],
  }
}

/** Trim one identifiers set, dropping blank fields; undefined when nothing remains. */
function normalizeIdentifiers(input: FavoritePaperIdentifiers | undefined): FavoritePaperIdentifiers | undefined {
  if (input === undefined) return undefined
  const result: FavoritePaperIdentifiers = {}
  const doi = input.doi?.trim()
  const pmid = input.pmid?.trim()
  const pmcid = input.pmcid?.trim()
  const arxiv = input.arxiv?.trim()
  if (doi !== undefined && doi !== '') result.doi = doi
  if (pmid !== undefined && pmid !== '') result.pmid = pmid
  if (pmcid !== undefined && pmcid !== '') result.pmcid = pmcid
  if (arxiv !== undefined && arxiv !== '') result.arxiv = arxiv
  return Object.keys(result).length === 0 ? undefined : result
}

/** Trim and validate one add request into a storable entry. */
function toEntry(request: FavoritesAddRequest): FavoritePaper {
  const id = request.id.trim()
  const title = request.title.trim()
  if (id.length === 0) throw new Error('literature_favorites_add: `id` must be a non-empty string')
  if (title.length === 0) throw new Error('literature_favorites_add: `title` must be a non-empty string')
  const identifiers = normalizeIdentifiers(request.identifiers)
  return {
    id,
    title,
    authors: request.authors.map(author => author.trim()).filter(author => author !== ''),
    year: request.year ?? null,
    venue: request.venue?.trim() || null,
    abstract: request.abstract?.trim() || null,
    url: request.url?.trim() || null,
    ...identifiers === undefined ? {} : { identifiers },
    folderId: request.folderId?.trim() || null,
    addedAt: Date.now(),
  }
}

/** Trim a folder name; empty or over-long names are business failures. */
function normalizeFolderName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > FOLDER_NAME_MAX) return null
  return trimmed
}

/** Case-insensitive folder lookup by display name. */
function findFolderByName(folders: readonly FavoriteFolder[], name: string): FavoriteFolder | undefined {
  const target = name.trim().toLowerCase()
  return folders.find(folder => folder.name.trim().toLowerCase() === target)
}

/** Derive a stable, collision-free folder id from its display name. */
function folderIdFromName(name: string, existing: readonly FavoriteFolder[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const base = slug.length > 0 ? slug.slice(0, 40) : 'folder'
  const taken = new Set(existing.map(folder => folder.id))
  let id = base
  let suffix = 2
  while (taken.has(id)) id = `${base}-${suffix++}`
  return id
}

/**
 * Storage-domain sidecar service. One global row holds the whole per-user
 * collection; every mutation runs behind one serial queue.
 */
export class LiteratureFavoritesService extends TypertRemoteService {
  static inject = ['storageDomain', 'tools']

  private table?: KvTable<string, FavoritesRow>
  private tail: Promise<void> = Promise.resolve()
  private admissionOpen = true

  /**
   * @param ctx - Host context carrying the storage-domain seam and tool registry.
   */
  constructor(ctx: Context) {
    super(ctx, 'literatureFavorites')
  }

  /** Open and own the one favorites sidecar domain, then register the agent tools. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(literatureFavoritesDomainSpec)
    this.ctx.effect(() => async () => {
      this.admissionOpen = false
      await this.tail
      await domain.close()
    }, 'literature-favorites.domainClose')
    this.table = domain.table('papers')
    this.registerTools()
  }

  /**
   * Read the current frozen collection, normalizing rows persisted by the
   * pre-folder format (missing `folders` / per-paper `folderId`).
   */
  private read(): Collection {
    const row = this.requireTable().get(GLOBAL_ROW_KEY)
    if (row === undefined) return snapshotCollection({ folders: [], papers: [] })
    return snapshotCollection({
      folders: row.folders ?? [],
      papers: row.papers.map(paper => ({ ...paper, folderId: paper.folderId ?? null })),
    })
  }

  /** Persist a frozen whole-collection replacement (always the full shape). */
  private write(collection: Collection): Promise<void> {
    const snapshot = snapshotCollection(collection)
    return this.requireTable().put(GLOBAL_ROW_KEY, Object.freeze({
      folders: snapshot.folders,
      papers: snapshot.papers,
    }))
  }

  /** Queue one read/compare/write mutation behind the prior one. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.admissionOpen) {
      return Promise.reject(new Error('literature-favorites: service is disposing'))
    }
    const result = this.tail.then(operation)
    const next = result.then(() => undefined, () => undefined)
    this.tail = next
    return result.finally(() => {
      if (this.tail === next) this.tail = Promise.resolve()
    })
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<string, FavoritesRow> {
    if (this.table === undefined) {
      throw new Error('literature-favorites: durable domain is not initialized')
    }
    return this.table
  }

  /** Resolve a folder display name to its id, creating the folder when missing. */
  private async resolveFolderIdByName(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (trimmed === '') return null
    const existing = findFolderByName(this.read().folders, trimmed)
    if (existing !== undefined) return existing.id
    const created = await this.folderCreate({ name: trimmed })
    if (!created.ok) {
      throw new Error(`literature_favorites: cannot use folder '${trimmed}': ${created.error.code}`)
    }
    return created.value.id
  }

  /**
   * List the whole collection: folders in creation order, papers newest
   * first.
   * @returns the current frozen collection.
   */
  @Remote('list')
  list(): Promise<FavoritesListResult> {
    const collection = this.read()
    const folders = [...collection.folders].sort((left, right) => left.createdAt - right.createdAt)
    const papers = [...collection.papers].sort((left, right) => right.addedAt - left.addedAt)
    return Promise.resolve(success(snapshotCollection({ folders, papers })))
  }

  /**
   * Bookmark one paper into the collection (optionally under a folder). A
   * duplicate id is a business failure, not a silent no-op, so the panel can
   * tell the user "already saved".
   * @param request - the paper to save (id = DOI / PMID / arXiv id).
   * @returns the committed entry or an explicit duplicate / folder failure.
   */
  @Remote('add')
  add(request: FavoritesAddRequest): Promise<FavoritesAddResult> {
    let entry: FavoritePaper
    try {
      entry = snapshotPaper(toEntry(request))
    } catch (error) {
      return Promise.reject(error)
    }
    return this.enqueue(async () => {
      const collection = this.read()
      if (entry.folderId !== null && !collection.folders.some(folder => folder.id === entry.folderId)) {
        return rejected<FavoritesFolderNotFoundError>({ code: 'folder-not-found', id: entry.folderId })
      }
      if (collection.papers.some(paper => paper.id === entry.id)) {
        return rejected<FavoritesDuplicateError>({ code: 'duplicate', id: entry.id })
      }
      await this.write({ ...collection, papers: [...collection.papers, entry] })
      return success(entry)
    })
  }

  /**
   * Remove one bookmark by stable id. The wire name is `delete`: `remove` is
   * reserved by the Typert gateway and conflicts with its namespace service.
   * @param request - the id to unbookmark.
   * @returns the removed id or an explicit not-found failure.
   */
  @Remote('delete')
  delete(request: FavoritesRemoveRequest): Promise<FavoritesRemoveResult> {
    const id = request.id.trim()
    if (id.length === 0) {
      return Promise.reject(new Error('literature_favorites_remove: `id` must be a non-empty string'))
    }
    return this.enqueue(async () => {
      const collection = this.read()
      if (!collection.papers.some(paper => paper.id === id)) {
        return rejected<FavoritesNotFoundError>({ code: 'not-found', id })
      }
      await this.write({ ...collection, papers: collection.papers.filter(paper => paper.id !== id) })
      return success({ removed: id })
    })
  }

  /**
   * Create one category folder. Names are unique case-insensitively, so the
   * panel can resolve a folder by its display name.
   * @param request - the display name.
   * @returns the committed folder or an explicit name failure.
   */
  @Remote('folderCreate')
  folderCreate(request: FavoritesFolderCreateRequest): Promise<FavoritesFolderCreateResult> {
    const name = normalizeFolderName(request.name)
    if (name === null) {
      return Promise.resolve(rejected<FavoritesFolderNameError>({ code: 'invalid-name' }))
    }
    return this.enqueue(async () => {
      const collection = this.read()
      if (findFolderByName(collection.folders, name) !== undefined) {
        return rejected<FavoritesDuplicateFolderError>({ code: 'duplicate-folder', name })
      }
      const folder: FavoriteFolder = {
        id: folderIdFromName(name, collection.folders),
        name,
        createdAt: Date.now(),
      }
      await this.write({ ...collection, folders: [...collection.folders, folder] })
      return success(snapshotFolder(folder))
    })
  }

  /**
   * Rename one folder, keeping its papers filed under the same id.
   * @param request - the folder id and its new display name.
   * @returns the renamed folder or an explicit failure.
   */
  @Remote('folderRename')
  folderRename(request: FavoritesFolderRenameRequest): Promise<FavoritesFolderRenameResult> {
    const id = request.id.trim()
    const name = normalizeFolderName(request.name)
    if (id.length === 0) {
      return Promise.reject(new Error('literature_favorites_folder_rename: `id` must be a non-empty string'))
    }
    if (name === null) {
      return Promise.resolve(rejected<FavoritesFolderNameError>({ code: 'invalid-name' }))
    }
    return this.enqueue(async () => {
      const collection = this.read()
      const folder = collection.folders.find(candidate => candidate.id === id)
      if (folder === undefined) {
        return rejected<FavoritesFolderNotFoundError>({ code: 'folder-not-found', id })
      }
      const clash = findFolderByName(collection.folders, name)
      if (clash !== undefined && clash.id !== id) {
        return rejected<FavoritesDuplicateFolderError>({ code: 'duplicate-folder', name })
      }
      const renamed: FavoriteFolder = { ...folder, name }
      await this.write({
        ...collection,
        folders: collection.folders.map(candidate => candidate.id === id ? renamed : candidate),
      })
      return success(snapshotFolder(renamed))
    })
  }

  /**
   * Delete one folder; its papers move back to uncategorized (the folder
   * delete is a classification change, never a paper loss).
   * @param request - the folder id to delete.
   * @returns the removed folder id or an explicit not-found failure.
   */
  @Remote('folderDelete')
  folderDelete(request: FavoritesFolderDeleteRequest): Promise<FavoritesFolderDeleteResult> {
    const id = request.id.trim()
    if (id.length === 0) {
      return Promise.reject(new Error('literature_favorites_folder_delete: `id` must be a non-empty string'))
    }
    return this.enqueue(async () => {
      const collection = this.read()
      if (!collection.folders.some(folder => folder.id === id)) {
        return rejected<FavoritesFolderNotFoundError>({ code: 'folder-not-found', id })
      }
      await this.write({
        folders: collection.folders.filter(folder => folder.id !== id),
        papers: collection.papers.map(paper => paper.folderId === id ? { ...paper, folderId: null } : paper),
      })
      return success({ removed: id })
    })
  }

  /**
   * File one paper under a folder (or back into uncategorized).
   * @param request - the paper id and the target folder id (null = uncategorized).
   * @returns the moved paper id or an explicit failure.
   */
  @Remote('move')
  move(request: FavoritesMoveRequest): Promise<FavoritesMoveResult> {
    const id = request.id.trim()
    const folderId = request.folderId?.trim() || null
    if (id.length === 0) {
      return Promise.reject(new Error('literature_favorites_move: `id` must be a non-empty string'))
    }
    return this.enqueue(async () => {
      const collection = this.read()
      if (!collection.papers.some(paper => paper.id === id)) {
        return rejected<FavoritesNotFoundError>({ code: 'not-found', id })
      }
      if (folderId !== null && !collection.folders.some(folder => folder.id === folderId)) {
        return rejected<FavoritesFolderNotFoundError>({ code: 'folder-not-found', id: folderId })
      }
      await this.write({
        ...collection,
        papers: collection.papers.map(paper => paper.id === id ? { ...paper, folderId } : paper),
      })
      return success({ moved: id, folderId })
    })
  }

  /** Register the model-facing bookmark and folder tools. */
  private registerTools(): void {
    const tools = this.ctx.tools
    tools.register(defineTool({
      name: 'literature_favorites_add',
      description: 'Bookmark one paper into the user\'s durable literature favorites. '
        + '`id` is the stable identifier — the DOI when present, else the PMID, else the arXiv id. '
        + 'Use it whenever the user asks to save / bookmark / 收藏 a paper you retrieved; '
        + 'never bookmark a paper you did not retrieve from a search result. '
        + 'Optional `folder` names the category folder to file the paper under; '
        + 'the folder is created when it does not exist yet, and an empty `folder` means uncategorized.',
      parameters: {
        id: { type: 'string', required: true, description: 'Stable identifier: DOI (preferred), PMID, or arXiv id.' },
        title: { type: 'string', required: true, description: 'Paper title.' },
        authors: {
          type: 'array',
          required: true,
          description: 'Author names, in order.',
          items: { type: 'string' },
        },
        year: { type: 'integer', description: 'Publication year.' },
        venue: { type: 'string', description: 'Journal / conference / preprint server name.' },
        abstract: { type: 'string', description: 'Abstract or summary text.' },
        url: { type: 'string', description: 'Canonical landing page URL.' },
        identifiers: {
          type: 'object',
          additionalProperties: false,
          description: 'Stable identifiers beyond `id` (any subset), used when the paper is later attached to a conversation for deep reading.',
          properties: {
            doi: { type: 'string', description: 'Digital Object Identifier, e.g. 10.1000/example.1.' },
            pmid: { type: 'string', description: 'PubMed identifier.' },
            pmcid: { type: 'string', description: 'PubMed Central identifier, e.g. PMC1234567.' },
            arxiv: { type: 'string', description: 'arXiv identifier, e.g. 2001.01234.' },
          },
        },
        folder: { type: 'string', description: 'Category folder name; created when missing (empty = uncategorized).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            title: { type: 'string', required: true },
            folderId: { type: 'string' },
            addedAt: { type: 'integer', required: true },
          },
        },
        render: (_args, value: { id: string; title: string; folderId?: string }) => [{
          type: 'text',
          text: `Bookmarked: ${value.title} (${value.id})${value.folderId === undefined ? '' : ` → folder ${value.folderId}`}`,
        }],
      },
      execute: async (args) => {
        const folderId = await this.resolveFolderIdByName(args.folder ?? '')
        const result = await this.add({
          id: args.id,
          title: args.title,
          authors: args.authors,
          year: args.year ?? null,
          venue: args.venue ?? null,
          abstract: args.abstract ?? null,
          url: args.url ?? null,
          ...args.identifiers === undefined ? {} : { identifiers: args.identifiers },
          folderId,
        })
        if (!result.ok) {
          if (result.error.code === 'duplicate') {
            throw new Error(`already bookmarked under id ${result.error.id}; use literature_favorites_list to confirm`)
          }
          throw new Error(`folder '${result.error.id}' does not exist`)
        }
        return {
          id: result.value.id,
          title: result.value.title,
          addedAt: result.value.addedAt,
          ...(folderId === null ? {} : { folderId }),
        }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_folder_create',
      description: 'Create one category folder for the user\'s literature favorites '
        + '(e.g. 综述 / 方法 / 某个课题). Folder names are unique; '
        + 'use literature_favorites_move to file existing papers into it.',
      parameters: {
        name: { type: 'string', required: true, description: 'Folder display name.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
          },
        },
        render: (_args, value: { id: string; name: string }) => [{
          type: 'text',
          text: `Created folder: ${value.name} (${value.id})`,
        }],
      },
      execute: async (args) => {
        const result = await this.folderCreate({ name: args.name })
        if (!result.ok) {
          if (result.error.code === 'invalid-name') {
            throw new Error('folder name must be a non-empty string of at most 64 characters')
          }
          throw new Error(`folder '${result.error.name}' already exists`)
        }
        return { id: result.value.id, name: result.value.name }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_folder_rename',
      description: 'Rename one category folder by its current name. Papers already '
        + 'filed in the folder keep their place.',
      parameters: {
        name: { type: 'string', required: true, description: 'Current folder name.' },
        newName: { type: 'string', required: true, description: 'New folder name.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
          },
        },
        render: (_args, value: { id: string; name: string }) => [{
          type: 'text',
          text: `Renamed folder: ${value.name} (${value.id})`,
        }],
      },
      execute: async (args) => {
        const current = findFolderByName(this.read().folders, args.name)
        if (current === undefined) {
          throw new Error(`no folder named '${args.name}'`)
        }
        const result = await this.folderRename({ id: current.id, name: args.newName })
        if (!result.ok) {
          if (result.error.code === 'folder-not-found') {
            throw new Error(`no folder named '${args.name}'`)
          }
          if (result.error.code === 'invalid-name') {
            throw new Error('folder name must be a non-empty string of at most 64 characters')
          }
          throw new Error(`folder '${result.error.name}' already exists`)
        }
        return { id: result.value.id, name: result.value.name }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_folder_delete',
      description: 'Delete one category folder by its name. Its papers move back to '
        + 'uncategorized — deleting a folder never deletes the bookmarked papers.',
      parameters: {
        name: { type: 'string', required: true, description: 'Folder name to delete.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            removed: { type: 'string', required: true },
          },
        },
        render: (_args, value: { removed: string }) => [{
          type: 'text',
          text: `Deleted folder: ${value.removed}`,
        }],
      },
      execute: async (args) => {
        const folder = findFolderByName(this.read().folders, args.name)
        if (folder === undefined) {
          throw new Error(`no folder named '${args.name}'`)
        }
        const result = await this.folderDelete({ id: folder.id })
        if (!result.ok) {
          throw new Error(`no folder named '${args.name}'`)
        }
        return { removed: result.value.removed }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_move',
      description: 'File one bookmarked paper into a category folder (or back to '
        + 'uncategorized when `folder` is empty). The folder is created when it '
        + 'does not exist yet.',
      parameters: {
        id: { type: 'string', required: true, description: 'Stable identifier of the bookmarked paper.' },
        folder: { type: 'string', description: 'Target folder name; created when missing (empty = uncategorized).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            moved: { type: 'string', required: true },
            folderId: { type: 'string' },
          },
        },
        render: (_args, value: { moved: string; folderId?: string }) => [{
          type: 'text',
          text: `Moved ${value.moved}${value.folderId === undefined ? ' to uncategorized' : ` → folder ${value.folderId}`}`,
        }],
      },
      execute: async (args) => {
        const folderId = await this.resolveFolderIdByName(args.folder ?? '')
        const result = await this.move({ id: args.id, folderId })
        if (!result.ok) {
          if (result.error.code === 'not-found') {
            throw new Error(`no bookmark found for id ${result.error.id}`)
          }
          throw new Error(`folder '${result.error.id}' does not exist`)
        }
        return { moved: result.value.moved, ...(folderId === null ? {} : { folderId }) }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_remove',
      description: 'Remove one paper from the user\'s literature favorites by its stable id '
        + '(the DOI / PMID / arXiv id used when it was bookmarked).',
      parameters: {
        id: { type: 'string', required: true, description: 'Stable identifier of the bookmarked paper.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            removed: { type: 'string', required: true },
          },
        },
        render: (_args, value: { removed: string }) => [{
          type: 'text',
          text: `Removed from favorites: ${value.removed}`,
        }],
      },
      execute: async (args) => {
        const result = await this.delete({ id: args.id })
        if (!result.ok) {
          throw new Error(`no bookmark found for id ${result.error.id}`)
        }
        return { removed: result.value.removed }
      },
    }))

    tools.register(defineTool({
      name: 'literature_favorites_list',
      description: 'List the user\'s bookmarked papers and their category folders, '
        + 'newest first. Use it when the user asks what is saved (我的收藏 / favorites), '
        + 'which folders exist, or before reporting which papers are bookmarked.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            count: { type: 'integer', required: true },
            folders: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  count: { type: 'integer', required: true },
                },
              },
            },
            papers: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  year: { type: 'integer' },
                  venue: { type: 'string' },
                  folderId: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (
          _args,
          value: { count: number; folders: { id: string; name: string; count: number }[]; papers: { id: string; title: string }[] },
        ) => {
          const lines: string[] = []
          if (value.count === 0) {
            lines.push('Favorites is empty.')
          } else {
            lines.push(`Favorites (${value.count}):`)
            for (const paper of value.papers) lines.push(`- ${paper.title} (${paper.id})`)
          }
          if (value.folders.length > 0) {
            lines.push(`Folders (${value.folders.length}): ${value.folders.map(folder => `${folder.name} (${folder.count})`).join(', ')}`)
          }
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async () => {
        const result = await this.list()
        const countByFolder = new Map<string, number>()
        for (const paper of result.value.papers) {
          if (paper.folderId !== null) {
            countByFolder.set(paper.folderId, (countByFolder.get(paper.folderId) ?? 0) + 1)
          }
        }
        return {
          count: result.value.papers.length,
          folders: result.value.folders.map(folder => ({
            id: folder.id,
            name: folder.name,
            count: countByFolder.get(folder.id) ?? 0,
          })),
          papers: result.value.papers.map(paper => ({
            id: paper.id,
            title: paper.title,
            ...(paper.year === null ? {} : { year: paper.year }),
            ...(paper.venue === null ? {} : { venue: paper.venue }),
            ...(paper.folderId === null ? {} : { folderId: paper.folderId }),
            ...(paper.url === null ? {} : { url: paper.url }),
          })),
        }
      },
    }))
  }
}

export default LiteratureFavoritesService
