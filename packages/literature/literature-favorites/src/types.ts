/**
 * Wire types for the durable literature-favorites sidecar: one bookmark
 * entry per saved paper, plus the Remote request/result envelopes the
 * client favorites panel consumes.
 * @module @deepseek-ai/dsh-literature-favorites/types
 */

/**
 * One saved paper. `id` is the deduplication key: the DOI when present
 * (preferred), else the PMID, else the arXiv id — written by the caller and
 * never synthesized by the service.
 */
export interface FavoritePaper {
  /** Stable identifier: DOI / PMID / arXiv id. */
  id: string
  title: string
  authors: string[]
  /** Publication year, or null when the source does not carry one. */
  year: number | null
  /** Journal / conference / preprint server name, or null. */
  venue: string | null
  /** Provider-supplied abstract or summary, or null. */
  abstract: string | null
  /** Canonical landing page, or null. */
  url: string | null
  /** Unix epoch ms when the bookmark was created. */
  addedAt: number
}

/** Success branch shared by every favorites Remote call. */
export interface FavoritesSuccess<T> {
  ok: true
  value: T
}

/** Business-failure branch shared by every favorites Remote call. */
export interface FavoritesRejected<E> {
  ok: false
  error: E
}

/** Whole-collection value of {@link FavoritesListResult}. */
export interface FavoritesListValue {
  papers: FavoritePaper[]
}

/** Result of listing the collection (no business failure modes). */
export type FavoritesListResult = FavoritesSuccess<FavoritesListValue>

/** One bookmark request: the paper minus the service-owned timestamp. */
export type FavoritesAddRequest = Omit<FavoritePaper, 'addedAt'>

/** Duplicate-id failure: the collection already holds this paper. */
export interface FavoritesDuplicateError {
  code: 'duplicate'
  id: string
}

/** Result of adding one paper. */
export type FavoritesAddResult =
  | FavoritesSuccess<FavoritePaper>
  | FavoritesRejected<FavoritesDuplicateError>

/** One unbookmark request by stable id. */
export interface FavoritesRemoveRequest {
  id: string
}

/** Unknown-id failure: the collection does not hold this paper. */
export interface FavoritesNotFoundError {
  code: 'not-found'
  id: string
}

/** Result of removing one paper. */
export type FavoritesRemoveResult =
  | FavoritesSuccess<{ removed: string }>
  | FavoritesRejected<FavoritesNotFoundError>
