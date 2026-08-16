/**
 * Boot-manifest readiness checks for the one-click apply flow.
 *
 * The host half writes the profile skin patch synchronously, but the web
 * app's boot graph (the `window.__DSH_BOOT__` JSON inside the served HTML)
 * is regenerated asynchronously by the config watcher. Poll until the
 * manifest actually reflects the target before reloading.
 */

/** Bundle URL pattern of any skin entry in the boot manifest. */
const SKIN_BUNDLE_URL = /\/plugins\/@deepseek-ai\/dsh-client-ui-skin-(?!center)[a-z0-9-]+\/client\.js/

/**
 * Whether a served GUI document's boot manifest enables the given skin.
 * A `null` target means the stock look: no skin bundle URL may be present.
 */
export function manifestHasSkin(documentHtml: string, target: string | null): boolean {
  if (target === null) return !SKIN_BUNDLE_URL.test(documentHtml)
  return documentHtml.includes(`/plugins/@deepseek-ai/dsh-client-ui-skin-${target}/client.js`)
}
