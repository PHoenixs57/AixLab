/**
 * Browser-local observable over the durable literature favorites Remote.
 * One module-level store (the collection is global, not per-session) backs
 * every star toggle and the sidebar panel; mutations go through the Host
 * Remote and the store re-reads nothing — it applies the committed reply.
 * @module
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  FavoritePaper,
  FavoritesAddResult,
  FavoritesListResult,
  FavoritesRemoveResult,
} from '@deepseek-ai/dsh-literature-favorites/types'

/** The three Remote calls this store needs. */
export interface FavoritesRemote {
  list: () => Promise<RemoteResult<FavoritesListResult>>
  add: (request: Omit<FavoritePaper, 'addedAt'>) => Promise<RemoteResult<FavoritesAddResult>>
  delete: (request: { id: string }) => Promise<RemoteResult<FavoritesRemoveResult>>
}

/** Immutable view handed to subscribers. */
export interface FavoritesView {
  status: 'cold' | 'loading' | 'ready' | 'error'
  papers: readonly FavoritePaper[]
}

const COLD: FavoritesView = { status: 'cold', papers: [] }

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

  /** Bind the generated Remote namespace (called once from plugin apply). */
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

  /** Re-read the authoritative list. */
  refresh(): Promise<void> {
    if (this.loadPromise !== null) return this.loadPromise
    this.publish({ status: 'loading', papers: this.view.papers })
    const pending = this.requireRemote().list()
      .then(carrier)
      .then((business) => {
        if (!business.ok) throw new Error('favorites list failed')
        this.publish({ status: 'ready', papers: business.value.papers })
      })
      .catch(() => { this.publish({ status: 'error', papers: this.view.papers }) })
    this.loadPromise = pending
    return pending.finally(() => { this.loadPromise = null })
  }

  /** Drop the cached view (reconnect / panel remount). */
  resync(): void {
    this.view = COLD
    this.loadPromise = null
    void this.ensure()
  }

  /** Whether one paper id is currently bookmarked. */
  isSaved(id: string | null): boolean {
    if (id === null || this.view.status !== 'ready') return false
    return this.view.papers.some(paper => paper.id === id)
  }

  /**
   * Bookmark or unbookmark one paper, then apply the committed reply.
   * @param paper - the paper to toggle (id = DOI / PMID / arXiv id).
   * @returns resolves when the Host has committed the mutation.
   */
  toggle(paper: Omit<FavoritePaper, 'addedAt'>): Promise<void> {
    const run = async (): Promise<void> => {
      await this.ensure()
      const remote = this.requireRemote()
      if (this.isSaved(paper.id)) {
        const result = carrier(await remote.delete({ id: paper.id }))
        if (!result.ok) throw new Error(`favorites remove failed: ${result.error.code}`)
        const papers = this.view.papers.filter(saved => saved.id !== paper.id)
        this.publish({ status: 'ready', papers })
        return
      }
      const result = carrier(await remote.add(paper))
      if (!result.ok) throw new Error(`favorites add failed: ${result.error.code}`)
      const papers = [...this.view.papers, result.value]
      this.publish({ status: 'ready', papers })
    }
    const next = this.operationTail.then(run, run)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }

  /** Remove one bookmarked paper by id (panel delete button). */
  remove(id: string): Promise<void> {
    const run = async (): Promise<void> => {
      await this.ensure()
      const result = carrier(await this.requireRemote().delete({ id }))
      if (!result.ok) throw new Error(`favorites remove failed: ${result.error.code}`)
      const papers = this.view.papers.filter(saved => saved.id !== id)
      this.publish({ status: 'ready', papers })
    }
    const next = this.operationTail.then(run, run)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }
}

/** The one module-level store every star toggle and the panel share. */
export const favoritesStore = new FavoritesStore()
