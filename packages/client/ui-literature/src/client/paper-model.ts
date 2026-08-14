/**
 * Pure derivation of the literature card models from a frozen tool-call
 * slice. The literature MCP tools return their structured response as JSON
 * TEXT (no host resultView), so this module is the one place that parses it
 * into what {@link LiteratureRow} draws. A running call or an unparseable
 * result yields null and the row falls back to a generic collapsed body.
 * @module
 */

import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

/** One fused paper from `literature_search`. */
export interface PaperItem {
  rank: number
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  url: string | null
  pdfUrl: string | null
  openAccess: boolean
  /** Preferred stable id: DOI, else PMID, else arXiv id. */
  id: string | null
  doi: string | null
  pmid: string | null
  arxiv: string | null
  /** Number of agreeing sources in source_evidence. */
  sourceCount: number
}

/** Card model for `mcp__literature__literature_search`. */
export interface SearchCardModel {
  kind: 'search'
  query: string
  papers: PaperItem[]
  returned: number
  totalCandidates: number
  allSourcesFailed: boolean
}

/** Card model for `mcp__literature__literature_get_fulltext`. */
export interface FulltextCardModel {
  kind: 'fulltext'
  title: string | null
  status: 'ok' | 'not_found' | 'error'
  sections: { heading: string; text: string }[]
  fullText: string
  url: string | null
  wordCount: number
  truncated: boolean
}

/** Card model for `mcp__literature__literature_sources`. */
export interface SourcesCardModel {
  kind: 'sources'
  sources: {
    id: string
    name: string
    description: string
    homepage: string
    credentials: { name: string; configured: boolean }[]
  }[]
  defaultOrder: string[]
}

/** The union the literature row draws. */
export type LiteratureModel = SearchCardModel | FulltextCardModel | SourcesCardModel

/** Flatten a settled result's text blocks to one string. */
function resultText(node: ToolResultNode): string {
  const parts: string[] = []
  for (const block of node.content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Tolerant JSON parse: try the whole text, then the outermost balanced
 * `{...}` span (results are `JSON.stringify`-pretty or may ride wrapped
 * transport text).
 * @param text - the raw result text.
 * @returns the parsed value, or undefined.
 */
function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to the balanced-span extraction.
  }
  const start = trimmed.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/** Read a string field tolerantly. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Read a string array tolerantly. */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

/** Read a record tolerantly. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

/** Map one fused result record into a card item. */
function toPaper(raw: unknown, index: number): PaperItem | null {
  const record = asRecord(raw)
  const title = asString(record.title)
  if (title === null) return null
  const identifiers = asRecord(record.identifiers)
  const doi = asString(identifiers.doi)
  const pmid = asString(identifiers.pmid)
  const arxiv = asString(identifiers.arxiv)
  const evidence = Array.isArray(record.source_evidence) ? record.source_evidence.length : 0
  return {
    rank: typeof record.rank === 'number' ? record.rank : index + 1,
    title,
    abstract: asString(record.abstract),
    authors: asStringArray(record.authors),
    year: typeof record.year === 'number' ? record.year : null,
    venue: asString(record.venue),
    url: asString(record.url),
    pdfUrl: asString(record.pdf_url),
    openAccess: record.open_access === true,
    id: doi ?? pmid ?? arxiv,
    doi,
    pmid,
    arxiv,
    sourceCount: evidence,
  }
}

/**
 * Derive the card model for one settled literature tool call.
 * @param toolName - the wire tool name (keys the MCP tool family).
 * @param block - the frozen call slice.
 * @returns the card model, or null while running / for unparseable results.
 */
export function literatureModel(toolName: string, block: ToolCallBlock): LiteratureModel | null {
  // Running calls have no kind field; only settled results carry content.
  if (!('kind' in block) || block.kind !== 'tool-result') return null
  const parsed = parseJson(resultText(block))
  if (parsed === undefined) return null

  if (toolName.endsWith('literature_search')) {
    const record = asRecord(parsed)
    const rawPapers = Array.isArray(record.results) ? record.results : []
    const papers: PaperItem[] = []
    for (const [index, raw] of rawPapers.entries()) {
      const paper = toPaper(raw, index)
      if (paper !== null) papers.push(paper)
    }
    if (papers.length === 0 && !Array.isArray(record.results)) return null
    return {
      kind: 'search',
      query: asString(record.query) ?? '',
      papers,
      returned: typeof record.returned === 'number' ? record.returned : papers.length,
      totalCandidates: typeof record.total_candidates === 'number' ? record.total_candidates : papers.length,
      allSourcesFailed: record.all_sources_failed === true,
    }
  }

  if (toolName.endsWith('literature_get_fulltext')) {
    const record = asRecord(parsed)
    const status = record.status === 'not_found' || record.status === 'error' ? record.status : 'ok'
    const rawSections = Array.isArray(record.sections) ? record.sections : []
    return {
      kind: 'fulltext',
      title: asString(record.title),
      status,
      sections: rawSections.flatMap((raw): { heading: string; text: string }[] => {
        const section = asRecord(raw)
        const heading = asString(section.heading) ?? ''
        const text = asString(section.text) ?? ''
        return text === '' ? [] : [{ heading, text }]
      }),
      fullText: asString(record.full_text) ?? '',
      url: asString(record.url),
      wordCount: typeof record.word_count === 'number' ? record.word_count : 0,
      truncated: record.truncated === true,
    }
  }

  if (toolName.endsWith('literature_sources')) {
    const record = asRecord(parsed)
    const rawSources = Array.isArray(record.sources) ? record.sources : []
    const sources: SourcesCardModel['sources'] = []
    for (const raw of rawSources) {
      const source = asRecord(raw)
      const id = asString(source.id)
      const name = asString(source.name)
      if (id === null || name === null) continue
      const rawCredentials = Array.isArray(source.credentials) ? source.credentials : []
      const credentials: { name: string; configured: boolean }[] = []
      for (const rawCred of rawCredentials) {
        const cred = asRecord(rawCred)
        const credName = asString(cred.name)
        if (credName !== null) credentials.push({ name: credName, configured: cred.configured === true })
      }
      sources.push({
        id,
        name,
        description: asString(source.description) ?? '',
        homepage: asString(source.homepage) ?? '',
        credentials,
      })
    }
    return {
      kind: 'sources',
      sources,
      defaultOrder: asStringArray(record.default_source_order),
    }
  }

  return null
}

/** Build the favorite-ready payload from one paper item. */
export function toFavoritePayload(paper: PaperItem): {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  abstract: string | null
  url: string | null
} {
  return {
    id: paper.id ?? `unknown:${paper.title}`,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    abstract: paper.abstract,
    url: paper.url,
  }
}
