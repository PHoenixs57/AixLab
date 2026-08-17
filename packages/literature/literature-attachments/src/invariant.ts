/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-literature-attachments`.
 * @module @deepseek-ai/dsh-literature-attachments/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-literature-attachments'

/** Cordis companion plugin name. */
export const name = 'literature-attachments-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the attachment set is the session log itself, and
 * dsh-session owns its own integrity guarantees (event validation, required
 * event-type refusal) for both `literature/attach` and `literature/detach`.
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
