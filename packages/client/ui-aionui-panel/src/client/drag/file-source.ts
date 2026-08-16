/**
 * File reference chip source: the '@' source that lets the composer mention
 * workspace files (like '/' lists tools), plus the codec that owns submit-time
 * serialization. A mentioned or dropped file becomes an inline occurrence chip
 * labeled with its basename; the codec serializes it back to the
 * workspace-relative path at submit (and on copy/paste), so the path reaches
 * the agent without ever being a visible raw string in the draft.
 * @module dsh-aionui-panel/client/drag/file-source
 */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerCandidate, InputTriggerSource, ReferenceInsert } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { PanelApi } from '../api.ts'

/** Reference source name (unique among '@' sources; the codec owner). */
export const FILE_SOURCE_NAME = 'aionui-file'

/** Build the reference insertion for one workspace-relative path. */
export function fileReference(path: string): ReferenceInsert {
  return {
    source: FILE_SOURCE_NAME,
    ref: path,
    label: basename(path),
    clipboardText: path,
  }
}

/** Construction deps: the fs client plus a session→root resolver. */
export interface FileSourceDeps {
  api: PanelApi
  /** Resolve a session's project root ('' when none is bound). */
  rootOf: (sessionId: SessionId) => string
}

/** One menu row: basename up front, the relative path as the secondary line. */
function toCandidate(name: string, path: string): InputTriggerCandidate {
  return path === name ? { name } : { name, description: path }
}

/**
 * Create the '@' file source. An empty query lists the root's files; a query
 * runs the recursive filename search. Picking a row inserts a file chip whose
 * ref is the relative path.
 * @param deps - fs client and root resolver.
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
    onPick({ candidate }) {
      const path = candidate.description ?? candidate.name
      return { insert: fileReference(path) }
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
