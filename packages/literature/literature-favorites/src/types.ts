/**
 * Wire types for the durable literature-favorites sidecar: one bookmark
 * entry per saved paper plus one flat category folder per classification,
 * and the Remote request/result envelopes the client favorites panel
 * consumes.
 * @module @deepseek-ai/dsh-literature-favorites/types
 */

/**
 * One user-created category folder. Folders are single-level (a flat file
 * manager, not a tree): every paper sits in at most one folder, or in
 * "uncategorized" (`folderId: null`).
 */
export interface FavoriteFolder {
  /** Stable folder id (slug-derived; never shown to users). */
  id: string
  /** Display name; unique across folders (case-insensitive). */
  name: string
  /** Unix epoch ms when the folder was created. */
  createdAt: number
}

/**
 * Stable identifiers of one saved paper. Any subset may be present; the
 * field is optional because rows persisted before it existed lack the key.
 */
export interface FavoritePaperIdentifiers {
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
  /** Stable identifiers beyond `id`; absent on rows persisted before the field existed. */
  identifiers?: FavoritePaperIdentifiers
  /** Folder this paper is filed under; null = uncategorized. */
  folderId: string | null
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
  folders: FavoriteFolder[]
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

/** Unknown-folder failure: the request named a folder id the collection lacks. */
export interface FavoritesFolderNotFoundError {
  code: 'folder-not-found'
  id: string
}

/** Result of adding one paper. */
export type FavoritesAddResult =
  | FavoritesSuccess<FavoritePaper>
  | FavoritesRejected<FavoritesDuplicateError>
  | FavoritesRejected<FavoritesFolderNotFoundError>

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

/** One folder-create request. */
export interface FavoritesFolderCreateRequest {
  name: string
}

/** Invalid-name failure: the trimmed name is empty or too long. */
export interface FavoritesFolderNameError {
  code: 'invalid-name'
}

/** Duplicate-name failure: a folder with this name (case-insensitive) exists. */
export interface FavoritesDuplicateFolderError {
  code: 'duplicate-folder'
  name: string
}

/** Result of creating one folder. */
export type FavoritesFolderCreateResult =
  | FavoritesSuccess<FavoriteFolder>
  | FavoritesRejected<FavoritesFolderNameError>
  | FavoritesRejected<FavoritesDuplicateFolderError>

/** One folder-rename request. */
export interface FavoritesFolderRenameRequest {
  id: string
  name: string
}

/** Result of renaming one folder. */
export type FavoritesFolderRenameResult =
  | FavoritesSuccess<FavoriteFolder>
  | FavoritesRejected<FavoritesFolderNotFoundError>
  | FavoritesRejected<FavoritesFolderNameError>
  | FavoritesRejected<FavoritesDuplicateFolderError>

/** One folder-delete request; its papers move back to uncategorized. */
export interface FavoritesFolderDeleteRequest {
  id: string
}

/** Result of deleting one folder. */
export type FavoritesFolderDeleteResult =
  | FavoritesSuccess<{ removed: string }>
  | FavoritesRejected<FavoritesFolderNotFoundError>

/** One move request: file the paper under a folder (null = uncategorized). */
export interface FavoritesMoveRequest {
  id: string
  folderId: string | null
}

/** Result of moving one paper. */
export type FavoritesMoveResult =
  | FavoritesSuccess<{ moved: string; folderId: string | null }>
  | FavoritesRejected<FavoritesNotFoundError>
  | FavoritesRejected<FavoritesFolderNotFoundError>
