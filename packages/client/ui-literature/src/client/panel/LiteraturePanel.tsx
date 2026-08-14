/**
 * The literature window: the right details column's persistent section
 * listing every paper this conversation collected, as bookmarkable cards.
 * It auto-opens the details column once a turn settles with new papers.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { shallowEqual } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation.details.literature SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the layout Context merge (ctx.layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { PaperCard } from '../components/PaperCard.tsx'
import { collectPapers } from '../collection.ts'
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
export function LiteraturePanel({ useSession, openDetails, t }: LiteraturePanelProps) {
  // The whole snapshot: nodes ride structural sharing, so shallowEqual keeps
  // re-renders to frames whose node list actually changed.
  const snapshot = useSession(s => s, shallowEqual)
  const papers = useMemo(() => collectPapers(snapshot), [snapshot])

  useAutoOpen(papers.length, snapshot.running, openDetails)

  return (
    <section className={css.panel} aria-label={t('panelTitle')}>
      <header className={css.head}>
        <h3 className={css.title}>{t('panelTitle')}</h3>
        <span className={css.count}>{papers.length}</span>
      </header>
      {papers.length === 0
        ? <p className={css.empty}>{t('panelEmpty')}</p>
        : (
          <div className={css.list}>
            {papers.map(paper => (
              <PaperCard key={paper.id ?? `${paper.title}-${paper.rank}`} paper={paper} t={t} />
            ))}
          </div>
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
