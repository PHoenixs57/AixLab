/**
 * Pure types of the literature-attachments domain: the attached-paper wire
 * vocabulary and the `literature/attach` / `literature/detach` session-event
 * declarations. Client-safe: nothing here reaches a Host-only symbol, so a
 * Client compilation face reads the same event shapes the Host appends.
 *
 * @module @deepseek-ai/dsh-literature-attachments/types
 */

/** Stable identifiers of one attached paper; any subset may be present. */
export interface AttachedPaperIdentifiers {
  /** Digital Object Identifier, e.g. `10.1000/example.1`. */
  doi?: string
  /** PubMed identifier, digits only. */
  pmid?: string
  /** PubMed Central identifier, e.g. `PMC1234567`. */
  pmcid?: string
  /** arXiv identifier, e.g. `2001.01234`. */
  arxiv?: string
}

/**
 * One paper the user added to the conversation. `id` is the preferred stable
 * identifier (DOI, else PMID, else arXiv id); papers without any identifier
 * carry the `unknown:<title>` fallback, mirroring the favorites payload.
 */
export interface AttachedPaper {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  abstract: string | null
  url: string | null
  identifiers: AttachedPaperIdentifiers
}

/** Wire input for {@link AttachedPaper}; optional fields normalize to null. */
export type AttachedPaperInput = Omit<AttachedPaper, 'identifiers' | 'year' | 'venue' | 'abstract' | 'url'>
  & { year?: number | null; venue?: string | null; abstract?: string | null; url?: string | null; identifiers?: AttachedPaperIdentifiers }

/** Settled attach outcome: the committed paper plus whether it was already attached. */
export interface AttachResult {
  paper: AttachedPaper
  /** True when the same id was already attached (the call is idempotent). */
  alreadyAttached: boolean
}

/** Settled detach outcome: the removed id plus whether it was attached. */
export interface DetachResult {
  id: string
  /** False when no paper carried this id (the call is idempotent). */
  found: boolean
}

/** The papers one user message carried, keyed by that message's seq. */
export interface AttachedTurn {
  /** Source seq of the `user/message` event. */
  seq: number
  /** Attached papers (attach order) when the message was sent. */
  papers: readonly AttachedPaper[]
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * The user attached one paper to this conversation from the literature UI
     * (the plus on a paper card or a favorites row). Log-only, non-surface:
     * the details panel and the injected runtime context both fold it.
     * Whole-value add — attaching the same id again is a service-level
     * no-op, never a second event.
     */
    'literature/attach': { paper: AttachedPaper }
    /**
     * The user removed one attached paper by stable id. Log-only, non-surface;
     * a detach for an id that is not attached is a service-level no-op.
     */
    'literature/detach': { id: string }
  }
}
