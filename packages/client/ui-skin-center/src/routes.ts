/**
 * Skin-center HTTP routes: JSON state/apply plus the on-demand skin bundle
 * route used by live try-on. Same-origin fenced because /apply writes the
 * user's boot patch.
 */

import { readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join as joinPath } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { currentSkin, SKINS_ROOT, useSkin } from './skin-switch.ts'

export const SKIN_CENTER_API_PREFIX = '/api/skin-center'

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

function isSameOriginRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const host = req.headers.host
    if (typeof host !== 'string' || host === '') return false
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

function requireSameOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (isSameOriginRequest(req)) return true
  json(res, 403, { ok: false, error: 'cross-site-request-rejected' })
  return false
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req, res) => {
      if (!requireMethod(req, res, 'GET')) return
      if (!requireSameOrigin(req, res)) return
      run().then(value => json(res, 200, value), (error) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req, res): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      if (!requireSameOrigin(req, res)) return Promise.resolve()
      return readJsonBody(req).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          value => json(res, 200, value),
          error => json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }),
        )
      }, (error) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

function skinBundle(entryId: string): string | null {
  if (!/^[a-z0-9-]+$/.test(entryId)) return null
  const dir = joinPath(SKINS_ROOT, `ui-skin-${entryId}`)
  if (!statSync(joinPath(dir, 'skin.json'), { throwIfNoEntry: false })) return null
  const bundle = joinPath(dir, 'lib', 'client.js')
  return statSync(bundle, { throwIfNoEntry: false }) ? bundle : null
}

function bundleRoute(): WebRoute {
  const prefix = `${SKIN_CENTER_API_PREFIX}/bundle`
  return {
    kind: 'prefix',
    path: prefix,
    handler: (req, res) => {
      if (!requireMethod(req, res, 'GET')) return
      if (!requireSameOrigin(req, res)) return
      let id: string
      try {
        id = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.slice(prefix.length + 1))
      } catch {
        json(res, 400, { ok: false, error: 'invalid-skin-id' })
        return
      }
      const bundle = skinBundle(id)
      if (bundle === null) {
        json(res, 404, { ok: false, error: 'skin-not-found' })
        return
      }
      try {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
        res.end(readFileSync(bundle, 'utf8'))
      } catch (error) {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

/** Build the skin-center route family. */
export function makeSkinCenterRoutes(): WebRoute[] {
  return [
    getRoute(`${SKIN_CENTER_API_PREFIX}/state`, async () => ({
      ok: true,
      active: currentSkin(),
    })),
    bundleRoute(),
    postRoute(`${SKIN_CENTER_API_PREFIX}/apply`, async (body) => {
      const official = body.official === true
      const skin = body.skin
      if (official) {
        if (skin !== undefined) throw new Error('invalid-skin: skin and official are mutually exclusive')
      } else if (typeof skin !== 'string' || skin === '') {
        throw new Error('invalid-skin: pass a skin name or official: true')
      }
      const target = official ? 'official' : skin as string
      const message = useSkin(target)
      return { ok: true, active: currentSkin(), message }
    }),
  ]
}
