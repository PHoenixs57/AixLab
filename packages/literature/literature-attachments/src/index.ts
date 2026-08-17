/**
 * Per-session literature attachments for deepseek-aix.
 *
 * Host half: a Typert Remote service (`literatureAttachments`) plus a dynamic
 * prompt context. Papers the user attaches from the literature UI are logged
 * as `literature/attach` / `literature/detach` session events — the session
 * log is the only store, so the set survives restarts, replays identically,
 * and stays reconstructable from the log alone. Every model request folds the
 * events into the `literature:attached` runtime context, which carries each
 * paper's metadata and the deep-reading instruction
 * (`mcp__literature__literature_get_fulltext` with pmcid / pmid / doi).
 * @module @deepseek-ai/dsh-literature-attachments
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { foldAttachedByTurn, foldAttachedPapers, renderAttachedContext } from './context.ts'
import type { AttachedRenderBudget } from './context.ts'
import type {
  AttachedPaper,
  AttachedPaperIdentifiers,
  AttachedPaperInput,
  AttachedTurn,
  AttachResult,
  DetachResult,
} from './types.ts'

export type * from './types.ts'
export { foldAttachedByTurn, foldAttachedPapers, renderAttachedContext }
export type { AttachedRenderBudget }

declare module '@deepseek-ai/cordis' {
  interface Context {
    literatureAttachments: LiteratureAttachmentsService
  }
}

/** Deployment-owned rendering bounds with their defaults. */
export interface LiteratureAttachmentsConfig {
  /** Longest number of papers listed in the injected context. */
  maxPapers?: number
  /** Complete byte bound of the injected context (header included). */
  maxBytes?: number
}

/** Default paper count: plenty for one conversation, small for the prompt. */
export const DEFAULT_MAX_PAPERS = 24
/** Default complete context bound (16 KiB). */
export const DEFAULT_MAX_BYTES = 16384
/** Hard cap on the configurable paper count. */
export const MAX_PAPERS = 1000
/** Smallest accepted context bound: still room for the header and one entry. */
export const MIN_MAX_BYTES = 1024

/** Prompt order of the attached-papers context (after approval:policy 115, subagent:delegation 120). */
const CONTEXT_ORDER = 130

/** Wire schema for one attached paper's stable identifiers. */
const identifiersSchema = z.object({
  doi: z.string().trim().max(128).optional(),
  pmid: z.string().trim().max(128).optional(),
  pmcid: z.string().trim().max(128).optional(),
  arxiv: z.string().trim().max(128).optional(),
})

/** Wire schema for the attach request; optional fields normalize to null. */
const attachedPaperInputSchema = z.object({
  id: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(1024),
  authors: z.array(z.string().max(256)).max(64),
  year: z.number().int().nonnegative().max(9999).nullable().optional(),
  venue: z.string().max(512).nullable().optional(),
  abstract: z.string().max(65536).nullable().optional(),
  url: z.string().max(2048).nullable().optional(),
  identifiers: identifiersSchema.optional(),
})

/**
 * Validate the deployment-owned rendering bounds; invalid values fail at load.
 * @param config - raw plugin config.
 * @returns the resolved bounds.
 */
export function resolveConfig(config: LiteratureAttachmentsConfig): Required<LiteratureAttachmentsConfig> {
  const { maxPapers, maxBytes } = config
  if (maxPapers !== undefined && (!Number.isSafeInteger(maxPapers) || maxPapers <= 0 || maxPapers > MAX_PAPERS)) {
    throw new Error(`literature-attachments: maxPapers must be an integer in 1..${MAX_PAPERS}, got ${String(maxPapers)}`)
  }
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < MIN_MAX_BYTES)) {
    throw new Error(`literature-attachments: maxBytes must be an integer >= ${MIN_MAX_BYTES}, got ${String(maxBytes)}`)
  }
  return {
    maxPapers: maxPapers ?? DEFAULT_MAX_PAPERS,
    maxBytes: maxBytes ?? DEFAULT_MAX_BYTES,
  }
}

/** Trim and validate one attach request into a frozen, storable paper. */
function normalizeInput(input: AttachedPaperInput): AttachedPaper {
  const parsed = attachedPaperInputSchema.parse(input)
  const identifiers: AttachedPaperIdentifiers = Object.freeze({
    ...parsed.identifiers?.doi !== undefined && parsed.identifiers.doi !== '' ? { doi: parsed.identifiers.doi } : {},
    ...parsed.identifiers?.pmid !== undefined && parsed.identifiers.pmid !== '' ? { pmid: parsed.identifiers.pmid } : {},
    ...parsed.identifiers?.pmcid !== undefined && parsed.identifiers.pmcid !== '' ? { pmcid: parsed.identifiers.pmcid } : {},
    ...parsed.identifiers?.arxiv !== undefined && parsed.identifiers.arxiv !== '' ? { arxiv: parsed.identifiers.arxiv } : {},
  })
  return Object.freeze({
    id: parsed.id.trim(),
    title: parsed.title.trim(),
    authors: Object.freeze(parsed.authors.map(author => author.trim()).filter(author => author !== '')),
    year: parsed.year ?? null,
    venue: parsed.venue?.trim() || null,
    abstract: parsed.abstract?.trim() || null,
    url: parsed.url?.trim() || null,
    identifiers,
  }) as AttachedPaper
}

/**
 * Log-backed per-session attachment service: validates attach requests,
 * appends the paired session events, and renders the injected context.
 */
export class LiteratureAttachmentsService extends TypertRemoteService {
  static inject = ['systemPrompt']

  private readonly budget: AttachedRenderBudget
  private readonly tails = new WeakMap<Session, Promise<void>>()

  /**
   * @param ctx - Host context carrying the system-prompt registry.
   * @param config - rendering bounds (validated by {@link resolveConfig}).
   */
  constructor(ctx: Context, config: LiteratureAttachmentsConfig = {}) {
    super(ctx, 'literatureAttachments')
    this.budget = resolveConfig(config)
    ctx.systemPrompt.context({
      name: 'literature:attached',
      order: CONTEXT_ORDER,
      text: (assembly) => {
        // A bare assemble() (tests, diagnostics) has no agent to fold.
        const agent = assembly.agent
        if (agent === undefined) return ''
        return renderAttachedContext(foldAttachedPapers(agent.session.events), this.budget)
      },
    })
    // Per-message semantics: the papers attached before a turn are injected
    // into that turn's requests, then consumed when the turn closes so the
    // next message starts with an empty attached set. `agent/turn-stopping`
    // fires before the boundary commits, so the detach appends never reenter
    // a session append.
    ctx.on('agent/turn-stopping', ({ agent }) => {
      this.consumeTurn(agent)
    })
  }

  /**
   * Attach one paper to the calling agent's conversation. Attaching the same
   * stable id again is idempotent and logs nothing.
   * @param agent - the receiving agent whose session logs the attach.
   * @param input - the paper to attach (id = DOI / PMID / arXiv id).
   * @returns the committed paper and whether it was already attached.
   */
  @Remote('attach')
  attach(agent: Agent, input: AttachedPaperInput): Promise<AttachResult> {
    return this.enqueue(agent.session, () => {
      const paper = normalizeInput(input)
      const attached = foldAttachedPapers(agent.session.events)
      if (attached.some(candidate => candidate.id === paper.id)) {
        return { paper, alreadyAttached: true }
      }
      agent.session.append('literature/attach', { paper })
      return { paper, alreadyAttached: false }
    })
  }

  /**
   * Remove one attached paper by stable id. Removing an id that is not
   * attached is idempotent and logs nothing.
   * @param agent - the receiving agent whose session logs the detach.
   * @param id - the stable identifier used when the paper was attached.
   * @returns the removed id and whether it was attached.
   */
  @Remote('detach')
  detach(agent: Agent, id: string): Promise<DetachResult> {
    const trimmed = id.trim()
    if (trimmed === '') {
      return Promise.reject(new Error('literatureAttachments.detach: `id` must be a non-empty string'))
    }
    return this.enqueue(agent.session, () => {
      const attached = foldAttachedPapers(agent.session.events)
      if (!attached.some(paper => paper.id === trimmed)) {
        return { id: trimmed, found: false }
      }
      agent.session.append('literature/detach', { id: trimmed })
      return { id: trimmed, found: true }
    })
  }

  /**
   * List the calling agent's currently attached papers in attach order.
   * @param agent - the receiving agent whose session log is folded.
   * @returns the frozen current attached set.
   */
  @Remote('list')
  list(agent: Agent): Promise<readonly AttachedPaper[]> {
    return Promise.resolve(Object.freeze(foldAttachedPapers(agent.session.events)))
  }

  /**
   * List the papers each user message carried, keyed by that message's seq.
   * Consumed papers stay visible here so the UI can render them under the
   * message that sent them.
   * @param agent - the receiving agent whose session log is folded.
   * @returns one frozen entry per user message that carried papers.
   */
  @Remote('byTurn')
  byTurn(agent: Agent): Promise<readonly AttachedTurn[]> {
    return Promise.resolve(foldAttachedByTurn(agent.session.events))
  }

  /** Append one detach event per currently-attached paper (per-message consumption). */
  private consumeTurn(agent: Agent): void {
    const papers = foldAttachedPapers(agent.session.events)
    for (const paper of papers) {
      agent.session.append('literature/detach', { id: paper.id })
    }
  }

  /** Run one mutation behind the prior one for the same session (Remote mutations must not interleave). */
  private enqueue<T>(session: Session, operation: () => T | Promise<T>): Promise<T> {
    const previous = this.tails.get(session) ?? Promise.resolve()
    const result = previous.then(operation)
    const next = result.then(() => undefined, () => undefined)
    this.tails.set(session, next)
    return result
  }
}

export default LiteratureAttachmentsService
