/**
 * Literature toolview: the keyed `tool.call.toolview` registration for the
 * three literature MCP tools. The SEARCH row is a summary only — the papers
 * it found render as cards in the right-side literature panel
 * (conversation.details.literature), never inline. The fulltext and sources
 * rows keep their inline bodies; an unparseable result falls back to a
 * collapsed raw-output row.
 */

import { useState } from 'react'
import clsx from 'clsx'
import type { Context } from '@deepseek-ai/cordis'
import { IconChevronDownOutline14, IconChevronUpOutline14, IconGlobeOutline14, IconLinkOutline14, IconRightUpOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the tool.call.toolview SlotMap merge (the atomic tool-view hole).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the layout Context merge (ctx.layout) for the registrant.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { literatureModel } from '../paper-model.ts'
import { NS } from '../locale.ts'
import css from './LiteratureRow.module.css'

/** Full row props: the toolview runtime share, the panel-open callback, and the locale seat. */
type LiteratureRowProps = PropsRuntime<'tool.call.toolview'>
  & PropsLocale<'literature'>
  & { openDetails: () => void }

/** Row titles per tool family (design literals, not translatable copy). */
const TOOL_TITLES: Record<string, string> = {
  mcp__literature__literature_search: 'Literature Search',
  mcp__literature__literature_get_fulltext: 'Full Text',
  mcp__literature__literature_sources: 'Sources',
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
export function LiteratureRow({ toolName, block, t, openDetails }: LiteratureRowProps) {
  const [open, setOpen] = useState(false)
  const model = literatureModel(toolName, block)
  const running = !('kind' in block)
  const isSearch = toolName === 'mcp__literature__literature_search'
  // Searching affordance: the sweep/glow animation (LiteratureSearchLoupe) and
  // the row scan shimmer run only while the search tool itself is in flight.
  const searching = isSearch && running
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

  const hasBody = !isSearch && (model !== null || !running)

  return (
    <div className={clsx(css.row, searching && css.searching)}>
      <div className={css.rowHeadLine}>
        <button
          type="button"
          className={css.rowHead}
          onClick={() => { if (hasBody) setOpen(openValue => !openValue) }}
          aria-expanded={open}
          disabled={!hasBody}
        >
          <span className={css.rowIcon}><IconSearchOutline16 size={14} className={searching ? css.searchingIcon : undefined} /></span>
          <span className={css.rowTitle}>{title}</span>
          <span className={css.rowSummary}>{summary}</span>
          {hasBody && (open ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />)}
        </button>
        {isSearch && model?.kind === 'search' && model.papers.length > 0 && (
          <button type="button" className={css.panelButton} onClick={openDetails}>
            {t('viewCards')}
            <IconRightUpOutline14 />
          </button>
        )}
      </div>
      {hasBody && open && (
        <div className={css.rowBody}>
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
  inject: ['slots', 'layout'],
  /**
   * Register the row under the three MCP tool names' keyed toolview holes,
   * handing each row the layout open action for the "view cards" jump.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', function* () {
      const inject = (): { openDetails: () => void } => ({
        openDetails: () => { ctx.layout.openDetails() },
      })
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_search', locale: NS, inject }, LiteratureRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_get_fulltext', locale: NS, inject }, LiteratureRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__literature__literature_sources', locale: NS, inject }, LiteratureRow)
    })
  },
}
