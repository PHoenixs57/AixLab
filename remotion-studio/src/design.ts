// deepseek-aix brand palette shared by every composition. Keep new compositions
// on-palette so the generated assets match the web app theme.
export const palette = {
  primary: '#4D6BFE',
  primaryDark: '#3A50D9',
  teal: '#14B8A6',
  violet: '#8B5CF6',
  amber: '#F59E0B',
  ink: '#0B1020',
  bubble: '#EEF1F8',
  border: '#E3E8F4',
  paper: '#FFFFFF',
  muted: '#8A93A8',
} as const

// Default spring config shared by entrance animations (slightly bouncy).
export const entranceSpring = {
  damping: 13,
  stiffness: 130,
  mass: 0.55,
} as const
