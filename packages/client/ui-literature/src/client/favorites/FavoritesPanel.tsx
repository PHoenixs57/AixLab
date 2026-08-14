/**
 * Favorites panel: the `sidebar.favorites` occupant. Wide shows a foldable
 * saved-paper library (count always visible, list unfolds on demand) with
 * per-item remove; the rail shows a bookmark glyph with the count that
 * expands the sidebar on click.
 */

import { useCallback, useEffect, useSyncExternalStore, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconChevronDownOutline14, IconChevronUpOutline14, IconLinkOutline14, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the sidebar.favorites SlotMap merge from the sidebar shell.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { StarIcon } from '../components/icons.tsx'
import { favoritesStore } from './store.ts'
import { NS } from '../locale.ts'
import css from './FavoritesPanel.module.css'

/** Full panel props: the sidebar hole owner share plus the locale seat. */
type FavoritesPanelProps = PropsRuntime<'sidebar.favorites'> & PropsLocale<'literature'>

/** One saved-paper row. */
function FavoriteRow({ id, title, url, meta }: { id: string; title: string; url: string | null; meta: string }) {
  const pending = useSyncExternalStore(
    subscribePending,
    getPendingSnapshot,
  )
  const busy = pending.has(id)
  const remove = useCallback(() => {
    if (busy) return
    markPending(id, true)
    favoritesStore.remove(id)
      .catch(() => { /* panel stays authoritative; next refresh reconciles */ })
      .finally(() => { markPending(id, false) })
  }, [busy, id])

  return (
    <li className={css.item}>
      <div className={css.itemBody}>
        <p className={css.itemTitle}>
          {url === null
            ? title
            : <a href={url} target="_blank" rel="noreferrer" className={css.itemLink}>{title}</a>}
        </p>
        {meta !== '' && <p className={css.itemMeta}>{meta}</p>}
      </div>
      {url !== null && (
        <a className={css.itemAction} href={url} target="_blank" rel="noreferrer" aria-label="open">
          <IconLinkOutline14 />
        </a>
      )}
      <button type="button" className={css.itemAction} disabled={busy} onClick={remove} aria-label="remove">
        <IconTrashOutline16 size={14} />
      </button>
    </li>
  )
}

/** Pending-removal id set observable (tiny local store; snapshots are immutable). */
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

/** The sidebar favorites section: a foldable library row. */
export function FavoritesPanel({ wide, expandSidebar, t }: FavoritesPanelProps) {
  const view = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
  // Folded by default: the count stays visible, the list unfolds on demand.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void favoritesStore.ensure()
  }, [])

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

  return (
    <section className={css.panel} aria-label={t('favoritesTitle')}>
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
      {open && view.status === 'loading' && <p className={css.state}>{t('favoritesLoading')}</p>}
      {open && view.status === 'error' && <p className={css.state}>{t('favoritesFailed')}</p>}
      {open && view.status === 'ready' && view.papers.length === 0 && (
        <p className={css.state}>{t('favoritesEmpty')}</p>
      )}
      {open && view.status === 'ready' && view.papers.length > 0 && (
        <ul className={css.list}>
          {view.papers.map((paper) => {
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
                id={paper.id}
                title={paper.title}
                url={paper.url}
                meta={meta}
              />
            )
          })}
        </ul>
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
