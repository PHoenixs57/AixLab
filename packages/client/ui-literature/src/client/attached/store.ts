/**
 * Browser-local observable over the per-session literature-attachments
 * Remote. One module-level store (mirroring the favorites store) backs the
 * add-to-conversation plus on paper cards and favorites rows; state is keyed
 * by session id and every mutation goes through the Host Remote, applying
 * the committed reply. The Host's session log stays the authoritative store
 * — this cache only mirrors it for rendering.
 * @module
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachedPaper,
  AttachedPaperInput,
  AttachResult,
  DetachResult,
} from '@deepseek-ai/dsh-literature-attachments/types'
import type { AttachedTurn } from '@deepseek-ai/dsh-literature-attachments'

/** The Remote calls this store needs. */
export interface AttachedPapersRemote {
  attach: (sessionId: SessionId, paper: AttachedPaperInput) => Promise<RemoteResult<AttachResult>>
  detach: (sessionId: SessionId, id: string) => Promise<RemoteResult<DetachResult>>
  list: (sessionId: SessionId) => Promise<RemoteResult<readonly AttachedPaper[]>>
  byTurn: (sessionId: SessionId) => Promise<RemoteResult<readonly AttachedTurn[]>>
}

/** Per-session load state carried in the immutable view. */
export interface AttachedSessionState {
  status: 'loading' | 'ready' | 'error'
  /** Papers attached now and not yet consumed by a sent message. */
  papers: readonly AttachedPaper[]
  /** Papers each user message carried, keyed by that message's seq. */
  byTurn: ReadonlyMap<number, readonly AttachedPaper[]>
}

/** Read-only observable over one session's attached set (stable identity per session). */
export interface AttachedSessionSource {
  getSnapshot: () => AttachedSessionState
  subscribe: (listener: () => void) => () => void
}

/** Immutable view handed to subscribers. */
export interface AttachedPapersView {
  sessions: Readonly<Record<string, AttachedSessionState>>
}

const EMPTY: AttachedPapersView = { sessions: {} }

/** Absent state before the first read (stable identity for selector hooks). */
const UNLOADED: AttachedSessionState = { status: 'loading', papers: [], byTurn: new Map() }

const EMPTY_TURNS: ReadonlyMap<number, readonly AttachedPaper[]> = new Map()

/** Fold the byTurn reply into a seq-keyed map. */
function turnsOf(reply: readonly AttachedTurn[]): ReadonlyMap<number, readonly AttachedPaper[]> {
  return new Map(reply.map(turn => [turn.seq, turn.papers]))
}

/** Unwrap one carrier envelope (transport failure = rejection). */
function carrier<T>(result: RemoteResult<T>): T {
  if (!result.ok) {
    throw new Error('literature attachments remote unreachable')
  }
  return result.value
}

/**
 * Global attached-papers store. `attach` must run before any read; every
 * method after that tolerates a missing remote by failing loud.
 */
export class AttachedPapersStore {
  private view: AttachedPapersView = EMPTY
  private readonly listeners = new Set<() => void>()
  private readonly loads = new Map<string, Promise<void>>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly sessionSources = new Map<string, AttachedSessionSource>()
  private remote: AttachedPapersRemote | null = null

  /**
   * Bind the generated Remote namespace (called once from plugin apply).
   * @param remote - the mounted attached-papers Remote namespace.
   */
  attach(remote: AttachedPapersRemote): void {
    this.remote = remote
  }

  /** Return the cached immutable view. */
  getSnapshot = (): AttachedPapersView => this.view

  /** Subscribe to view replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: AttachedPapersView): void {
    this.view = next
    for (const listener of this.listeners) listener()
  }

  private requireRemote(): AttachedPapersRemote {
    if (this.remote === null) {
      throw new Error('literature attachments: remote not attached')
    }
    return this.remote
  }

  /**
   * State for one session, or undefined before the first read.
   * @param sessionId - the session whose state to read.
   * @returns the cached state, or undefined while never loaded.
   */
  stateOf(sessionId: SessionId): AttachedSessionState | undefined {
    return this.view.sessions[sessionId]
  }

  /**
   * Read-only observable over one session's attached set. The returned source
   * keeps one identity per session and serves the standard-kit selector-hook
   * binding (the session-scope context strip).
   * @param sessionId - the session to observe.
   * @returns a stable source whose snapshot tracks the committed view.
   */
  sessionSource(sessionId: SessionId): AttachedSessionSource {
    const known = this.sessionSources.get(sessionId)
    if (known !== undefined) return known
    const source: AttachedSessionSource = {
      getSnapshot: () => this.view.sessions[sessionId] ?? UNLOADED,
      subscribe: (listener) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
      },
    }
    this.sessionSources.set(sessionId, source)
    return source
  }

  /**
   * Load one session's attached set once; concurrent callers share the in-flight read.
   * @param sessionId - the session whose attached set to load.
   */
  ensure(sessionId: SessionId): Promise<void> {
    const known = this.view.sessions[sessionId]
    if (known !== undefined) return this.loads.get(sessionId) ?? Promise.resolve()
    const pending = this.loads.get(sessionId)
    if (pending !== undefined) return pending
    this.publish({ sessions: { ...this.view.sessions, [sessionId]: { status: 'loading', papers: [], byTurn: EMPTY_TURNS } } })
    const load = this.fetch(sessionId)
    this.loads.set(sessionId, load)
    return load.finally(() => { this.loads.delete(sessionId) })
  }

  /**
   * Re-read one session's attached set (pending papers plus per-turn papers),
   * replacing the cached view — used after a turn consumes the pending set.
   * @param sessionId - the session to refresh.
   */
  refresh(sessionId: SessionId): Promise<void> {
    return this.fetch(sessionId)
  }

  /** Fetch pending papers and per-turn papers, then publish one ready state. */
  private fetch(sessionId: SessionId): Promise<void> {
    const remote = this.requireRemote()
    return Promise.all([remote.list(sessionId), remote.byTurn(sessionId)])
      .then(([papers, turns]) => [papers, turns] as const)
      .then(([papers, turns]) => {
        this.publish({
          sessions: {
            ...this.view.sessions,
            [sessionId]: { status: 'ready', papers: carrier(papers), byTurn: turnsOf(carrier(turns)) },
          },
        })
      })
      .catch(() => {
        this.publish({
          sessions: {
            ...this.view.sessions,
            [sessionId]: { status: 'error', papers: [], byTurn: EMPTY_TURNS },
          },
        })
      })
  }

  /**
   * Whether one paper id is attached to one session (before the first read: false).
   * @param sessionId - the session to check.
   * @param id - the stable identifier to look up.
   * @returns true when the session's cached attached set holds the id.
   */
  isAttached(sessionId: SessionId, id: string | null): boolean {
    if (id === null) return false
    return this.view.sessions[sessionId]?.papers.some(paper => paper.id === id) ?? false
  }

  /**
   * Attach one paper to one session, then apply the committed reply.
   * @param sessionId - the receiving session.
   * @param paper - the paper to attach (id = DOI / PMID / arXiv id).
   * @returns resolves when the Host has committed the attach event.
   */
  attachPaper(sessionId: SessionId, paper: AttachedPaperInput): Promise<void> {
    return this.serialize(sessionId, async () => {
      await this.ensure(sessionId)
      const result = carrier(await this.requireRemote().attach(sessionId, paper))
      if (result.alreadyAttached) return
      const state = this.view.sessions[sessionId]
      this.publish({
        sessions: {
          ...this.view.sessions,
          [sessionId]: {
            status: 'ready',
            papers: [...(state?.papers ?? []), result.paper],
            byTurn: state?.byTurn ?? EMPTY_TURNS,
          },
        },
      })
    })
  }

  /**
   * Remove one attached paper from one session, then apply the committed reply.
   * @param sessionId - the receiving session.
   * @param id - the stable identifier used when the paper was attached.
   * @returns resolves when the Host has committed the detach event.
   */
  detachPaper(sessionId: SessionId, id: string): Promise<void> {
    return this.serialize(sessionId, async () => {
      await this.ensure(sessionId)
      carrier(await this.requireRemote().detach(sessionId, id))
      const state = this.view.sessions[sessionId]
      this.publish({
        sessions: {
          ...this.view.sessions,
          [sessionId]: {
            status: 'ready',
            papers: (state?.papers ?? []).filter(paper => paper.id !== id),
            byTurn: state?.byTurn ?? EMPTY_TURNS,
          },
        },
      })
    })
  }

  /** Drop the cached view (reconnect / session list change). */
  resync(): void {
    this.view = EMPTY
    this.loads.clear()
  }

  /** Run one mutation behind the prior one for the same session (Remote mutations must not interleave). */
  private serialize(sessionId: SessionId, operation: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve()
    const next = previous.then(operation, operation)
    const tail = next.then(() => undefined, () => undefined)
    this.tails.set(sessionId, tail)
    return next.finally(() => {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId)
    })
  }
}

/** The one module-level store every plus toggle and the panels share. */
export const attachedPapersStore = new AttachedPapersStore()
