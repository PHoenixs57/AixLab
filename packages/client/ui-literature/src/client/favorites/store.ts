/**
 * Browser-local observable over the durable literature favorites Remote.
 * One module-level store (the collection is global, not per-session) backs
 * every star toggle and the sidebar panel; mutations go through the Host
 * Remote and the store re-reads nothing — it applies the committed reply.
 * @module
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  FavoriteFolder,
  FavoritePaper,
  FavoritesAddResult,
  FavoritesFolderCreateResult,
  FavoritesFolderDeleteResult,
  FavoritesFolderRenameResult,
  FavoritesListResult,
  FavoritesMoveResult,
  FavoritesRemoveResult,
} from '@deepseek-ai/dsh-literature-favorites/types'

/** The Remote calls this store needs. */
export interface FavoritesRemote {
  list: () => Promise<RemoteResult<FavoritesListResult>>
  add: (request: Omit<FavoritePaper, 'addedAt'>) => Promise<RemoteResult<FavoritesAddResult>>
  delete: (request: { id: string }) => Promise<RemoteResult<FavoritesRemoveResult>>
  folderCreate: (request: { name: string }) => Promise<RemoteResult<FavoritesFolderCreateResult>>
  folderRename: (request: { id: string; name: string }) => Promise<RemoteResult<FavoritesFolderRenameResult>>
  folderDelete: (request: { id: string }) => Promise<RemoteResult<FavoritesFolderDeleteResult>>
  move: (request: { id: string; folderId: string | null }) => Promise<RemoteResult<FavoritesMoveResult>>
}

/** Immutable view handed to subscribers. */
export interface FavoritesView {
  status: 'cold' | 'loading' | 'ready' | 'error'
  folders: readonly FavoriteFolder[]
  papers: readonly FavoritePaper[]
}

const COLD: FavoritesView = { status: 'cold', folders: [], papers: [] }

/** Unwrap one carrier envelope (transport failure = rejection). */
function carrier<T>(result: RemoteResult<T>): T {
  if (!result.ok) {
    throw new Error('favorites remote unreachable')
  }
  return result.value
}

/**
 * Global favorites store. `attach` must run before any read; every method
 * after that tolerates a missing remote by failing loud (the panel then
 * shows the error state).
 */
export class FavoritesStore {
  private view: FavoritesView = COLD
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<void> | null = null
  private remote: FavoritesRemote | null = null
  private operationTail: Promise<void> = Promise.resolve()

  /**
   * Bind the generated Remote namespace (called once from plugin apply).
   * @param remote - the mounted favorites Remote namespace.
   */
  attach(remote: FavoritesRemote): void {
    this.remote = remote
  }

  /** Return the cached immutable view. */
  getSnapshot = (): FavoritesView => this.view

  /** Subscribe to view replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: FavoritesView): void {
    this.view = next
    for (const listener of this.listeners) listener()
  }

  private requireRemote(): FavoritesRemote {
    if (this.remote === null) {
      throw new Error('favorites: remote not attached')
    }
    return this.remote
  }

  /** Load once; concurrent callers share the in-flight read. */
  ensure(): Promise<void> {
    if (this.view.status === 'ready' || this.view.status === 'loading') {
      return this.loadPromise ?? Promise.resolve()
    }
    return this.refresh()
  }

  /** Re-read the authoritative collection. */
  refresh(): Promise<void> {
    if (this.loadPromise !== null) return this.loadPromise
    this.publish({ status: 'loading', folders: this.view.folders, papers: this.view.papers })
    const pending = this.requireRemote().list()
      .then(carrier)
      .then((business) => {
        // `list` has no business failure branch; only transport can throw.
        this.publish({
          status: 'ready',
          folders: business.value.folders,
          papers: business.value.papers,
        })
      })
      .catch(() => { this.publish({ status: 'error', folders: this.view.folders, papers: this.view.papers }) })
    this.loadPromise = pending
    return pending.finally(() => { this.loadPromise = null })
  }

  /** Drop the cached view (reconnect / panel remount). */
  resync(): void {
    this.view = COLD
    this.loadPromise = null
    void this.ensure()
  }

  /**
   * Whether one paper id is currently bookmarked.
   * @param id - the stable identifier to look up.
   * @returns true when the collection holds the id.
   */
  isSaved(id: string | null): boolean {
    if (id === null || this.view.status !== 'ready') return false
    return this.view.papers.some(paper => paper.id === id)
  }

  /**
   * Bookmark one paper under a folder, then apply the committed reply.
   * @param paper - the paper to save (id = DOI / PMID / arXiv id).
   * @param folderId - target folder id, or null for uncategorized.
   * @returns resolves when the Host has committed the mutation.
   */
  add(paper: Omit<FavoritePaper, 'addedAt' | 'folderId'>, folderId: string | null): Promise<void> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().add({ ...paper, folderId }))
      if (!result.ok) throw new Error(`favorites add failed: ${result.error.code}`)
      const view = this.view
      this.publish({ status: 'ready', folders: view.folders, papers: [...view.papers, result.value] })
    })
  }

  /**
   * Remove one bookmarked paper by id (star un-toggle / panel delete button).
   * @param id - the stable identifier of the paper to unbookmark.
   */
  remove(id: string): Promise<void> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().delete({ id }))
      if (!result.ok) throw new Error(`favorites remove failed: ${result.error.code}`)
      const view = this.view
      this.publish({ status: 'ready', folders: view.folders, papers: view.papers.filter(saved => saved.id !== id) })
    })
  }

  /**
   * Create one category folder; resolves with the committed folder.
   * @param name - the folder display name.
   * @returns the committed folder.
   */
  createFolder(name: string): Promise<FavoriteFolder> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().folderCreate({ name }))
      if (!result.ok) throw new Error(`favorites folder create failed: ${result.error.code}`)
      const view = this.view
      this.publish({ status: 'ready', folders: [...view.folders, result.value], papers: view.papers })
      return result.value
    })
  }

  /**
   * Rename one folder by id.
   * @param id - the folder id to rename.
   * @param name - the new display name.
   */
  renameFolder(id: string, name: string): Promise<void> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().folderRename({ id, name }))
      if (!result.ok) throw new Error(`favorites folder rename failed: ${result.error.code}`)
      const view = this.view
      this.publish({
        status: 'ready',
        folders: view.folders.map(folder => folder.id === id ? result.value : folder),
        papers: view.papers,
      })
    })
  }

  /**
   * Delete one folder by id; its papers move back to uncategorized.
   * @param id - the folder id to delete.
   */
  deleteFolder(id: string): Promise<void> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().folderDelete({ id }))
      if (!result.ok) throw new Error(`favorites folder delete failed: ${result.error.code}`)
      const view = this.view
      this.publish({
        status: 'ready',
        folders: view.folders.filter(folder => folder.id !== id),
        papers: view.papers.map(paper => paper.folderId === id ? { ...paper, folderId: null } : paper),
      })
    })
  }

  /**
   * File one paper under a folder (null = uncategorized).
   * @param id - the stable identifier of the paper to move.
   * @param folderId - the target folder id, or null for uncategorized.
   */
  move(id: string, folderId: string | null): Promise<void> {
    return this.serialize(async () => {
      await this.ensure()
      const result = carrier(await this.requireRemote().move({ id, folderId }))
      if (!result.ok) throw new Error(`favorites move failed: ${result.error.code}`)
      const view = this.view
      this.publish({
        status: 'ready',
        folders: view.folders,
        papers: view.papers.map(paper => paper.id === id ? { ...paper, folderId: result.value.folderId } : paper),
      })
    })
  }

  /** Run one mutation behind the prior one (Remote mutations must not interleave). */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationTail.then(operation, operation)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }
}

/** The one module-level store every star toggle and the panel share. */
export const favoritesStore = new FavoritesStore()
