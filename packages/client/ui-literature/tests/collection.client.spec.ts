/**
 * Pure collection tests: the right panel derives from the conversation
 * snapshot — every settled literature_search result contributes its papers,
 * deduplicated by stable id (title fallback), other nodes ignored.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { collectPapers } from '../src/client/collection.ts'

/** One settled literature_search result node. */
function searchNode(seq: number, text: string, name = 'mcp__literature__literature_search') {
  return {
    kind: 'tool-result',
    seq,
    time: seq,
    callId: `call-${seq}`,
    call: { name, argsRaw: '{}' },
    callTime: seq,
    content: [{ type: 'text', text }],
    isError: false,
    callView: null,
  }
}

const RESPONSE_A = {
  query: 'q1',
  parameters: {},
  results: [
    { rank: 1, title: 'Paper A', identifiers: { doi: '10.1000/a' }, abstract: 'abs', authors: ['A'], year: 2024, venue: 'J1', url: null, pdf_url: null, open_access: false, source_evidence: [] },
    { rank: 2, title: 'Paper B', identifiers: { pmid: '123' }, abstract: null, authors: [], year: null, venue: null, url: null, pdf_url: null, open_access: false, source_evidence: [] },
  ],
  source_statuses: [],
  total_candidates: 2,
  returned: 2,
  all_sources_failed: false,
}

const RESPONSE_B = {
  query: 'q2',
  parameters: {},
  results: [
    // Same DOI as Paper A — must dedupe by stable id.
    { rank: 1, title: 'Paper A again', identifiers: { doi: '10.1000/a' }, abstract: null, authors: [], year: null, venue: null, url: null, pdf_url: null, open_access: false, source_evidence: [] },
    // New paper.
    { rank: 2, title: 'Paper C', identifiers: { arxiv: '2509.1' }, abstract: null, authors: [], year: null, venue: null, url: null, pdf_url: null, open_access: false, source_evidence: [] },
  ],
  source_statuses: [],
  total_candidates: 2,
  returned: 2,
  all_sources_failed: false,
}

function snapshotWith(nodes: unknown[]): ConversationSnapshot {
  return { nodes } as unknown as ConversationSnapshot
}

describe('collectPapers', () => {
  it('returns empty for an absent snapshot', () => {
    expect(collectPapers(null)).toEqual([])
    expect(collectPapers(undefined)).toEqual([])
  })

  it('collects, flattens, and deduplicates across searches', () => {
    const snapshot = snapshotWith([
      searchNode(1, JSON.stringify(RESPONSE_A)),
      // A foreign node that must be ignored.
      { kind: 'user', seq: 2, time: 2 },
      searchNode(3, JSON.stringify(RESPONSE_B)),
      // A non-literature tool result must be ignored.
      searchNode(4, '{}', 'web_search'),
    ])
    const papers = collectPapers(snapshot)
    expect(papers.map(paper => paper.title)).toEqual(['Paper A', 'Paper B', 'Paper C'])
    expect(papers[0]!.doi).toBe('10.1000/a')
    expect(papers[2]!.id).toBe('2509.1')
  })

  it('ignores unparseable results and running calls', () => {
    const snapshot = snapshotWith([
      searchNode(1, 'not json'),
      { kind: 'running', callId: 'r1', name: 'mcp__literature__literature_search', argsRaw: '{}' },
    ])
    expect(collectPapers(snapshot)).toEqual([])
  })

  it('dedupes id-less papers by title across searches', () => {
    const first = {
      query: 'q1', parameters: {}, results: [
        { rank: 1, title: 'Untitled duplicate', identifiers: {}, abstract: null, authors: [], year: null, venue: null, url: null, pdf_url: null, open_access: false, source_evidence: [] },
      ],
      source_statuses: [], total_candidates: 1, returned: 1, all_sources_failed: false,
    }
    const snapshot = snapshotWith([
      searchNode(1, JSON.stringify(first)),
      searchNode(2, JSON.stringify(first)),
    ])
    const papers = collectPapers(snapshot)
    expect(papers.map(paper => paper.title)).toEqual(['Untitled duplicate'])
  })
})
