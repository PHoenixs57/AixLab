/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-aionui-panel`.
 * @module @deepseek-ai/dsh-client-ui-aionui-panel/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-aionui-panel'

/** Cordis companion plugin name. */
export const name = 'ui-aionui-panel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the panel owns the /aionui-panel prefix route and its
 * fs service, but the route table's register/dispose symmetry is already
 * probed by the webserver companion (reserved-path checks never collide with a
 * live registration), and every fs operation re-runs the workspace gate
 * per-request — the workspace registry's own membership guarantees are the
 * authority. The route disposer symmetry is covered by the package's
 * real-composition HMR-safety test instead.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
