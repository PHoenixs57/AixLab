// AixLab brand mark (rail glyph): the microscope product icon. Native
// 512x512, rendered square at the requested size. A raster mark, so it does
// not ride currentColor — the light and dark variants are two stacked images
// and the theme marker (body[data-ds-dark-theme]) shows the right one.

import clsx from 'clsx'
import type { IconProps } from './icons/props.ts'
import css from './BrandIcon.module.css'

/**
 * Render the brand mark.
 * @param props.size - width/height in px (default 24; square).
 * @param props.className - extra class for layout placement (lands on both variants).
 * @returns the mark image (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <>
      <img
        src="/microscope.png"
        width={size}
        height={size}
        className={clsx(className, css.light)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        src="/microscope-white.png"
        width={size}
        height={size}
        className={clsx(className, css.dark)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </>
  )
}
