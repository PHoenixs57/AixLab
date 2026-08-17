/**
 * File reference chip source: the '@' source that lets the composer mention
 * workspace files (like '/' lists tools). A mentioned or dropped file becomes
 * a composer-dock attachment chip labeled with its basename; the input shell
 * appends its workspace-relative path only when the draft is submitted, so the
 * path reaches the agent without becoming visible draft text.
 * @module dsh-aionui-panel/client/drag/file-source
 */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { DraftFileReference } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerCandidate, InputTriggerSource, ReferenceInsert } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { PanelApi } from '../api.ts'

/** Reference source name (unique among '@' sources; the codec owner). */
export const FILE_SOURCE_NAME = 'aionui-file'

/** Build the reference insertion retained for already-open legacy inline chips. */
export function fileReference(path: string): ReferenceInsert {
  return {
    source: FILE_SOURCE_NAME,
    ref: path,
    label: basename(path),
    clipboardText: path,
  }
}

/** Build one composer-dock file reference. */
export function fileDraftReference(path: string): DraftFileReference {
  return { path, name: basename(path) }
}

/** Construction deps: fs access, session→root resolution, and draft mutation. */
export interface FileSourceDeps {
  api: PanelApi
  /** Resolve a session's project root ('' when none is bound). */
  rootOf: (sessionId: SessionId) => string
  /** Add one file to the addressed session's composer attachment row. */
  addFile: (sessionId: SessionId, ref: DraftFileReference) => boolean
}

/** One menu row: basename up front, the relative path as the secondary line. */
function toCandidate(name: string, path: string): InputTriggerCandidate {
  return path === name ? { name } : { name, description: path }
}

/**
 * Create the '@' file source. An empty query lists the root's files; a query
 * runs the recursive filename search. Picking a row adds an attachment chip
 * and consumes the trigger token from the text draft.
 * @param deps - fs client, root resolver, and draft-file mutation.
 */
export function createFileSource(deps: FileSourceDeps): InputTriggerSource {
  return {
    trigger: '@',
    name: FILE_SOURCE_NAME,
    async candidates(session, { query, signal }) {
      const root = deps.rootOf(session.sessionId)
      if (root === '') return []
      const needle = query.trim()
      if (needle === '') {
        const result = await deps.api.list(root, '')
        if (signal.aborted || !result.ok) return []
        return result.value.entries
          .filter(entry => !entry.isDir)
          .map(entry => toCandidate(entry.name, entry.path))
      }
      const result = await deps.api.search(root, needle)
      if (signal.aborted || !result.ok) return []
      return result.value.hits
        .filter(hit => !hit.isDir)
        .map(hit => toCandidate(hit.name, hit.path))
    },
    onPick({ candidate, session }) {
      const path = candidate.description ?? candidate.name
      return deps.addFile(session.sessionId, fileDraftReference(path)) ? { text: '' } : undefined
    },
    codec: {
      clipboardText: ref => ref,
      serialize: ref => Promise.resolve(ref),
    },
  }
}

/** Last path segment (the chip label); a trailing slash drops the empty tail. */
function basename(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const at = trimmed.lastIndexOf('/')
  return at < 0 ? trimmed : trimmed.slice(at + 1)
}
