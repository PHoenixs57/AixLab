/**
 * AixLab GUI smoke: drive the product surface at 3090 like a user —
 * ack the welcome notice, start a new session on the aixlab preset,
 * ask for literature, verify the paper-card toolview and the favorites
 * round-trip, and save screenshots for inspection.
 *
 * Run from apps/web so `playwright` resolves: node ../../scripts/e2e-smoke.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync, existsSync } from 'node:fs'

// Anchor resolution at apps/web so the `playwright` devDependency resolves.
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')

const BASE = 'http://127.0.0.1:3090'
const SHOTS = new URL('../e2e-shots/', import.meta.url).pathname
const WORKSPACE = new URL('../e2e-workspace/', import.meta.url).pathname

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  if (!existsSync(WORKSPACE)) mkdirSync(WORKSPACE, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'zh-CN' })
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300))
  })

  console.log('1. open', BASE)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/01-boot.png` })

  // Welcome notice (AixLab copy) — ack it.
  const continueButton = page.getByRole('button', { name: '继续' })
  if (await continueButton.count() > 0) {
    console.log('2. ack welcome notice')
    await continueButton.first().click()
    await page.waitForTimeout(1000)
  } else {
    console.log('2. no welcome notice (already acked)')
  }

  // New session from the sidebar brand button.
  console.log('3. new session')
  const newSession = page.getByRole('button', { name: '新建会话' })
  await newSession.first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/02-new-session.png` })

  // The deployment default is the aixlab preset; stage only when the chip
  // shows something else.
  console.log('4. ensure aixlab preset')
  const chipLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /助手|模式/.test(b.textContent || ''))
    return btn ? btn.textContent.slice(0, 40) : '(no chip)'
  })
  console.log('   chip label:', chipLabel)
  if (!/AixLab/.test(chipLabel)) {
    const chip = page.getByRole('button', { name: /标准模式|科研模式/ }).first()
    await chip.click()
    await page.waitForTimeout(800)
    const item = page.getByRole('menuitem', { name: /AixLab 文献助手/ }).first()
    if (await item.count() > 0) { await item.click(); console.log('   staged AixLab 文献助手') }
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/03-preset.png` })

  // Connect the workspace and a blank session through the host RPCs the
  // hero itself uses (workspace.create + session.create), avoiding the
  // first-run directory dialog.
  console.log('5. connect workspace via RPC')
  const rpc = (method, payload) => page.evaluate(async ({ method, payload }) => {
    const res = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'smoke', method, payload }),
    })
    return await res.json()
  }, { method, payload })
  const ws = await rpc('workspace.create', { path: WORKSPACE })
  const workspaceId = ws?.result?.value?.workspace?.workspaceId
  console.log('   workspace:', workspaceId ?? JSON.stringify(ws).slice(0, 120))
  if (workspaceId) {
    const session = await rpc('session.create', { workspaceId, agentPreset: 'aixlab' })
    console.log('   session created:', JSON.stringify(session).slice(0, 120))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
  }

  // Compose the literature request. The composer unlocks once a blank
  // session is current; click the hero workspace row first when needed.
  console.log('6. send literature request')
  const composer = page.locator('textarea').first()
  const editable = async () => page.waitForFunction(() => {
    const t = document.querySelector('textarea')
    return t !== null && !t.disabled && !t.readOnly
  }, undefined, { timeout: 20_000 }).then(() => true).catch(() => false)
  if (!(await editable())) {
    const wsRow = page.locator('[class*="heroWorkspaceRow"]').first()
    if (await wsRow.count() > 0) { await wsRow.click(); await page.waitForTimeout(1500) }
  }
  await page.waitForFunction(() => {
    const t = document.querySelector('textarea')
    return t !== null && !t.disabled && !t.readOnly
  }, undefined, { timeout: 30_000 })
  await composer.click()
  await composer.fill('帮我搜集 IL-6 信号通路在类风湿关节炎中的最新文献，3 篇即可。')
  await page.getByRole('button', { name: '发送消息' }).first().click()

  // Wait for the chat to settle: the right details column auto-opens with the
  // literature window once the turn ends and papers are collected.
  console.log('7. wait for right-side literature panel')
  try {
    await page.getByText('本次对话文献', { exact: false }).first().waitFor({ timeout: 180_000 })
    console.log('   panel header appeared')
  } catch {
    console.log('   ! panel header did not appear; taking shot')
    await page.screenshot({ path: `${SHOTS}/04-no-panel.png` })
  }

  // The cards render inside the right panel; wait for a star to exist.
  const star = page.getByRole('button', { name: '收藏' }).first()
  try {
    await star.waitFor({ timeout: 30_000 })
    console.log('   panel cards rendered, stars:', await page.getByRole('button', { name: '收藏' }).count())
  } catch {
    console.log('   ! no star buttons in panel')
  }
  await page.screenshot({ path: `${SHOTS}/04-panel.png` })

  // Favorite the first paper in the panel.
  console.log('8. favorite first paper in the right panel')
  if (await star.count() > 0) {
    await star.click({ force: true })
    await page.waitForTimeout(2000)
    console.log('   starred')
  }

  // Verify the sidebar favorites section reflects the bookmark.
  const panelText = await page.evaluate(() => {
    const match = document.body.innerText.match(/文献收藏[\s\S]{0,140}/)
    return match ? match[0].replace(/\n/g, ' | ').slice(0, 140) : '(not found)'
  })
  console.log('9. sidebar favorites:', panelText)
  await page.screenshot({ path: `${SHOTS}/06-final.png` })

  await browser.close()
  console.log('done; screenshots in e2e-shots/')
}

main().catch(error => {
  console.error('SMOKE FAILED:', error)
  process.exit(1)
})
