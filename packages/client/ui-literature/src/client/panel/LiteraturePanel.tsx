/**
 * The literature window: the right details column's persistent section
 * listing every paper this conversation collected, as bookmarkable cards.
 * It auto-opens the details column once a turn settles with new papers.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { shallowEqual } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation.details.literature SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the layout Context merge (ctx.layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { attachedPapersStore } from '../attached/store.ts'
import { PaperCard } from '../components/PaperCard.tsx'
import { collectPapers } from '../collection.ts'
import { paperStableId, toAttachedPayload } from '../paper-model.ts'
import type { PaperItem } from '../paper-model.ts'
import { NS } from '../locale.ts'
import css from './LiteraturePanel.module.css'

/** Full panel props: the details-seat framework share, the layout open callback, and the locale seat. */
type LiteraturePanelProps = PropsRuntime<'conversation.details.literature'>
  & PropsLocale<'literature'>
  & { openDetails: () => void }

/** Open the right column once a settled turn produced papers the panel did not have before. */
function useAutoOpen(papersCount: number, running: boolean, openDetails: () => void): void {
  const previous = useRef({ running: true, count: 0 })
  useEffect(() => {
    const last = previous.current
    previous.current = { running, count: papersCount }
    if (papersCount > 0 && !running && (last.running || last.count !== papersCount)) {
      openDetails()
    }
  }, [papersCount, running, openDetails])
}

/** The right-column literature section. */
export function LiteraturePanel({ useSession, sessionId, openDetails, t }: LiteraturePanelProps) {
  // The whole snapshot: nodes ride structural sharing, so shallowEqual keeps
  // re-renders to frames whose node list actually changed.
  const snapshot = useSession(s => s, shallowEqual)
  const papers = useMemo(() => collectPapers(snapshot), [snapshot])
  const attachedView = useSyncExternalStore(attachedPapersStore.subscribe, attachedPapersStore.getSnapshot)
  const [open, setOpen] = useState(true)
  // The paper list starts at the default 60vh cap; the bottom drag handle
  // lets the user pull the window taller (component-local view state).
  const [listHeight, setListHeight] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const dragHandlers = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null)

  // Load this session's attached set once; the store mirrors the host log.
  useEffect(() => {
    if (sessionId !== undefined) void attachedPapersStore.ensure(sessionId)
  }, [sessionId])

  const attachedIds = useMemo(() => {
    const state = sessionId === undefined ? undefined : attachedView.sessions[sessionId]
    return new Set(state?.papers.map(paper => paper.id) ?? [])
  }, [attachedView, sessionId])

  const onAttach = useCallback((paper: PaperItem): Promise<void> => {
    if (sessionId === undefined) return Promise.resolve()
    return attachedPapersStore.attachPaper(sessionId, toAttachedPayload(paper))
  }, [sessionId])

  const onDetach = useCallback((paper: PaperItem): Promise<void> => {
    if (sessionId === undefined) return Promise.resolve()
    return attachedPapersStore.detachPaper(sessionId, paperStableId(paper))
  }, [sessionId])

  // Unmount mid-drag: the window listeners must not outlive the panel.
  useEffect(() => () => {
    if (dragHandlers.current !== null) {
      window.removeEventListener('pointermove', dragHandlers.current.move)
      window.removeEventListener('pointerup', dragHandlers.current.up)
      dragHandlers.current = null
    }
  }, [])

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = listRef.current?.offsetHeight ?? 140
    const move = (ev: PointerEvent): void => {
      const next = Math.min(Math.max(startHeight + ev.clientY - startY, 140), window.innerHeight * 0.85)
      setListHeight(next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dragHandlers.current = null
    }
    dragHandlers.current = { move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  useAutoOpen(papers.length, snapshot.running, openDetails)

  return (
    <section className={css.panel} aria-label={t('panelTitle')}>
      <button
        type="button"
        className={css.head}
        onClick={() => { setOpen(value => !value) }}
        aria-expanded={open}
        aria-label={t('panelTitle')}
      >
        <span className={css.title}>{t('panelTitle')}</span>
        <span className={css.count}>{papers.length}</span>
        <span className={css.chevron}>
          {open ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
        </span>
      </button>
      {open && papers.length === 0 && <p className={css.empty}>{t('panelEmpty')}</p>}
      {open && papers.length > 0 && (
        <>
          <div
            ref={listRef}
            className={css.list}
            style={listHeight === null ? undefined : { maxHeight: listHeight }}
          >
            {papers.map(paper => (
              <PaperCard
                key={paper.id ?? `${paper.title}-${paper.rank}`}
                paper={paper}
                t={t}
                attached={attachedIds.has(paperStableId(paper))}
                onAttach={() => onAttach(paper)}
                onDetach={() => onDetach(paper)}
              />
            ))}
          </div>
          <div className={css.resizeHandle} onPointerDown={startResize} aria-hidden="true" />
        </>
      )}
    </section>
  )
}

/** Registrant plugin: the literature section in the details panel seat. */
export const literaturePanelPlugin = {
  name: 'literature-panel',
  inject: ['slots', 'layout'],
  /**
   * Register the panel under the details column's literature seat, handing
   * it the layout open action for the auto-open behavior.
   * @param ctx - registrant context.
   */
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.details.literature', () => ctx.slots.register({
      name: 'conversation.details.literature',
      locale: NS,
      inject: (): { openDetails: () => void } => ({
        openDetails: () => { ctx.layout.openDetails() },
      }),
    }, LiteraturePanel))
  },
}
