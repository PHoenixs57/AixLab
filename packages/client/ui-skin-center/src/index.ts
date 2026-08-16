/**
 * Host half of the in-GUI skin center: mounts the `/api/skin-center/*`
 * routes the browser half uses for one-click apply / restore-official, and
 * declares the persisted `skin-background` settings namespace. Every switch
 * rewrites the managed section of the running profile's cordis.patch.yml;
 * the config watcher hot-reloads the patch, so no restart is needed.
 * Try-on stays pure browser work (see src/client/try-on.ts).
 */

import { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
// Type-only: pulls the dsh-host-webserver service seat (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeSkinCenterRoutes } from './routes.ts'

export { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from './routes.ts'

/** Stable cordis plugin name (matches the web-app patch insert id). */
export const name = 'ui-skin-center'

/** Services required before the skin-center can mount its routes. */
export const inject = ['webServer']

/** Settings namespace for the main-interface background scrim. */
export const SKIN_BACKGROUND_NAMESPACE = settingsNamespace('skin-background')

export interface SkinBackgroundConfig {
  /** Background occlusion 0-100 (0 = no extra veil, 100 = fully obscured). */
  backgroundOpacity?: number
}

/** Runtime schema for SkinBackgroundConfig. */
export const SkinBackgroundConfigSchema: z<SkinBackgroundConfig> = z.object({
  backgroundOpacity: z.number().min(0).max(100).step(5).default(0),
})

/**
 * Register the skin-center API routes and the background-scrim settings.
 * @param ctx - cordis context.
 */
export function apply(ctx: Context): void {
  installSettingsSection(ctx, SKIN_BACKGROUND_NAMESPACE, SkinBackgroundConfigSchema, {}, {
    setSource: () => { /* application is browser-side; value is read from the scope */ },
    onChange: () => { /* browser half re-applies on scope publish */ },
  })

  const routes = makeSkinCenterRoutes()
  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const route of routes) disposers.push(ctx.webServer.register(route))
      } catch (error) {
        for (const dispose of disposers) dispose()
        throw error
      }
      return () => { for (const dispose of disposers) dispose() }
    }, 'ui-skin-center: routes')
  } catch (error) {
    console.error('[ui-skin-center] route registration failed:', error)
  }
}
