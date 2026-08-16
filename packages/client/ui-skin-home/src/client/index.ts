/**
 * AixLab Home skin — the assets/home.png hero art as the main-interface
 * backdrop, with a lavender glass palette. apply() owns the whole ambient
 * surface and retracts it on dispose: the `data-dsh-home` body attribute,
 * the home-art backdrop (readability scrim chosen by the active theme and
 * swapped live on `data-ds-dark-theme` changes), and the translucent token
 * remap in home.module.css.
 */
import type { Context } from '@deepseek-ai/cordis'
import './home.module.css'

/** Light scrim: the art is already a pale morning-sky illustration; keep the
 *  veil very thin and let the frosted panels carry readability. */
const SCRIM_LIGHT = [
  'linear-gradient(rgba(249, 250, 254, 0.10) 0%, rgba(244, 245, 252, 0.16) 55%, rgba(238, 240, 250, 0.24) 100%)',
].join(', ')

/** Dark scrim: a deep slate-violet night veil that keeps the art visible. */
const SCRIM_DARK = [
  'linear-gradient(rgba(16, 17, 32, 0.42) 0%, rgba(20, 21, 40, 0.50) 60%, rgba(24, 26, 48, 0.56) 100%)',
].join(', ')

const BACKDROP_PROPERTIES = [
  'background-image',
  'background-position',
  'background-size',
  'background-attachment',
  'background-repeat',
] as const

/** Apply the home skin and return a disposer through the cordis effect. */
export function apply(ctx: Context): void {
  const body = document.body
  const previous = new Map<string, string>()
  for (const prop of BACKDROP_PROPERTIES) {
    previous.set(prop, body.style.getPropertyValue(prop))
  }
  body.dataset.dshHome = ''

  const setBackdrop = (): void => {
    const dark = body.dataset.dsDarkTheme !== undefined
    const backdrop = `linear-gradient(rgba(18, 20, 38, var(--dsw-skin-scrim, 0)) 0%, rgba(18, 20, 38, var(--dsw-skin-scrim, 0)) 100%), ${dark ? SCRIM_DARK : SCRIM_LIGHT}, url('/home.png')`
    body.style.setProperty('background-image', backdrop)
    body.style.setProperty('background-position', 'center')
    body.style.setProperty('background-size', 'cover')
    body.style.setProperty('background-attachment', 'fixed')
    body.style.setProperty('background-repeat', 'no-repeat')
  }
  setBackdrop()

  const observer = new MutationObserver(setBackdrop)
  observer.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

  ctx.effect(() => () => {
    delete body.dataset.dshHome
    observer.disconnect()
    for (const [prop, value] of previous) {
      body.style.setProperty(prop, value)
    }
  }, 'ui-skin-home: home backdrop')
}
