// DetailsPanel: the right-side details column. deepseek-aix hosts only the
// literature window here ("papers collected this conversation"); the
// upstream tool-details body (click a tool row to see its input/output) was
// removed.

import type { DetailsSlotProps } from '../contract/slots.ts'
import css from './DetailsPanel.module.css'

/** Full props composed by reference from the contract (automatic shares & injected share). */
export type DetailsPanelProps = DetailsSlotProps

export function DetailsPanel({ renderSlot, closeDetails, t }: DetailsPanelProps) {
  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.title}>{t('details.title')}</div>
        <button
          type="button" className={css.close} aria-label={t('details.close')}
          onClick={() => { closeDetails() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={css.body}>
        {/* The literature window: papers collected this conversation, owned
            by the literature UI plugin. */}
        {renderSlot('conversation.details.literature', {})}
      </div>
    </div>
  )
}
