/** Tiny inline glyphs the literature UI needs and ui-primitives lacks. */

/** One star glyph (filled/outline). */
export function StarIcon({ filled, size = 14, className }: { filled: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 1.5l1.86 3.9 4.3 0.54-3.17 3 0.82 4.28L8 11.17l-3.81 2.05 0.82-4.28-3.17-3 4.3-0.54L8 1.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** One plus glyph (filled/outline): the add-to-conversation toggle. */
export function PlusIcon({ filled, size = 14, className }: { filled: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 3.2v9.6M3.2 8h9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={filled ? 2.4 : 1.4}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** One minus glyph for the remove-from-conversation toggle. */
export function MinusIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.2 8h9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
