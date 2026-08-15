// @vitest-environment jsdom
/**
 * Attached-papers tiles: before any user message the pending papers render in
 * the composer dock; each user message renders the papers it carried below
 * itself. Both entries load/refresh the session's attached set on mount.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode, ChatNodeStore, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { AttachedPaper } from '@deepseek-ai/dsh-literature-attachments/types'
import {
  ComposerAttachedDock, UserAttachedTail,
} from '../src/client/context/AttachedContextBar.tsx'
import type {
  ComposerAttachedDockProps, UserAttachedTailProps,
} from '../src/client/context/AttachedContextBar.tsx'
import type { AttachedSessionState } from '../src/client/attached/store.ts'

afterEach(cleanup)

const PAPER: AttachedPaper = {
  id: '10.1000/example.1',
  title: 'Example paper',
  authors: ['Alice', 'Bob'],
  year: 2024,
  venue: 'Journal of Examples',
  abstract: 'An abstract.',
  url: 'https://example.org/paper',
  identifiers: { doi: '10.1000/example.1' },
}

function userNodes(seqs: readonly number[]): ChatNodeStore {
  const values = seqs.map(seq => ({
    kind: 'user',
    data: { seq },
  }) as unknown as ChatConversationViewNode)
  return { get: () => undefined, values: () => values }
}

function snapshot(seqs: readonly number[], running = false): ConversationSnapshot {
  return { chat: { nodes: userNodes(seqs) }, running } as unknown as ConversationSnapshot
}

function state(papers: readonly AttachedPaper[], byTurn: ReadonlyMap<number, readonly AttachedPaper[]> = new Map()): AttachedSessionState {
  return { status: 'ready', papers, byTurn }
}

function useAttachedOf(value: AttachedSessionState) {
  return (selector: (snapshot: AttachedSessionState) => unknown) => selector(value)
}

function useSessionOf(value: ConversationSnapshot) {
  return (selector: (snapshot: ConversationSnapshot) => unknown) => selector(value)
}

describe('ComposerAttachedDock', () => {
  it('renders the pending tiles while the turn is idle', () => {
    const load = vi.fn(() => Promise.resolve())
    const props = {
      useAttached: useAttachedOf(state([PAPER])),
      load,
      useSession: useSessionOf(snapshot([])),
      t: (key: string) => key,
    } as unknown as ComposerAttachedDockProps
    const view = render(<ComposerAttachedDock {...props} />)
    expect(view.container.querySelector('[data-attached-context]')).not.toBeNull()
    expect(view.getByText('Example paper')).toBeDefined()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('renders the pending tiles even when prior messages exist', () => {
    const props = {
      useAttached: useAttachedOf(state([PAPER])),
      load: vi.fn(() => Promise.resolve()),
      useSession: useSessionOf(snapshot([7])),
      t: (key: string) => key,
    } as unknown as ComposerAttachedDockProps
    const view = render(<ComposerAttachedDock {...props} />)
    expect(view.container.querySelector('[data-attached-context]')).not.toBeNull()
    expect(view.getByText('Example paper')).toBeDefined()
  })

  it('hides while a turn is running (papers in flight)', () => {
    const props = {
      useAttached: useAttachedOf(state([PAPER])),
      load: vi.fn(() => Promise.resolve()),
      useSession: useSessionOf(snapshot([7], true)),
      t: (key: string) => key,
    } as unknown as ComposerAttachedDockProps
    const view = render(<ComposerAttachedDock {...props} />)
    expect(view.container.querySelector('[data-attached-context]')).toBeNull()
  })

  it('hides while no paper is pending', () => {
    const props = {
      useAttached: useAttachedOf(state([])),
      load: vi.fn(() => Promise.resolve()),
      useSession: useSessionOf(snapshot([])),
      t: (key: string) => key,
    } as unknown as ComposerAttachedDockProps
    const view = render(<ComposerAttachedDock {...props} />)
    expect(view.container.querySelector('[data-attached-context]')).toBeNull()
  })
})

describe('UserAttachedTail', () => {
  function mountTail(seq: number, value: AttachedSessionState, running = false) {
    const refresh = vi.fn(() => Promise.resolve())
    const props = {
      useAttached: useAttachedOf(value),
      refresh,
      useSession: useSessionOf(snapshot([seq], running)),
      seq,
      t: (key: string) => key,
    } as unknown as UserAttachedTailProps
    return { view: render(<UserAttachedTail {...props} />), refresh }
  }

  it('renders the papers this message carried', () => {
    const { view, refresh } = mountTail(9, state([], new Map([[9, [PAPER]]])))
    expect(view.container.querySelector('[data-attached-context]')).not.toBeNull()
    expect(view.getByText('Example paper')).toBeDefined()
    expect(refresh).toHaveBeenCalled()
  })

  it('hides when this message carried no papers', () => {
    const { view } = mountTail(9, state([]))
    expect(view.container.querySelector('[data-attached-context]')).toBeNull()
  })

  it('refreshes when the running state changes (turn settles)', () => {
    const { view, refresh } = mountTail(9, state([], new Map([[9, [PAPER]]])), true)
    expect(view.container.querySelector('[data-attached-context]')).not.toBeNull()
    view.rerender(
      <UserAttachedTail
        {...{
          useAttached: useAttachedOf(state([], new Map([[9, [PAPER]]]))),
          refresh,
          useSession: useSessionOf(snapshot([9], false)),
          seq: 9,
          t: (key: string) => key,
        } as unknown as UserAttachedTailProps}
      />,
    )
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
