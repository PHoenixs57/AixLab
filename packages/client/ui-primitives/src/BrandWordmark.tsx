// deepseek-aix brand wordmark: the microscope product icon + "deepseek-aix" letterforms.
// Native mark 512x512 rendered at `size`; the letterforms ride currentColor,
// the raster mark does not — light and dark image variants toggle on the
// theme marker (body[data-ds-dark-theme]).

import type { IconProps } from './icons/props.ts'
import css from './BrandIcon.module.css'

/**
 * Render the full brand wordmark.
 * @param props.size - mark height in px (default 24; the letterforms scale with it).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: size * 0.62,
        fontWeight: 600,
        letterSpacing: 0.1,
        color: 'currentColor',
        whiteSpace: 'nowrap',
      }}
      aria-hidden="true"
    >
      <img
        src="/microscope.png"
        width={size}
        height={size}
        className={css.light}
        alt=""
        draggable={false}
      />
      <img
        src="/microscope-white.png"
        width={size}
        height={size}
        className={css.dark}
        alt=""
        draggable={false}
      />
      <span>deepseek-aix</span>
    </span>
  )
}
