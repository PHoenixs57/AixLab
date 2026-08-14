/** Register the literature tool rows and the favorites panel. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API merge (ctx.remote.literatureFavorites).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { favoritesStore } from './favorites/store.ts'
import { favoritesPanelPlugin } from './favorites/FavoritesPanel.tsx'
import { literaturePanelPlugin } from './panel/LiteraturePanel.tsx'
import { literatureToolview } from './toolviews/literature-row.tsx'
import { NS, en, zh } from './locale.ts'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.literatureFavorites', 'locale']

/**
 * Client plugin body: literature dictionaries, the favorites store binding,
 * the three keyed tool rows, and the sidebar favorites panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-literature: dictionaries')

  favoritesStore.attach(ctx.remote.literatureFavorites)

  // A reconnect can only invalidate what was already read; a cold store
  // stays cold until a star or the panel asks for it.
  ctx.on('connection/reset', () => { favoritesStore.resync() })

  ctx.plugin(literatureToolview)
  ctx.plugin(literaturePanelPlugin)
  ctx.plugin(favoritesPanelPlugin)
}
