/**
 * Store tests for the per-session attached-papers cache: one store instance
 * per test with a fake Remote, so the module-level singleton is never
 * touched. Load-once sharing, committed-reply application, serialization,
 * and failure states.
 */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { AttachedPapersStore } from '../src/client/attached/store.ts'
import type { AttachedPaper, AttachedPaperInput, AttachedTurn, AttachResult, DetachResult } from '@deepseek-ai/dsh-literature-attachments/types'

const SESSION = SessionId('session-1')
const SESSION_B = SessionId('session-2')

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

const PAPER: AttachedPaper = {
  id: '10.1000/a',
  title: 'Paper A',
  authors: ['Alice'],
  year: 2024,
  venue: 'J',
  abstract: 'abs',
  url: null,
  identifiers: { doi: '10.1000/a' },
}

const PAPER_B: AttachedPaper = {
  id: '10.1000/b',
  title: 'Paper B',
  authors: [],
  year: null,
  venue: null,
  abstract: null,
  url: null,
  identifiers: {},
}

/** A fake Remote whose responses are per-call overrides. */
function fakeRemote(overrides: {
  list?: (sessionId: SessionId) => Promise<RemoteResult<readonly AttachedPaper[]>>
  attach?: (sessionId: SessionId, paper: AttachedPaperInput) => Promise<RemoteResult<AttachResult>>
  detach?: (sessionId: SessionId, id: string) => Promise<RemoteResult<DetachResult>>
  byTurn?: (sessionId: SessionId) => Promise<RemoteResult<readonly AttachedTurn[]>>
} = {}) {
  const list = vi.fn(overrides.list ?? (() => Promise.resolve(ok([]))))
  const attach = vi.fn(
    overrides.attach ??
      ((_sessionId: SessionId, paper: AttachedPaperInput) =>
        Promise.resolve(ok({ paper: paper as AttachedPaper, alreadyAttached: false }))),
  )
  const detach = vi.fn(overrides.detach ?? ((_sessionId: SessionId, id: string) => Promise.resolve(ok({ id, found: true }))))
  const byTurn = vi.fn(overrides.byTurn ?? (() => Promise.resolve(ok([]))))
  const remote = { list, attach, detach, byTurn }
  return { remote, list, attach, detach, byTurn }
}

function storeWith(overrides?: Parameters<typeof fakeRemote>[0]) {
  const faked = fakeRemote(overrides)
  const store = new AttachedPapersStore()
  store.attach(faked.remote)
  return { store, ...faked }
}

describe('AttachedPapersStore', () => {
  it('loads one session once and shares the in-flight read', async () => {
    const { store, list } = storeWith({ list: () => Promise.resolve(ok([PAPER])) })
    await Promise.all([store.ensure(SESSION), store.ensure(SESSION)])
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.stateOf(SESSION)).toEqual({ status: 'ready', papers: [PAPER], byTurn: new Map() })
    expect(store.isAttached(SESSION, '10.1000/a')).toBe(true)
    expect(store.isAttached(SESSION, '10.1000/b')).toBe(false)
    expect(store.isAttached(SESSION, null)).toBe(false)
  })

  it('loads the per-turn papers keyed by user-message seq', async () => {
    const { store } = storeWith({ byTurn: () => Promise.resolve(ok([{ seq: 5, papers: [PAPER] }])) })
    await store.ensure(SESSION)
    expect(store.stateOf(SESSION)?.byTurn.get(5)).toEqual([PAPER])
    expect(store.stateOf(SESSION)?.byTurn.get(6)).toBeUndefined()
  })

  it('marks a failed load as error and never caches it', async () => {
    const { store } = storeWith({ list: () => Promise.reject(new Error('down')) })
    await store.ensure(SESSION)
    expect(store.stateOf(SESSION)?.status).toBe('error')
  })

  it('attaches a paper and applies the committed reply', async () => {
    const { store, attach } = storeWith()
    await store.attachPaper(SESSION, PAPER)
    expect(attach).toHaveBeenCalledWith(SESSION, PAPER)
    expect(store.stateOf(SESSION)?.papers).toEqual([PAPER])
  })

  it('keeps the list unchanged when the host reports alreadyAttached', async () => {
    const { store } = storeWith({ attach: () => Promise.resolve(ok({ paper: PAPER, alreadyAttached: true })) })
    await store.attachPaper(SESSION, PAPER)
    expect(store.stateOf(SESSION)?.papers).toEqual([])
  })

  it('detaches a paper and applies the committed reply', async () => {
    const { store } = storeWith({ list: () => Promise.resolve(ok([PAPER, PAPER_B])) })
    await store.ensure(SESSION)
    await store.detachPaper(SESSION, PAPER.id)
    expect(store.stateOf(SESSION)?.papers).toEqual([PAPER_B])
  })

  it('serializes mutations for the same session', async () => {
    const { store, attach } = storeWith()
    const orders: string[] = []
    attach.mockImplementation(async (_sessionId: SessionId, paper: AttachedPaperInput) => {
      orders.push(`start-${paper.id}`)
      await Promise.resolve()
      orders.push(`end-${paper.id}`)
      return ok({ paper: paper as AttachedPaper, alreadyAttached: false })
    })
    await Promise.all([store.attachPaper(SESSION, PAPER), store.attachPaper(SESSION, PAPER_B)])
    expect(orders).toEqual(['start-10.1000/a', 'end-10.1000/a', 'start-10.1000/b', 'end-10.1000/b'])
  })

  it('resyncs to a cold view and reloads on demand', async () => {
    const { store, list } = storeWith({ list: () => Promise.resolve(ok([PAPER])) })
    await store.ensure(SESSION)
    expect(store.stateOf(SESSION)?.status).toBe('ready')
    store.resync()
    expect(store.stateOf(SESSION)).toBeUndefined()
    await store.ensure(SESSION)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps sessions independent', async () => {
    const { store } = storeWith({ list: () => Promise.resolve(ok([PAPER])) })
    await store.ensure(SESSION)
    await store.ensure(SESSION_B)
    expect(store.stateOf(SESSION_B)?.papers).toEqual([PAPER])
    await store.detachPaper(SESSION, PAPER.id)
    expect(store.stateOf(SESSION)?.papers).toEqual([])
    expect(store.stateOf(SESSION_B)?.papers).toEqual([PAPER])
  })
})
