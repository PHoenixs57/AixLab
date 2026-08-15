/**
 * Pure derivation of the attached-papers runtime context from the session
 * log: {@link foldAttachedPapers} reduces `literature/attach` / `literature/detach`
 * events to the current attached set, and {@link renderAttachedContext} renders
 * the model-facing block under a strict byte budget. The service registers the
 * joined result as the `literature:attached` prompt context.
 * @module
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AttachedPaper, AttachedTurn } from './types.ts'

/** Rendering bounds applied to the complete emitted context. */
export interface AttachedRenderBudget {
  /** Longest number of papers listed (later papers fold into the omission note). */
  maxPapers: number
  /** Complete result bound: header plus listed papers never exceed this many UTF-8 bytes. */
  maxBytes: number
}

/** The pinned model-facing header, including the deep-reading instruction. */
const HEADER = `## Attached papers

The user attached these papers to this conversation from the literature UI. Treat them as reading material for this conversation. When the user asks for detailed reading (精读) or more information about one of them, call \`mcp__literature__literature_get_fulltext\` with its pmcid (preferred), pmid, or doi; papers without open-access full text return a structured status of "not_found" — report that honestly instead of inventing content.`

/**
 * Reduce the log to the current attached papers: an attach appends its paper
 * (in event order), a detach removes the first paper with the same id.
 * @param events - the session's event log.
 * @returns attached papers in attach order.
 */
export function foldAttachedPapers(events: readonly SessionEvent[]): AttachedPaper[] {
  const papers: AttachedPaper[] = []
  for (const event of events) {
    if (event.type === 'literature/attach') {
      papers.push(event.data.paper)
    } else if (event.type === 'literature/detach') {
      const index = papers.findIndex(paper => paper.id === event.data.id)
      if (index !== -1) papers.splice(index, 1)
    }
  }
  return papers
}

/**
 * Reduce the log to the attached papers carried by each user message: for
 * every `user/message` event the current attached set is snapshotted. Messages
 * sent while no paper is attached record nothing.
 * @param events - the session's event log.
 * @returns one entry per user message that carried papers, in seq order.
 */
export function foldAttachedByTurn(events: readonly SessionEvent[]): readonly AttachedTurn[] {
  const turns: AttachedTurn[] = []
  const papers: AttachedPaper[] = []
  for (const event of events) {
    if (event.type === 'literature/attach') {
      papers.push(event.data.paper)
    } else if (event.type === 'literature/detach') {
      const index = papers.findIndex(paper => paper.id === event.data.id)
      if (index !== -1) papers.splice(index, 1)
    } else if (event.type === 'user/message' && papers.length > 0) {
      turns.push({ seq: event.seq, papers: Object.freeze([...papers]) })
    }
  }
  return turns
}

/** UTF-8 byte length of one string. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Longest prefix of `text` whose UTF-8 encoding fits `maxBytes` bytes. */
function truncateToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (byteLength(text) <= maxBytes) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (byteLength(text.slice(0, mid)) <= maxBytes) low = mid
    else high = mid - 1
  }
  return text.slice(0, low)
}

/** One meta line: authors · year · venue, with graceful absences. */
function metaLine(paper: AttachedPaper): string {
  const authorPart = paper.authors.length === 0
    ? ''
    : paper.authors.join(', ')
  const yearPart = paper.year === null ? '' : String(paper.year)
  return [authorPart, yearPart, paper.venue].filter(part => part !== null && part !== '').join(' · ')
}

/**
 * Render one numbered entry, adding lines while they fit `maxBytes`.
 * Only the abstract line may be truncated; any other overflow stops the
 * entry (and the caller stops listing further papers).
 * @returns the rendered block (leading newline included) and whether the
 *   entry carried every field untruncated.
 */
function renderEntryWithin(paper: AttachedPaper, numbered: number, maxBytes: number): { text: string; complete: boolean } {
  const meta = metaLine(paper)
  const titleLine = `${numbered}. ${paper.title}${meta === '' ? '' : ` — ${meta}`}`
  const candidate = `\n${titleLine}`
  if (byteLength(candidate) > maxBytes) {
    // Reserve the leading newline and the ellipsis marker for the title.
    const titleBudget = maxBytes - byteLength('\n') - byteLength('…')
    return { text: `\n${truncateToBytes(titleLine, Math.max(0, titleBudget))}…`, complete: false }
  }
  let text = candidate
  const { doi, pmid, pmcid, arxiv } = paper.identifiers
  const identifiers = [
    doi === undefined ? '' : `DOI ${doi}`,
    pmid === undefined ? '' : `PMID ${pmid}`,
    pmcid === undefined ? '' : `PMCID ${pmcid}`,
    arxiv === undefined ? '' : `arXiv ${arxiv}`,
  ].filter(part => part !== '')
  const lines = [
    `id: ${paper.id}`,
    ...identifiers.length > 0 ? [`identifiers: ${identifiers.join(', ')}`] : [],
    ...paper.url === null ? [] : [`url: ${paper.url}`],
    ...paper.abstract === null || paper.abstract === '' ? [] : [`Abstract: ${paper.abstract}`],
  ]
  for (const line of lines) {
    const withLine = `${text}\n   ${line}`
    if (byteLength(withLine) <= maxBytes) {
      text = withLine
      continue
    }
    if (line.startsWith('Abstract: ')) {
      const prefix = `${text}\n   Abstract: `
      const available = maxBytes - byteLength(prefix) - byteLength('…')
      if (available > 0) {
        return { text: `${prefix}${truncateToBytes(line.slice('Abstract: '.length), available)}…`, complete: false }
      }
    }
    return { text, complete: false }
  }
  return { text, complete: true }
}

/**
 * Render the model-facing attached-papers context under {@link AttachedRenderBudget}.
 * @param papers - the current attached papers.
 * @param budget - paper count and complete byte bounds.
 * @returns the context text, or `''` when no paper is attached (or the
 *   budget leaves no room for the header itself).
 */
export function renderAttachedContext(papers: readonly AttachedPaper[], budget: AttachedRenderBudget): string {
  if (papers.length === 0) return ''
  const headerBytes = byteLength(HEADER) + 1 // the separating newline
  if (budget.maxBytes <= headerBytes) return ''
  const bodyBudget = budget.maxBytes - headerBytes
  const considered = papers.slice(0, budget.maxPapers)
  const omitted = papers.length - considered.length
  let body = ''
  let numbered = 0
  for (const paper of considered) {
    numbered += 1
    const entry = renderEntryWithin(paper, numbered, bodyBudget - byteLength(body))
    body += entry.text
    if (!entry.complete) {
      const remaining = considered.length - numbered + omitted
      if (remaining > 0) body += `\n[+${remaining} more attached papers omitted]\n`
      return `${HEADER}\n${body}`
    }
  }
  if (omitted > 0) body += `\n[+${omitted} more attached papers omitted]\n`
  return `${HEADER}\n${body}`
}
