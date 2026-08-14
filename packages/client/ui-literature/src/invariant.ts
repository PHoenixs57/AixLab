/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-literature`.
 * @module @deepseek-ai/dsh-client-ui-literature/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-literature'

/** Cordis companion plugin name. */
export const name = 'client-ui-literature-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: literature UI composition is browser-only and
 * contributes no events or cross-plugin mutable state; slot ownership is
 * checked by ui-slots.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
