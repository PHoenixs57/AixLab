/**
 * Durable per-user literature favorites for AixLab.
 *
 * Host half: a Typert Remote service (the favorites panel's `list` / `add` /
 * `remove` face) over one global storage-domain row, plus three model-facing
 * tools (`literature_favorites_add` / `_remove` / `_list`) so the agent can
 * bookmark papers the user asks for.
 * @module @deepseek-ai/dsh-literature-favorites
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { GLOBAL_ROW_KEY, literatureFavoritesDomainSpec } from './spec.ts'
import type { FavoritesRow } from './spec.ts'
import type {
  FavoritePaper,
  FavoritesAddRequest,
  FavoritesAddResult,
  FavoritesDuplicateError,
  FavoritesListResult,
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

/** Frozen empty collection reused as an input to caller-owned copying. */
const EMPTY_PAPERS: readonly FavoritePaper[] = Object.freeze([])

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
  return Object.freeze({
    id: paper.id,
    title: paper.title,
    authors: Object.freeze([...paper.authors]),
    year: paper.year,
    venue: paper.venue,
    abstract: paper.abstract,
    url: paper.url,
    addedAt: paper.addedAt,
  }) as FavoritePaper
}

/** Copy and freeze a whole-collection value. */
function snapshotPapers(papers: readonly FavoritePaper[]): FavoritePaper[] {
  return Object.freeze(papers.map(snapshotPaper)) as FavoritePaper[]
}

/** Trim and validate one add request into a storable entry. */
function toEntry(request: FavoritesAddRequest): FavoritePaper {
  const id = request.id.trim()
  const title = request.title.trim()
  if (id.length === 0) throw new Error('literature_favorites_add: `id` must be a non-empty string')
  if (title.length === 0) throw new Error('literature_favorites_add: `title` must be a non-empty string')
  return {
    id,
    title,
    authors: request.authors.map(author => author.trim()).filter(author => author !== ''),
    year: request.year ?? null,
    venue: request.venue?.trim() || null,
    abstract: request.abstract?.trim() || null,
    url: request.url?.trim() || null,
    addedAt: Date.now(),
  }
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

  /** Read the current frozen collection. */
  private read(): FavoritePaper[] {
    const row = this.requireTable().get(GLOBAL_ROW_KEY)
    return row === undefined ? [...EMPTY_PAPERS] : row.papers.map(snapshotPaper)
  }

  /** Persist a frozen whole-collection replacement. */
  private write(papers: readonly FavoritePaper[]): Promise<void> {
    return this.requireTable().put(GLOBAL_ROW_KEY, Object.freeze({ papers: snapshotPapers(papers) }))
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

  /**
   * List the whole collection, newest first.
   * @returns the current frozen collection.
   */
  @Remote('list')
  list(): Promise<FavoritesListResult> {
    const papers = this.read().sort((left, right) => right.addedAt - left.addedAt)
    return Promise.resolve(success({ papers: snapshotPapers(papers) }))
  }

  /**
   * Bookmark one paper. A duplicate id is a business failure, not a silent
   * no-op, so the panel can tell the user "already saved".
   * @param request - the paper to save (id = DOI / PMID / arXiv id).
   * @returns the committed entry or an explicit duplicate failure.
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
      const papers = this.read()
      if (papers.some(paper => paper.id === entry.id)) {
        return rejected<FavoritesDuplicateError>({ code: 'duplicate', id: entry.id })
      }
      await this.write([...papers, entry])
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
      const papers = this.read()
      if (!papers.some(paper => paper.id === id)) {
        return rejected<FavoritesNotFoundError>({ code: 'not-found', id })
      }
      await this.write(papers.filter(paper => paper.id !== id))
      return success({ removed: id })
    })
  }

  /** Register the three model-facing bookmark tools. */
  private registerTools(): void {
    const tools = this.ctx.tools
    tools.register(defineTool({
      name: 'literature_favorites_add',
      description: 'Bookmark one paper into the user\'s durable literature favorites. '
        + '`id` is the stable identifier — the DOI when present, else the PMID, else the arXiv id. '
        + 'Use it whenever the user asks to save / bookmark / 收藏 a paper you retrieved; '
        + 'never bookmark a paper you did not retrieve from a search result.',
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
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            title: { type: 'string', required: true },
            addedAt: { type: 'integer', required: true },
          },
        },
        render: (_args, value: { id: string; title: string }) => [{
          type: 'text',
          text: `Bookmarked: ${value.title} (${value.id})`,
        }],
      },
      execute: async (args) => {
        const result = await this.add({
          id: args.id,
          title: args.title,
          authors: args.authors,
          year: args.year ?? null,
          venue: args.venue ?? null,
          abstract: args.abstract ?? null,
          url: args.url ?? null,
        })
        if (!result.ok) {
          throw new Error(`already bookmarked under id ${result.error.id}; use literature_favorites_list to confirm`)
        }
        return { id: result.value.id, title: result.value.title, addedAt: result.value.addedAt }
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
      description: 'List the user\'s bookmarked papers, newest first. Use it when the user asks '
        + 'what is saved (我的收藏 / favorites) or before reporting which papers are bookmarked.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            count: { type: 'integer', required: true },
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
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value: { count: number; papers: { id: string; title: string }[] }) => [{
          type: 'text',
          text: value.count === 0
            ? 'Favorites is empty.'
            : `Favorites (${value.count}):\n${value.papers.map((paper, i) => `${i + 1}. ${paper.title} (${paper.id})`).join('\n')}`,
        }],
      },
      execute: async () => {
        const result = await this.list()
        return {
          count: result.value.papers.length,
          papers: result.value.papers.map(paper => ({
            id: paper.id,
            title: paper.title,
            ...(paper.year === null ? {} : { year: paper.year }),
            ...(paper.venue === null ? {} : { venue: paper.venue }),
            ...(paper.url === null ? {} : { url: paper.url }),
          })),
        }
      },
    }))
  }
}

export default LiteratureFavoritesService
