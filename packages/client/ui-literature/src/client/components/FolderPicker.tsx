/**
 * Folder picker dialog: the shared "save to folder" / "move to folder"
 * chooser used by the paper-card star and the favorites panel. Lists
 * uncategorized plus every category folder, with an inline new-folder
 * input; picking an entry resolves immediately through `onPick`.
 */

import { useCallback, useSyncExternalStore, useState } from 'react'
import { IconFolderOpenOutline16, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { favoritesStore } from '../favorites/store.ts'
import css from './FolderPicker.module.css'

/** Full picker props. */
export interface FolderPickerProps {
  /** Whether the dialog is shown. */
  open: boolean
  /** Heading shown in the dialog. */
  title: string
  /** Display label for the uncategorized entry. */
  uncategorizedLabel: string
  /** Placeholder for the new-folder input. */
  newFolderPlaceholder: string
  /** Label for the create action. */
  createLabel: string
  /** New-folder duplicate/invalid feedback. */
  folderNameError: string
  /** Resolved with the chosen folder id (null = uncategorized). */
  onPick: (folderId: string | null) => void
  /** Close without choosing. */
  onClose: () => void
}

/** Pending-mutation id set observable (tiny local store; snapshots are immutable). */
let pending: boolean = false
const pendingListeners = new Set<() => void>()
const subscribePending = (listener: () => void): (() => void) => {
  pendingListeners.add(listener)
  return () => { pendingListeners.delete(listener) }
}
const getPendingSnapshot = (): boolean => pending
function markPending(on: boolean): void {
  pending = on
  for (const listener of pendingListeners) listener()
}

/**
 * The folder chooser dialog. Local state only: which folder is being
 * created and its name; folder data comes from the global favorites store.
 */
export function FolderPicker({
  open, title, uncategorizedLabel, newFolderPlaceholder, createLabel, folderNameError, onPick, onClose,
}: FolderPickerProps) {
  const view = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
  const busy = useSyncExternalStore(subscribePending, getPendingSnapshot)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    markPending(true)
    setError(null)
    try {
      const folder = await favoritesStore.createFolder(trimmed)
      onPick(folder.id)
    } catch {
      setError(folderNameError)
    } finally {
      markPending(false)
      setCreating(false)
      setName('')
    }
  }, [name, folderNameError, onPick])

  if (!open) return null
  const ready = view.status === 'ready'

  return (
    <div className={css.overlay} role="presentation" onClick={onClose}>
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={event => event.stopPropagation()}
      >
        <p className={css.title}>{title}</p>
        <ul className={css.list}>
          <li>
            <button
              type="button"
              className={css.entry}
              disabled={busy}
              onClick={() => { onPick(null) }}
            >
              <span className={css.entryIcon}><IconFolderOpenOutline16 size={14} /></span>
              <span className={css.entryName}>{uncategorizedLabel}</span>
            </button>
          </li>
          {ready && view.folders.map(folder => (
            <li key={folder.id}>
              <button
                type="button"
                className={css.entry}
                disabled={busy}
                onClick={() => { onPick(folder.id) }}
              >
                <span className={css.entryIcon}><IconFolderOpenOutline16 size={14} /></span>
                <span className={css.entryName}>{folder.name}</span>
                <span className={css.entryCount}>
                  {view.papers.filter(paper => paper.folderId === folder.id).length}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {creating ? (
          <div className={css.createRow}>
            <input
              className={css.createInput}
              value={name}
              placeholder={newFolderPlaceholder}
              onChange={(event) => { setName(event.target.value); setError(null) }}
              onKeyDown={(event) => { if (event.key === 'Enter') void create() }}
              autoFocus
            />
            <button type="button" className={css.createButton} disabled={busy || name.trim() === ''} onClick={() => void create()}>
              {createLabel}
            </button>
            {error !== null && <p className={css.error}>{error}</p>}
          </div>
        ) : (
          <button type="button" className={css.newFolder} disabled={busy} onClick={() => { setCreating(true) }}>
            <span className={css.entryIcon}><IconPlusOutline16 size={14} /></span>
            {newFolderPlaceholder}
          </button>
        )}
      </div>
    </div>
  )
}
