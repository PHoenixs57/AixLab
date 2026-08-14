// AixLab brand mark (rail glyph): a folded document sheet under a
// magnifying glass — "literature, found". Native 24x24 square; rendered
// 24x24 by default. Color rides currentColor (wordmark ink).

import type { IconProps } from './icons/props.ts'

/**
 * Render the brand mark.
 * @param props.size - width in px (default 24; square).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 2.5C5 1.672 5.672 1 6.5 1H14.5L19 5.5V19.5C19 20.328 18.328 21 17.5 21H6.5C5.672 21 5 20.328 5 19.5V2.5Z" fill="currentColor"/>
      <path d="M14.5 1V5C14.5 5.276 14.724 5.5 15 5.5H19L14.5 1Z" fill="currentColor"/>
      <circle cx="14.5" cy="14" r="4" fill="currentColor"/>
      <path d="M17.4 16.9L20.5 20L19.5 21L16.4 17.9L17.4 16.9Z" fill="currentColor"/>
      <path d="M12.4 13.8C12.4 12.641 13.341 11.7 14.5 11.7C15.659 11.7 16.6 12.641 16.6 13.8C16.6 14.959 15.659 15.9 14.5 15.9C13.341 15.9 12.4 14.959 12.4 13.8Z" fill="var(--dsw-alias-label-primary-inverted, #fff)"/>
    </svg>
  )
}
