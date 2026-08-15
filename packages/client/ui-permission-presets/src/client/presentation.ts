/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(value: string, name: string): string {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

/**
 * Locale keys for the three product-known preset labels, keyed by machine
 * value. Host-configured presets outside the design set keep their
 * conventional display name.
 */
export const PRESET_LABEL_KEYS = {
  'read-only': 'preset.read-only',
  'workspace-write': 'preset.workspace-write',
  'danger-full-access': 'preset.danger-full-access',
} as const

/** The locale keys a namespace dictionary must carry for preset labels. */
export type PresetLabelKey = (typeof PRESET_LABEL_KEYS)[keyof typeof PRESET_LABEL_KEYS]

/**
 * Render a preset label through the active locale: known machine values
 * translate through the bound namespace dictionary; anything else falls back
 * to the conventional display name.
 * @param value - preset machine value.
 * @param fallback - locale-independent display name for unknown values.
 * @param t - translation function bound to the owning namespace.
 * @returns the localized label, or {@link fallback} for unknown values.
 */
export function displayPresetLabel(value: string, fallback: string, t: (key: PresetLabelKey) => string): string {
  const key = PRESET_LABEL_KEYS[value as keyof typeof PRESET_LABEL_KEYS]
  return key === undefined ? fallback : t(key)
}
