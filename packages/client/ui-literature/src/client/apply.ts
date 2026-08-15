/** Register the literature tool rows and the favorites panel. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API merge (ctx.remote.literatureFavorites,
// ctx.remote.literatureAttachments) and the branded session id.
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { attachedPapersStore } from './attached/store.ts'
import { ComposerAttachedDock, UserAttachedTail } from './context/AttachedContextBar.tsx'
import { favoritesStore } from './favorites/store.ts'
import { favoritesPanelPlugin } from './favorites/FavoritesPanel.tsx'
import { literaturePanelPlugin } from './panel/LiteraturePanel.tsx'
import { literatureToolview } from './toolviews/literature-row.tsx'
import { NS, en, zh } from './locale.ts'

/** Required services: the slot registry, the Remote namespaces, and the copy. */
export const inject = ['slots', 'remote', 'remote.literatureFavorites', 'remote.literatureAttachments', 'locale']

/**
 * Client plugin body: literature dictionaries, the favorites and attached-
 * papers store bindings, the three keyed tool rows, the sidebar favorites
 * panel, and the details literature panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-literature: dictionaries')

  favoritesStore.attach(ctx.remote.literatureFavorites)
  attachedPapersStore.attach(ctx.remote.literatureAttachments)

  // A reconnect can only invalidate what was already read; a cold store
  // stays cold until a star, a plus, or a panel asks for it.
  ctx.on('connection/reset', () => {
    favoritesStore.resync()
    attachedPapersStore.resync()
  })

  ctx.plugin(literatureToolview)
  ctx.plugin(literaturePanelPlugin)
  ctx.plugin(favoritesPanelPlugin)

  // The committed attached set (the same session log the host folds into
  // context) shows as tiles above the input before any message is sent, then
  // moves below the latest user message.
  const attachedInject = (sessionId: SessionId) => ({
    hooks: { attached: attachedPapersStore.sessionSource(sessionId) },
    load: () => attachedPapersStore.ensure(sessionId),
    refresh: () => attachedPapersStore.refresh(sessionId),
  })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'attached',
    order: 30,
    locale: NS,
    inject: attachedInject,
  }, ComposerAttachedDock))
  ctx.slots.inject('conversation.chat.user-tail', () => ctx.slots.register({
    name: 'conversation.chat.user-tail',
    id: 'attached',
    locale: NS,
    inject: attachedInject,
  }, UserAttachedTail))
}
