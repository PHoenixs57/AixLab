/**
 * Shared paper card: header (star + add-to-conversation plus + title), meta
 * line, identifier badges, foldable abstract. Used by the right-side
 * literature panel; the star toggle rides the global favorites store, while
 * the plus toggle's state and callbacks come from the panel's session.
 */

import { useCallback, useSyncExternalStore, useState } from 'react'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import { favoritesStore } from '../favorites/store.ts'
import { toFavoritePayload } from '../paper-model.ts'
import type { PaperItem } from '../paper-model.ts'
import { FolderPicker } from './FolderPicker.tsx'
import { MinusIcon, PlusIcon, StarIcon } from './icons.tsx'
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
 * @param attached - whether this paper is attached to the current session.
 * @param onAttach - attach this paper to the current session.
 * @param onDetach - detach this paper from the current session.
 */
export function PaperCard({ paper, t, attached, onAttach, onDetach }: {
  paper: PaperItem
  t: PropsLocale<'literature'>['t']
  attached: boolean
  onAttach: () => Promise<void>
  onDetach: () => Promise<void>
}) {
  const view = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
  const [abstractOpen, setAbstractOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const saved = view.status === 'ready' && view.papers.some(savedPaper => savedPaper.id === paper.id)

  // Star is a two-way door: unstar removes directly, star opens the folder
  // chooser (the user picks the category the paper is filed under).
  const onStar = useCallback(() => {
    if (busy || paper.id === null) return
    if (saved) {
      setBusy(true)
      setError(null)
      favoritesStore.remove(paper.id)
        .catch((reason: unknown) => { setError(String(reason)) })
        .finally(() => { setBusy(false) })
      return
    }
    setPickerOpen(true)
  }, [busy, saved, paper.id])

  const onPickFolder = useCallback((folderId: string | null) => {
    setPickerOpen(false)
    setBusy(true)
    setError(null)
    favoritesStore.add(toFavoritePayload(paper), folderId)
      .catch((reason: unknown) => { setError(String(reason)) })
      .finally(() => { setBusy(false) })
  }, [paper])

  const toggleAbstract = useCallback(() => { setAbstractOpen(open => !open) }, [])

  const onAttachToggle = useCallback(() => {
    if (attachBusy) return
    setAttachBusy(true)
    setError(null)
    ;(attached ? onDetach() : onAttach())
      .catch((reason: unknown) => { setError(String(reason)) })
      .finally(() => { setAttachBusy(false) })
  }, [attachBusy, attached, onAttach, onDetach])

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
          onClick={onStar}
        >
          <StarIcon filled={saved} size={14} />
        </button>
        <button
          type="button"
          className={clsx(css.attach, attached && css.attachActive)}
          disabled={attachBusy}
          aria-label={attached ? t('detachFromConversation') : t('attachToConversation')}
          title={attached ? t('detachFromConversation') : t('attachToConversation')}
          onClick={onAttachToggle}
        >
          {attached ? <MinusIcon size={14} /> : <PlusIcon filled={false} size={14} />}
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
      <FolderPicker
        open={pickerOpen}
        title={t('chooseFolder')}
        uncategorizedLabel={t('uncategorized')}
        newFolderPlaceholder={t('newFolder')}
        createLabel={t('createFolder')}
        folderNameError={t('folderNameError')}
        onPick={onPickFolder}
        onClose={() => { setPickerOpen(false) }}
      />
    </article>
  )
}
