/**
 * Literature toolview: the keyed `tool.call.toolview` registration for the
 * three literature MCP tools. One row component owns all three keys; the
 * derived model's `kind` decides the card body (paper list, fulltext
 * sections, source table). A running call or an unparseable result falls
 * back to a summary row with the raw output collapsed.
 */

import { useCallback, useSyncExternalStore, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconChevronDownOutline14, IconChevronUpOutline14, IconGlobeOutline14, IconLinkOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the tool.call.toolview SlotMap merge (the atomic tool-view hole).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import clsx from 'clsx'
import { StarIcon } from '../components/icons.tsx'
import { favoritesStore } from '../favorites/store.ts'
import { literatureModel, toFavoritePayload } from '../paper-model.ts'
import type { PaperItem, SearchCardModel } from '../paper-model.ts'
import { NS } from '../locale.ts'
import css from './LiteratureRow.module.css'

/** Full row props: the toolview runtime share plus the standard locale seat. */
type LiteratureRowProps = PropsRuntime<'tool.call.toolview'> & PropsLocale<'literature'>

/** Row titles per tool family (design literals, not translatable copy). */
const TOOL_TITLES: Record<string, string> = {
  mcp__literature__literature_search: 'Literature Search',
  mcp__literature__literature_get_fulltext: 'Full Text',
  mcp__literature__literature_sources: 'Sources',
}

/** Meta line: authors · year · venue, with graceful absences. */
function metaLine(paper: PaperItem, locale: { etAl: string }): string {
  const authorPart = paper.authors.length === 0
    ? ''
    : paper.authors.length === 1
      ? paper.authors[0]
      : `${paper.authors[0]} ${locale.etAl}`
  const yearPart = paper.year === null ? '' : String(paper.year)
  return [authorPart, yearPart, paper.venue].filter(part => part !== null && part !== '').join(' · ')
}

/** One paper card: header (star + title), meta line, badges, foldable abstract. */
function PaperCard({ paper, t }: { paper: PaperItem; t: LiteratureRowProps['t'] }) {
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
          <p className={css.cardMeta}>{metaLine(paper, { etAl: 'et al.' })}</p>
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

/** Whole search-row body: the paper card list. */
function SearchBody({ model, t }: { model: SearchCardModel; t: LiteratureRowProps['t'] }) {
  if (model.papers.length === 0) {
    return <p className={css.empty}>{model.allSourcesFailed ? t('searchFailed') : t('searchEmpty')}</p>
  }
  return (
    <div className={css.cardList}>
      {model.papers.map(paper => (
        <PaperCard key={`${paper.id ?? paper.title}-${paper.rank}`} paper={paper} t={t} />
      ))}
    </div>
  )
}

/** Fulltext body: title, status, collapsible sections. */
function FulltextBody({ model, t }: { model: NonNullable<ReturnType<typeof literatureModel>> & { kind: 'fulltext' }; t: LiteratureRowProps['t'] }) {
  const [open, setOpen] = useState(false)
  if (model.status !== 'ok') {
    return <p className={css.empty}>{model.status === 'not_found' ? t('fulltextNotFound') : t('parseFailed')}</p>
  }
  return (
    <div className={css.fulltext}>
      {model.title !== null && <h4 className={css.cardTitle}>{model.title}</h4>}
      <button type="button" className={css.abstractToggle} onClick={() => { setOpen(openValue => !openValue) }} aria-expanded={open}>
        {open ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
        <span>{t('fulltextSections')}</span>
      </button>
      {open && (
        <div className={css.sections}>
          {model.sections.length > 0
            ? model.sections.map((section, index) => (
              <section key={`${section.heading}-${index}`} className={css.section}>
                {section.heading !== '' && <h5 className={css.sectionHeading}>{section.heading}</h5>}
                <p className={css.sectionText}>{section.text}</p>
              </section>
            ))
            : <p className={css.sectionText}>{model.fullText}</p>}
        </div>
      )}
      {model.url !== null && (
        <a className={css.badge} href={model.url} target="_blank" rel="noreferrer">
          <IconLinkOutline14 /> {t('paperLink')}
        </a>
      )}
    </div>
  )
}

/** Sources body: the seven-provider capability table. */
function SourcesBody({ model, t }: { model: NonNullable<ReturnType<typeof literatureModel>> & { kind: 'sources' }; t: LiteratureRowProps['t'] }) {
  return (
    <div className={css.sources}>
      {model.defaultOrder.length > 0 && (
        <p className={css.sourceOrder}>{t('sourceOrder')}: {model.defaultOrder.join(' → ')}</p>
      )}
      {model.sources.map(source => (
        <div key={source.id} className={css.source}>
          <div className={css.sourceHead}>
            <span className={css.sourceName}>{source.name}</span>
            <span className={css.sourceId}>{source.id}</span>
            {source.homepage !== '' && (
              <a className={css.badge} href={source.homepage} target="_blank" rel="noreferrer">
                <IconGlobeOutline14 /> {t('paperLink')}
              </a>
            )}
          </div>
          {source.description !== '' && <p className={css.sourceDesc}>{source.description}</p>}
          {source.credentials.length > 0 && (
            <p className={css.sourceCred}>
              {t('sourceCredentials').replace('{n}', String(source.credentials.filter(cred => cred.configured).length))}
              {source.credentials.map(cred => cred.name).join(', ') !== '' && ` (${source.credentials.map(cred => cred.name).join(', ')})`}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/** The keyed row: one component registered under all three tool names. */
export function LiteratureRow({ toolName, block, t }: LiteratureRowProps) {
  const [open, setOpen] = useState(false)
  const model = literatureModel(toolName, block)
  const running = !('kind' in block)
  const rawText = 'kind' in block
    ? block.content.filter(item => item.type === 'text').map(item => (item as { text: string }).text).join('\n')
    : ''

  const title = TOOL_TITLES[toolName] ?? t('searchTitle')
  const summary = running
    ? t('running')
    : model?.kind === 'search'
      ? t('searchSummary').replace('{n}', String(model.papers.length)).replace('{query}', model.query)
      : model?.kind === 'fulltext'
        ? model.title ?? t('fulltextTitle')
        : model?.kind === 'sources'
          ? `${model.sources.length} sources`
          : t('parseFailed')

  return (
    <div className={css.row}>
      <button type="button" className={css.rowHead} onClick={() => { setOpen(openValue => !openValue) }} aria-expanded={open}>
        <span className={css.rowIcon}><IconSearchOutline16 size={14} /></span>
        <span className={css.rowTitle}>{title}</span>
        <span className={css.rowSummary}>{summary}</span>
        {open ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
      </button>
      {open && (
        <div className={css.rowBody}>
          {model?.kind === 'search' && <SearchBody model={model} t={t} />}
          {model?.kind === 'fulltext' && <FulltextBody model={model} t={t} />}
          {model?.kind === 'sources' && <SourcesBody model={model} t={t} />}
          {model === null && !running && (
            <pre className={css.raw}>{rawText === '' ? t('parseFailed') : rawText}</pre>
          )}
        </div>
      )}
    </div>
  )
}

/** Registrant plugin: one keyed registration per literature tool name. */
export const literatureToolview = {
  name: 'literature-toolview',
  inject: ['slots'],
  /**
   * Register the row under the three MCP tool names' keyed toolview holes.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_search', locale: NS }, LiteratureRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_get_fulltext', locale: NS }, LiteratureRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_sources', locale: NS }, LiteratureRow)
    })
  },
}
