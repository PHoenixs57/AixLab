/**
 * Session-header utility: toggle the right details column (the literature
 * window) from the chat's top-right — the "collapse the papers panel" switch,
 * mirroring the sidebar collapse affordance.
 */

import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DetailsPanelToggle.module.css'

/** Full props: the utilities seat runtime share, the injected toggle, and the locale seat. */
export type DetailsPanelToggleProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'conversation'>
  & { toggleDetails: () => void }

/** The right-aligned details-panel switch. */
export function DetailsPanelToggle({ toggleDetails, t }: DetailsPanelToggleProps) {
  return (
    <button
      type="button"
      className={css.trigger}
      aria-label={t('details.toggle')}
      title={t('details.toggle')}
      onClick={toggleDetails}
    >
      <IconPanelLeftOutline16 className={css.icon} size={16} />
    </button>
  )
}
