/**
 * @deepseek-ai/dsh-client-ui-aionui-panel — host half: the workspace-gated
 * filesystem service and the /aionui-panel/* HTTP routes (JSON operations +
 * an SSE change stream) on the shared webserver. The browser half
 * (exports "./client") is served by client-modules from the same package's
 * dsh.client declaration.
 *
 * A faithful port of the dsh-web-ui aionui-panel host half, reduced to the
 * filesystem surface: Explorer + Preview need list/read/write/search/delete
 * plus the raw byte route; the SCM git surface is deferred (no git service,
 * no git routes).
 * @module @deepseek-ai/dsh-client-ui-aionui-panel
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import { FsService } from './host/fs-service.ts'
import { createWorkspaceGate } from './host/gate.ts'
import { registerPanelRoutes } from './host/routes.ts'

/** Stable Cordis plugin name. */
export const name = 'ui-aionui-panel'

/** Required services: the route registry and the workspace registry (the fs gate). */
export const inject = ['webServer', 'workspaceRegistry']

/**
 * Mount the panel data service and its routes.
 * @param ctx - context carrying webServer and workspaceRegistry.
 */
export function apply(ctx: Context): void {
  const gate = createWorkspaceGate(ctx)
  const fs = new FsService(gate)
  ctx.effect(() => registerPanelRoutes(ctx, fs), 'ui-aionui-panel: /aionui-panel routes')
}
