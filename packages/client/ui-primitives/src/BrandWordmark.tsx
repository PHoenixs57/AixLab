// AixLab brand wordmark: the document-and-magnifier mark + "AixLab"
// letterforms in one svg. Native 96x24. Ink rides currentColor; the mark's
// lens knockout uses the inverted label color so it stays legible in both
// themes.

import type { IconProps } from './icons/props.ts'

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24; width keeps the 96:24 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={(size * 96) / 24}
      height={size}
      className={className}
      viewBox="0 0 96 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 2.5C5 1.672 5.672 1 6.5 1H14.5L19 5.5V19.5C19 20.328 18.328 21 17.5 21H6.5C5.672 21 5 20.328 5 19.5V2.5Z" fill="currentColor"/>
      <path d="M14.5 1V5C14.5 5.276 14.724 5.5 15 5.5H19L14.5 1Z" fill="currentColor"/>
      <circle cx="14.5" cy="14" r="4" fill="currentColor"/>
      <path d="M17.4 16.9L20.5 20L19.5 21L16.4 17.9L17.4 16.9Z" fill="currentColor"/>
      <path d="M12.4 13.8C12.4 12.641 13.341 11.7 14.5 11.7C15.659 11.7 16.6 12.641 16.6 13.8C16.6 14.959 15.659 15.9 14.5 15.9C13.341 15.9 12.4 14.959 12.4 13.8Z" fill="var(--dsw-alias-label-primary-inverted, #fff)"/>
      <text
        x="28"
        y="17.2"
        fontSize="16"
        fontWeight="600"
        fill="currentColor"
        letterSpacing="0.1"
      >
        AixLab
      </text>
    </svg>
  )
}
