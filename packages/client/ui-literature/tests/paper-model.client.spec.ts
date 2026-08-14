/**
 * Pure derivation tests for the literature card models: real MCP response
 * shapes parse into card items; malformed text and running calls yield null;
 * the fulltext and sources shapes parse too.
 */
import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { literatureModel } from '../src/client/paper-model.ts'

/** Build a settled tool-result block whose text content is the given JSON. */
function settled(text: string): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: 1,
    callId: 'call-1',
    call: { name: 'mcp__literature__literature_search', argsRaw: '{}' },
    callTime: 1,
    content: [{ type: 'text', text }],
    isError: false,
    callView: null,
  } as unknown as ToolCallBlock
}

/** A running call slice. */
function running(): ToolCallBlock {
  return {
    kind: 'running',
    callId: 'call-1',
    call: { name: 'mcp__literature__literature_search', argsRaw: '{}' },
    time: 1,
    seq: 1,
    subCalls: [],
    callView: null,
  } as unknown as ToolCallBlock
}

const SEARCH_RESPONSE = {
  query: 'novel category discovery',
  parameters: { limit: 10 },
  results: [
    {
      rank: 1,
      fused_score: 0.9,
      title: 'Category Discovery: An Open-World Perspective',
      abstract: 'A survey of category discovery.',
      identifiers: { doi: '10.1000/ncd.1', arxiv: '2509.22542' },
      url: 'https://arxiv.org/abs/2509.22542',
      pdf_url: null,
      year: 2025,
      authors: ['A. He', 'B. Liu'],
      venue: 'arXiv',
      open_access: true,
      source_evidence: [{ source: 'arxiv', rank: 1, source_id: 'x' }, { source: 'semantic-scholar', rank: 2, source_id: 'y' }],
    },
    {
      rank: 2,
      fused_score: 0.7,
      title: 'Minimal record',
      identifiers: {},
      open_access: false,
      source_evidence: [],
    },
  ],
  source_statuses: [],
  total_candidates: 42,
  returned: 2,
  all_sources_failed: false,
}

describe('literatureModel', () => {
  it('parses a search response into paper cards', () => {
    const model = literatureModel('mcp__literature__literature_search', settled(JSON.stringify(SEARCH_RESPONSE)))
    expect(model).not.toBeNull()
    if (model?.kind !== 'search') throw new Error('expected search model')
    expect(model.query).toBe('novel category discovery')
    expect(model.papers).toHaveLength(2)
    expect(model.totalCandidates).toBe(42)

    const first = model.papers[0]!
    expect(first.title).toBe('Category Discovery: An Open-World Perspective')
    expect(first.id).toBe('10.1000/ncd.1')
    expect(first.doi).toBe('10.1000/ncd.1')
    expect(first.arxiv).toBe('2509.22542')
    expect(first.year).toBe(2025)
    expect(first.authors).toEqual(['A. He', 'B. Liu'])
    expect(first.openAccess).toBe(true)
    expect(first.sourceCount).toBe(2)

    const second = model.papers[1]!
    expect(second.abstract).toBeNull()
    expect(second.id).toBeNull()
    expect(second.authors).toEqual([])
  })

  it('prefers arXiv as the id when no DOI is present', () => {
    const response = {
      ...SEARCH_RESPONSE,
      results: [{ ...SEARCH_RESPONSE.results[0], identifiers: { arxiv: '2509.22542' } }],
    }
    const model = literatureModel('mcp__literature__literature_search', settled(JSON.stringify(response)))
    if (model?.kind !== 'search') throw new Error('expected search model')
    expect(model.papers[0]!.id).toBe('2509.22542')
  })

  it('parses pretty-printed JSON text (the MCP default output)', () => {
    const model = literatureModel('mcp__literature__literature_search', settled(JSON.stringify(SEARCH_RESPONSE, null, 2)))
    expect(model?.kind).toBe('search')
  })

  it('returns null for a running call', () => {
    expect(literatureModel('mcp__literature__literature_search', running())).toBeNull()
  })

  it('returns null for unparseable text', () => {
    expect(literatureModel('mcp__literature__literature_search', settled('search failed: network error'))).toBeNull()
  })

  it('extracts the JSON object from wrapped transport text', () => {
    const model = literatureModel(
      'mcp__literature__literature_search',
      settled(`result:\n${JSON.stringify(SEARCH_RESPONSE)}\n(end)`),
    )
    expect(model?.kind).toBe('search')
  })

  it('parses a fulltext response', () => {
    const response = {
      status: 'ok',
      title: 'Example paper',
      abstract: 'Abs',
      sections: [{ heading: 'Introduction', text: 'Hello world.' }, { heading: '', text: 'Second.' }],
      full_text: 'Hello world. Second.',
      identifiers: { pmcid: 'PMC123' },
      url: 'https://europepmc.org/x',
      word_count: 4,
      character_count: 20,
      truncated: false,
      max_chars: 12000,
    }
    const model = literatureModel('mcp__literature__literature_get_fulltext', settled(JSON.stringify(response)))
    expect(model?.kind).toBe('fulltext')
    if (model?.kind !== 'fulltext') throw new Error('expected fulltext model')
    expect(model.title).toBe('Example paper')
    expect(model.sections).toHaveLength(2)
    expect(model.fullText).toBe('Hello world. Second.')
  })

  it('parses a not_found fulltext response', () => {
    const response = { status: 'not_found', sections: [], full_text: '', identifiers: {}, word_count: 0, character_count: 0, truncated: false, max_chars: 12000 }
    const model = literatureModel('mcp__literature__literature_get_fulltext', settled(JSON.stringify(response)))
    if (model?.kind !== 'fulltext') throw new Error('expected fulltext model')
    expect(model.status).toBe('not_found')
  })

  it('parses a sources response', () => {
    const response = {
      sources: [
        { id: 'pubmed', name: 'PubMed', description: 'Biomedical literature', homepage: 'https://pubmed.ncbi.nlm.nih.gov/', credentials: [{ name: 'NCBI_API_KEY', configured: true }], notes: '' },
      ],
      default_source_order: ['pubmed', 'arxiv'],
      count: 1,
    }
    const model = literatureModel('mcp__literature__literature_sources', settled(JSON.stringify(response)))
    expect(model?.kind).toBe('sources')
    if (model?.kind !== 'sources') throw new Error('expected sources model')
    expect(model.sources).toHaveLength(1)
    expect(model.sources[0]!.id).toBe('pubmed')
    expect(model.sources[0]!.credentials).toEqual([{ name: 'NCBI_API_KEY', configured: true }])
    expect(model.defaultOrder).toEqual(['pubmed', 'arxiv'])
  })

  it('returns null for an unrelated tool name', () => {
    expect(literatureModel('web_search', settled(JSON.stringify(SEARCH_RESPONSE)))).toBeNull()
  })
})
