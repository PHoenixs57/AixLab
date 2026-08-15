/**
 * Attached-papers tiles: compact, horizontally-wrapping tiles over the host's
 * committed attachment state. `ComposerAttachedDock` shows the pending papers
 * (attached but not yet sent) above the message input; `UserAttachedTail`
 * shows the papers each user message carried below that message. Papers are
 * per-message: the host consumes them at turn close. Read-only: removal stays
 * on the paper cards and favorites rows.
 */

import { useEffect } from 'react'
import { IconCheckOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation.input.dock / conversation.chat.user-tail SlotMap merges.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AttachedPaper } from '@deepseek-ai/dsh-literature-attachments/types'
import type { AttachedSessionSource } from '../attached/store.ts'
import css from './AttachedContextBar.module.css'

/** Registration-side business face for both tile entries. */
export interface AttachedContextBarInjected {
  hooks: {
    /** This session's attached set, bound by the renderer as useAttached. */
    attached: AttachedSessionSource
  }
  /** Load this session's attached set once (the store mirrors the host log). */
  load: () => Promise<void>
  /** Re-read this session's attached set (after a turn consumes the pending papers). */
  refresh: () => Promise<void>
}

/** Meta line: first author (et al.), year, with graceful absences. */
function metaLine(paper: AttachedPaper): string {
  const authorPart = paper.authors.length === 0
    ? ''
    : paper.authors.length === 1
      ? paper.authors[0]
      : `${paper.authors[0]} et al.`
  const yearPart = paper.year === null ? '' : String(paper.year)
  return [authorPart, yearPart].filter(part => part !== '').join(' · ')
}

/** The shared tile strip (head + horizontal tile row). */
function AttachedTiles({ papers, t, rootClass }: {
  papers: readonly AttachedPaper[]
  t: PropsLocale<'literature'>['t']
  rootClass: string | undefined
}) {
  return (
    <div className={rootClass} data-attached-context>
      <p className={css.head}>
        <IconCheckOutline14 className={css.check} />
        <span>{t('attachedContextTitle')}</span>
        <span className={css.sep}>·</span>
        <span>{t('attachedContextInjected')}</span>
        <span className={css.sep}>·</span>
        <span>{t('attachedCount').replace('{n}', String(papers.length))}</span>
      </p>
      <ul className={css.tiles}>
        {papers.map(paper => (
          <li key={paper.id} className={css.tile} title={paper.title}>
            <span className={css.tileTitle}>{paper.title}</span>
            {metaLine(paper) !== '' && <span className={css.tileMeta}>{metaLine(paper)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Full props of the composer-dock entry. */
export type ComposerAttachedDockProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<AttachedContextBarInjected>
  & PropsLocale<'literature'>

/**
 * Composer-dock tiles: show the pending papers (attached but not yet sent)
 * above the message input while the turn is idle. Once a turn runs, the
 * papers are in flight and move to the user-message tail.
 * @param props - the composer dock slot props.
 * @returns the tile strip, or null.
 */
export function ComposerAttachedDock({ useAttached, load, useSession, t }: ComposerAttachedDockProps) {
  const papers = useAttached(state => state.papers)
  const running = useSession(state => state.running)

  useEffect(() => {
    void load()
  }, [load])

  if (papers.length === 0 || running) return null
  return <AttachedTiles papers={papers} t={t} rootClass={css.dock} />
}

/** Full props of the user-message tail entry. */
export type UserAttachedTailProps =
  PropsRuntime<'conversation.chat.user-tail'>
  & InjectFace<AttachedContextBarInjected>
  & PropsLocale<'literature'>

/**
 * User-message tail tiles: show the papers this user message carried.
 * @param props - the user-tail slot props (owner seq identifies the message).
 * @returns the tile strip, or null when this message carried no papers.
 */
export function UserAttachedTail({ useAttached, refresh, useSession, seq, t }: UserAttachedTailProps) {
  const papers = useAttached(state => state.byTurn.get(seq))
  const running = useSession(state => state.running)

  // Re-read when a turn settles: the host consumes the pending papers at
  // turn-stopping, so the per-turn record only lands after the boundary.
  useEffect(() => {
    void refresh()
  }, [refresh, seq, running])

  if (papers === undefined || papers.length === 0) return null
  return <AttachedTiles papers={papers} t={t} rootClass={css.tail} />
}
