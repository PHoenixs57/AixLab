/**
 * Favorites panel: the `sidebar.favorites` occupant, now a flat file manager.
 * Wide shows the folder library — 全部 / 未分类 plus one row per category
 * folder (create, rename, delete, move papers between folders) — with the
 * selected scope's papers below; the rail shows a bookmark glyph with the
 * total count that expands the sidebar on click.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import {
  IconCheckOutline14,
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconCloseOutline16,
  IconEditOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconLinkOutline14,
  IconPlusOutline16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the sidebar.favorites SlotMap merge from the sidebar shell.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { FavoriteFolder, FavoritePaper } from '@deepseek-ai/dsh-literature-favorites/types'
import { attachedPapersStore } from '../attached/store.ts'
import { FolderPicker } from '../components/FolderPicker.tsx'
import { MinusIcon, PlusIcon, StarIcon } from '../components/icons.tsx'
import { favoriteToAttachedPayload } from '../paper-model.ts'
import { favoritesStore } from './store.ts'
import { NS } from '../locale.ts'
import css from './FavoritesPanel.module.css'

/** Full panel props: the sidebar hole owner share plus the locale seat. */
export type FavoritesPanelProps = PropsRuntime<'sidebar.favorites'> & PropsLocale<'literature'>

/** Browse scope: all papers, uncategorized, or one folder id. */
type Scope = 'all' | 'uncategorized' | string

/** Pending-mutation id set observable (tiny local store; snapshots are immutable). */
let pendingIds: ReadonlySet<string> = new Set()
const pendingListeners = new Set<() => void>()
const subscribePending = (listener: () => void): (() => void) => {
  pendingListeners.add(listener)
  return () => { pendingListeners.delete(listener) }
}
const getPendingSnapshot = (): ReadonlySet<string> => pendingIds
function markPending(id: string, on: boolean): void {
  const next = new Set(pendingIds)
  if (on) next.add(id)
  else next.delete(id)
  pendingIds = next
  for (const listener of pendingListeners) listener()
}

/** One saved-paper row with add-to-conversation / move / open / remove actions. */
function FavoriteRow({ paper, meta, attached, attachDisabled, onMove, onAttach, t }: {
  paper: FavoritePaper
  meta: string
  attached: boolean
  attachDisabled: boolean
  onMove: () => void
  onAttach: (paper: FavoritePaper) => Promise<void>
  t: FavoritesPanelProps['t']
}) {
  const pending = useSyncExternalStore(subscribePending, getPendingSnapshot)
  const busy = pending.has(paper.id)
  const [attachBusy, setAttachBusy] = useState(false)
  const remove = useCallback(() => {
    if (busy) return
    markPending(paper.id, true)
    favoritesStore.remove(paper.id)
      .catch(() => { /* panel stays authoritative; next refresh reconciles */ })
      .finally(() => { markPending(paper.id, false) })
  }, [busy, paper.id])

  const toggleAttach = useCallback(() => {
    if (attachBusy || attachDisabled) return
    setAttachBusy(true)
    onAttach(paper)
      .catch(() => { /* panel stays authoritative; next refresh reconciles */ })
      .finally(() => { setAttachBusy(false) })
  }, [attachBusy, attachDisabled, onAttach, paper])

  return (
    <li className={css.item}>
      <div className={css.itemBody}>
        <p className={css.itemTitle}>
          {paper.url === null
            ? paper.title
            : <a href={paper.url} target="_blank" rel="noreferrer" className={css.itemLink}>{paper.title}</a>}
        </p>
        {meta !== '' && <p className={css.itemMeta}>{meta}</p>}
      </div>
      <button
        type="button"
        className={css.itemAction}
        disabled={busy || attachBusy || attachDisabled}
        onClick={toggleAttach}
        aria-label={attached ? t('detachFromConversation') : t('attachToConversation')}
        title={attachDisabled ? t('attachDisabled') : attached ? t('detachFromConversation') : t('attachToConversation')}
      >
        {attached ? <MinusIcon size={14} /> : <PlusIcon filled={false} size={14} />}
      </button>
      <button type="button" className={css.itemAction} disabled={busy} onClick={onMove} aria-label={t('moveToFolder')} title={t('moveToFolder')}>
        <IconFolderOpen16 size={14} />
      </button>
      {paper.url !== null && (
        <a className={css.itemAction} href={paper.url} target="_blank" rel="noreferrer" aria-label="open">
          <IconLinkOutline14 />
        </a>
      )}
      <button type="button" className={css.itemAction} disabled={busy} onClick={remove} aria-label={t('removeFavorite')} title={t('removeFavorite')}>
        <IconTrashOutline16 size={14} />
      </button>
    </li>
  )
}

/** One category folder row: select, inline rename, two-step delete. */
function FolderRow({ folder, count, selected, onSelect, t }: {
  folder: FavoriteFolder
  count: number
  selected: boolean
  onSelect: () => void
  t: FavoritesPanelProps['t']
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(folder.name)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commitRename = useCallback(() => {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === folder.name) {
      setRenaming(false)
      setName(folder.name)
      return
    }
    setBusy(true)
    setError(null)
    favoritesStore.renameFolder(folder.id, trimmed)
      .then(() => { setRenaming(false) })
      .catch(() => { setError(t('folderNameError')) })
      .finally(() => { setBusy(false) })
  }, [folder, name, t])

  const commitDelete = useCallback(() => {
    setBusy(true)
    setError(null)
    favoritesStore.deleteFolder(folder.id)
      .catch(() => { setError(t('folderNameError')) })
      .finally(() => { setBusy(false); setConfirming(false) })
  }, [folder.id, t])

  if (renaming) {
    return (
      <li className={css.folderRow}>
        <input
          className={css.folderInput}
          value={name}
          disabled={busy}
          autoFocus
          onChange={(event) => { setName(event.target.value); setError(null) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') { setRenaming(false); setName(folder.name) }
          }}
        />
        <button type="button" className={css.folderAction} disabled={busy} onClick={commitRename} aria-label={t('confirmRename')}>
          <IconCheckOutline14 />
        </button>
        <button type="button" className={css.folderAction} disabled={busy} onClick={() => { setRenaming(false); setName(folder.name) }} aria-label={t('cancelRename')}>
          <IconCloseOutline16 size={14} />
        </button>
        {error !== null && <p className={css.folderError}>{error}</p>}
      </li>
    )
  }

  return (
    <li className={css.folderRow}>
      <button
        type="button"
        className={selected ? `${css.folderEntry} ${css.folderEntrySelected}` : css.folderEntry}
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
      >
        {selected ? <IconFolderOpen16 size={14} /> : <IconFolderClose16 size={14} />}
        <span className={css.folderName}>{folder.name}</span>
        <span className={css.folderCount}>{count}</span>
      </button>
      {!confirming ? (
        <>
          <button type="button" className={css.folderAction} onClick={() => { setRenaming(true); setName(folder.name) }} aria-label={t('renameFolder')} title={t('renameFolder')}>
            <IconEditOutline16 size={13} />
          </button>
          <button type="button" className={css.folderAction} onClick={() => { setConfirming(true) }} aria-label={t('deleteFolder')} title={t('deleteFolder')}>
            <IconTrashOutline16 size={13} />
          </button>
        </>
      ) : (
        <>
          <button type="button" className={css.folderConfirm} disabled={busy} onClick={commitDelete}>
            {t('deleteFolderConfirm')}
          </button>
          <button type="button" className={css.folderAction} disabled={busy} onClick={() => { setConfirming(false) }} aria-label={t('cancelDelete')}>
            <IconCloseOutline16 size={14} />
          </button>
        </>
      )}
      {error !== null && <p className={css.folderError}>{error}</p>}
    </li>
  )
}

/** The sidebar favorites section: a flat folder library with per-scope papers. */
export function FavoritesPanel({ wide, expandSidebar, useSessions, t }: FavoritesPanelProps) {
  const view = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
  const attachedView = useSyncExternalStore(attachedPapersStore.subscribe, attachedPapersStore.getSnapshot)
  const currentId = useSessions(s => s.current)
  // Folded by default: the count stays visible, the library unfolds on demand.
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [movingPaper, setMovingPaper] = useState<string | null>(null)

  useEffect(() => {
    void favoritesStore.ensure()
  }, [])

  // Load the current session's attached set once; the store mirrors the host log.
  useEffect(() => {
    if (currentId !== undefined) void attachedPapersStore.ensure(currentId)
  }, [currentId])

  const attachedIds = useMemo(() => {
    const state = currentId === undefined ? undefined : attachedView.sessions[currentId]
    return new Set(state?.papers.map(paper => paper.id) ?? [])
  }, [attachedView, currentId])

  const toggleAttach = useCallback((paper: FavoritePaper): Promise<void> => {
    if (currentId === undefined) return Promise.resolve()
    if (attachedIds.has(paper.id)) return attachedPapersStore.detachPaper(currentId, paper.id)
    return attachedPapersStore.attachPaper(currentId, favoriteToAttachedPayload(paper))
  }, [attachedIds, currentId])

  // A deleted folder cannot stay selected: fall back to 全部.
  useEffect(() => {
    if (
      scope !== 'all' && scope !== 'uncategorized' && view.status === 'ready'
      && !view.folders.some(folder => folder.id === scope)
    ) {
      setScope('all')
    }
  }, [scope, view])

  const countOf = (folderId: string | null): number =>
    view.papers.filter(paper => paper.folderId === folderId).length

  const papersInScope = view.papers.filter((paper) => {
    if (scope === 'all') return true
    if (scope === 'uncategorized') return paper.folderId === null
    return paper.folderId === scope
  })

  const createFolder = useCallback(() => {
    const trimmed = newName.trim()
    if (trimmed === '') return
    setCreateError(null)
    favoritesStore.createFolder(trimmed)
      .then((folder) => {
        setCreating(false)
        setNewName('')
        setScope(folder.id)
      })
      .catch(() => { setCreateError(t('folderNameError')) })
  }, [newName, t])

  if (!wide) {
    const count = view.status === 'ready' ? view.papers.length : 0
    return (
      <button
        type="button"
        className={css.rail}
        onClick={expandSidebar}
        aria-label={t('favoritesTitle')}
        title={t('favoritesTitle')}
      >
        <StarIcon filled={count > 0} size={16} />
        {count > 0 && <span className={css.railCount}>{count}</span>}
      </button>
    )
  }

  const movingPaperItem = movingPaper === null
    ? null
    : view.papers.find(paper => paper.id === movingPaper) ?? null

  return (
    <section className={css.panel} aria-label={t('favoritesTitle')}>
      <div className={css.headRow}>
        <button
          type="button"
          className={css.head}
          onClick={() => { setOpen(value => !value) }}
          aria-expanded={open}
          aria-label={t('favoritesTitle')}
          title={t('favoritesTitle')}
        >
          <span className={css.title}>{t('favoritesTitle')}</span>
          {view.status === 'ready' && <span className={css.count}>{view.papers.length}</span>}
          <span className={css.chevron}>
            {open ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
          </span>
        </button>
        {open && (
          <button
            type="button"
            className={css.headAction}
            onClick={() => { setCreating(value => !value); setCreateError(null) }}
            aria-label={t('newFolder')}
            title={t('newFolder')}
          >
            <IconPlusOutline16 size={14} />
          </button>
        )}
      </div>
      {open && view.status === 'loading' && <p className={css.state}>{t('favoritesLoading')}</p>}
      {open && view.status === 'error' && <p className={css.state}>{t('favoritesFailed')}</p>}
      {open && view.status === 'ready' && (
        <>
          {creating && (
            <div className={css.createRow}>
              <input
                className={css.folderInput}
                value={newName}
                placeholder={t('folderName')}
                autoFocus
                onChange={(event) => { setNewName(event.target.value); setCreateError(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') createFolder() }}
              />
              <button type="button" className={css.folderConfirm} disabled={newName.trim() === ''} onClick={createFolder}>
                {t('createFolder')}
              </button>
              {createError !== null && <p className={css.folderError}>{createError}</p>}
            </div>
          )}
          <ul className={css.scopeList}>
            <li>
              <button
                type="button"
                className={scope === 'all' ? `${css.folderEntry} ${css.folderEntrySelected}` : css.folderEntry}
                onClick={() => { setScope('all') }}
                aria-current={scope === 'all' ? 'true' : undefined}
              >
                <IconFolderOpen16 size={14} />
                <span className={css.folderName}>{t('allPapers')}</span>
                <span className={css.folderCount}>{view.papers.length}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={scope === 'uncategorized' ? `${css.folderEntry} ${css.folderEntrySelected}` : css.folderEntry}
                onClick={() => { setScope('uncategorized') }}
                aria-current={scope === 'uncategorized' ? 'true' : undefined}
              >
                <IconFolderClose16 size={14} />
                <span className={css.folderName}>{t('uncategorized')}</span>
                <span className={css.folderCount}>{countOf(null)}</span>
              </button>
            </li>
            {view.folders.map(folder => (
              <FolderRow
                key={folder.id}
                folder={folder}
                count={countOf(folder.id)}
                selected={scope === folder.id}
                onSelect={() => { setScope(folder.id) }}
                t={t}
              />
            ))}
          </ul>
          <div className={css.paperArea}>
            {papersInScope.length === 0 && <p className={css.state}>{t('folderEmpty')}</p>}
            <ul className={css.list}>
              {papersInScope.map((paper) => {
                const authors = paper.authors.length === 0
                  ? ''
                  : paper.authors.length === 1
                    ? paper.authors[0]
                    : `${paper.authors[0]} et al.`
                const meta = [authors, paper.year === null ? '' : String(paper.year), paper.venue]
                  .filter(part => part !== null && part !== '')
                  .join(' · ')
                return (
                  <FavoriteRow
                    key={paper.id}
                    paper={paper}
                    meta={meta}
                    attached={attachedIds.has(paper.id)}
                    attachDisabled={currentId === undefined}
                    onMove={() => { setMovingPaper(paper.id) }}
                    onAttach={toggleAttach}
                    t={t}
                  />
                )
              })}
            </ul>
          </div>
        </>
      )}
      {movingPaperItem !== null && (
        <FolderPicker
          open
          title={t('moveToFolder')}
          uncategorizedLabel={t('uncategorized')}
          newFolderPlaceholder={t('newFolder')}
          createLabel={t('createFolder')}
          folderNameError={t('folderNameError')}
          onPick={(folderId) => {
            setMovingPaper(null)
            markPending(movingPaperItem.id, true)
            favoritesStore.move(movingPaperItem.id, folderId)
              .catch(() => { /* panel stays authoritative; next refresh reconciles */ })
              .finally(() => { markPending(movingPaperItem.id, false) })
          }}
          onClose={() => { setMovingPaper(null) }}
        />
      )}
    </section>
  )
}

/** Registrant plugin: the favorites section in the sidebar hole. */
export const favoritesPanelPlugin = {
  name: 'favorites-panel',
  inject: ['slots'],
  /**
   * Register the panel under the sidebar's favorites hole.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('sidebar.favorites', () => ctx.slots.register({
      name: 'sidebar.favorites',
      locale: NS,
    }, FavoritesPanel))
  },
}
