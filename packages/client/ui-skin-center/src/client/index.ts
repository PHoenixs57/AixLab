/**
 * In-GUI skin center, browser half: registers the Skin Center card into the
 * shipped Plugins settings section (`settings.plugin.item`) and provides the
 * try-on controller + theme/background handles to it. The card lists every
 * installed skin, tries it on live inside the GUI (the real client bundle,
 * light/dark preview), exits with a full restore, and applies in one click
 * through the host /api/skin-center API (profile patch hot-reload, no restart).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: locale Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: settings Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the settings.plugin.item slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { SkinCenter, type SkinCenterInjected } from './SkinCenter.tsx'
import { BackgroundController, SKIN_BACKGROUND_NS } from './background.ts'
import { en, zh, type SkinCenterKey } from './locales.ts'
import { TryOnController } from './try-on.ts'

export type { SkinCenterComponentProps, SkinCenterInjected } from './SkinCenter.tsx'
export { TryOnController } from './try-on.ts'

/** Locale namespace owned by this plugin. */
export const NS = 'skinCenter'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The skin-center card's copy. */
    skinCenter: SkinCenterKey
  }
}

/** Required services: slots + locale, theme preview, and settingsScope for the background scrim. */
export const inject = ['slots', 'locale', 'theme', 'settingsScope']

/**
 * Register the skin-center dictionaries, the body scope attribute, and the
 * Skins plugin card inside the Plugins settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skin-center: dictionaries')

  // The card's own styles scope under this attribute so they keep applying
  // during try-on (when the active skin's attribute is retracted).
  ctx.effect(() => {
    document.body.dataset.dshSkinCenter = ''
    return () => { delete document.body.dataset.dshSkinCenter }
  }, 'ui-skin-center: body scope')

  const theme = ctx.theme as ThemeRuntime
  const controller = new TryOnController()
  const backgroundScope = ctx.settingsScope.bind<{ backgroundOpacity?: number }>({ namespace: SKIN_BACKGROUND_NS })
  const background = new BackgroundController(backgroundScope)
  const injected = (): SkinCenterInjected => ({
    controller,
    theme: {
      getTheme: () => theme.getTheme(),
      subscribe: listener => ctx.on('theme/change', listener),
      setTheme: id => theme.setTheme(id),
    },
    background: {
      opacity: () => background.opacity(),
      subscribe: listener => background.subscribe(listener),
      set: opacity => background.set(opacity),
    },
  })

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'skins',
    order: 110,
    locale: NS,
    inject: injected,
  }, SkinCenter))
}
