/**
 * Session-wide literature collection: every paper the current conversation's
 * `mcp__literature__literature_search` calls have produced, flattened and
 * deduplicated by stable identifier (falling back to the title). The right
 * panel derives from this; the chat tool row stays a summary.
 * @module
 */

import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { literatureModel } from './paper-model.ts'
import type { PaperItem } from './paper-model.ts'

/** Wire name of the one tool whose results feed the collection. */
const SEARCH_TOOL = 'mcp__literature__literature_search'

/**
 * Collect this session's papers from the conversation snapshot.
 * @param snapshot - the current session snapshot, or null while absent.
 * @returns deduplicated papers in first-seen order (newest searches last).
 */
export function collectPapers(snapshot: ConversationSnapshot | null | undefined): PaperItem[] {
  if (snapshot === null || snapshot === undefined) return []
  const seen = new Set<string>()
  const papers: PaperItem[] = []
  for (const node of snapshot.nodes) {
    if (node.kind !== 'tool-result') continue
    if (node.call?.name !== SEARCH_TOOL) continue
    const model = literatureModel(SEARCH_TOOL, node)
    if (model?.kind !== 'search') continue
    for (const paper of model.papers) {
      const key = paper.id ?? paper.title
      if (seen.has(key)) continue
      seen.add(key)
      papers.push(paper)
    }
  }
  return papers
}
