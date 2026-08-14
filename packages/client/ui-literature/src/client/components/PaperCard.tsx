/**
 * Shared paper card: header (star + title), meta line, identifier badges,
 * foldable abstract. Used by the right-side literature panel; the star
 * toggle rides the global favorites store.
 */

import { useCallback, useSyncExternalStore, useState } from 'react'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import { favoritesStore } from '../favorites/store.ts'
import { toFavoritePayload } from '../paper-model.ts'
import type { PaperItem } from '../paper-model.ts'
import { StarIcon } from './icons.tsx'
import css from './PaperCard.module.css'

/** Meta line: authors · year · venue, with graceful absences. */
function metaLine(paper: PaperItem): string {
  const authorPart = paper.authors.length === 0
    ? ''
    : paper.authors.length === 1
      ? paper.authors[0]
      : `${paper.authors[0]} et al.`
  const yearPart = paper.year === null ? '' : String(paper.year)
  return [authorPart, yearPart, paper.venue].filter(part => part !== null && part !== '').join(' · ')
}

/**
 * One paper card.
 * @param paper - the fused paper item.
 * @param t - the literature locale seat.
 */
export function PaperCard({ paper, t }: { paper: PaperItem; t: PropsLocale<'literature'>['t'] }) {
  const view = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
  const [abstractOpen, setAbstractOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = view.status === 'ready' && view.papers.some(savedPaper => savedPaper.id === paper.id)

  const toggleFavorite = useCallback(() => {
    if (busy) return
    setBusy(true)
    setError(null)
    favoritesStore.toggle(toFavoritePayload(paper))
      .catch((reason: unknown) => { setError(String(reason)) })
      .finally(() => { setBusy(false) })
  }, [busy, paper])

  const toggleAbstract = useCallback(() => { setAbstractOpen(open => !open) }, [])

  const hasAbstract = paper.abstract !== null && paper.abstract !== ''
  return (
    <article className={css.card}>
      <div className={css.cardHead}>
        <button
          type="button"
          className={clsx(css.star, saved && css.starSaved)}
          disabled={busy}
          aria-label={saved ? t('removeFavorite') : t('addFavorite')}
          title={saved ? t('removeFavorite') : t('addFavorite')}
          onClick={toggleFavorite}
        >
          <StarIcon filled={saved} size={14} />
        </button>
        <div className={css.cardTitleBlock}>
          <h4 className={css.cardTitle}>
            {paper.url === null
              ? paper.title
              : <a href={paper.url} target="_blank" rel="noreferrer" className={css.cardLink}>{paper.title}</a>}
          </h4>
          <p className={css.cardMeta}>{metaLine(paper)}</p>
        </div>
      </div>
      <div className={css.badges}>
        {paper.doi !== null && (
          <a className={css.badge} href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" title="DOI">
            DOI: {paper.doi}
          </a>
        )}
        {paper.pmid !== null && (
          <a className={css.badge} href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`} target="_blank" rel="noreferrer" title="PubMed">
            PMID: {paper.pmid}
          </a>
        )}
        {paper.arxiv !== null && (
          <a className={css.badge} href={`https://arxiv.org/abs/${paper.arxiv}`} target="_blank" rel="noreferrer" title="arXiv">
            arXiv: {paper.arxiv}
          </a>
        )}
        {paper.openAccess && <span className={css.badge}>{t('openAccess')}</span>}
        {paper.sourceCount > 0 && <span className={css.badge}>{t('sourcesCount').replace('{n}', String(paper.sourceCount))}</span>}
        {paper.pdfUrl !== null && (
          <a className={clsx(css.badge, css.badgeLink)} href={paper.pdfUrl} target="_blank" rel="noreferrer">
            {t('pdfLink')}
          </a>
        )}
      </div>
      {hasAbstract && (
        <div className={css.abstractArea}>
          <button type="button" className={css.abstractToggle} onClick={toggleAbstract} aria-expanded={abstractOpen}>
            {abstractOpen ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
            <span>{t('abstractLabel')}</span>
          </button>
          {abstractOpen && <p className={css.abstract}>{paper.abstract}</p>}
        </div>
      )}
      {error !== null && <p className={css.cardError}>{error}</p>}
    </article>
  )
}
