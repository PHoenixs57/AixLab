// @vitest-environment jsdom
/**
 * FavoritesPanel add-to-conversation behavior: each saved-paper row carries
 * a plus that attaches the paper to the CURRENT session (from useSessions),
 * disables without one, toggles to the detach label once attached, and
 * writes through the attached-papers Remote.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { FavoritePaper } from '@deepseek-ai/dsh-literature-favorites/types'
import type { AttachedPaper, AttachedPaperInput } from '@deepseek-ai/dsh-literature-attachments/types'
import { attachedPapersStore } from '../src/client/attached/store.ts'
import { FavoritesPanel } from '../src/client/favorites/FavoritesPanel.tsx'
import type { FavoritesPanelProps } from '../src/client/favorites/FavoritesPanel.tsx'
import { favoritesStore } from '../src/client/favorites/store.ts'

afterEach(cleanup)

const FAVORITE: FavoritePaper = {
  id: '10.1000/f',
  title: 'Saved paper',
  authors: ['Alice'],
  year: 2024,
  venue: 'Journal of Examples',
  abstract: 'abs',
  url: 'https://example.org/paper',
  identifiers: { doi: '10.1000/f' },
  folderId: null,
  addedAt: 1,
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function favoritesRemote(papers: FavoritePaper[]) {
  return {
    list: vi.fn(() => Promise.resolve(ok(ok({ folders: [], papers })))),
    add: vi.fn(() => Promise.resolve(ok(ok(FAVORITE)))),
    delete: vi.fn(() => Promise.resolve(ok(ok({ removed: FAVORITE.id })))),
    folderCreate: vi.fn(() => Promise.resolve(ok(ok({ id: 'f', name: 'n', createdAt: 1 })))),
    folderRename: vi.fn(() => Promise.resolve(ok(ok({ id: 'f', name: 'n', createdAt: 1 })))),
    folderDelete: vi.fn(() => Promise.resolve(ok(ok({ removed: 'f' })))),
    move: vi.fn(() => Promise.resolve(ok(ok({ moved: FAVORITE.id, folderId: null })))),
  }
}

function attachedRemote(papers: AttachedPaper[]) {
  return {
    list: vi.fn(() => Promise.resolve(ok(papers))),
    attach: vi.fn(
      (_sessionId: SessionId, paper: AttachedPaperInput) =>
        Promise.resolve(ok({ paper: paper as AttachedPaper, alreadyAttached: false })),
    ),
    detach: vi.fn((_sessionId: SessionId, id: string) => Promise.resolve(ok({ id, found: true }))),
    byTurn: vi.fn(() => Promise.resolve(ok([]))),
  }
}

beforeEach(() => {
  favoritesStore.attach(favoritesRemote([FAVORITE]) as never)
  favoritesStore.resync()
  attachedPapersStore.attach(attachedRemote([]) as never)
  attachedPapersStore.resync()
})

function renderPanel(current: SessionId | undefined, attached: AttachedPaper[] = []) {
  attachedPapersStore.attach(attachedRemote(attached) as never)
  attachedPapersStore.resync()
  const useSessions = bindSnapshotSelector(createSnapshotStore({ current }) as never)
  const props = {
    wide: true,
    expandSidebar: vi.fn(),
    useSessions,
    useWorkspaces: bindSnapshotSelector(createSnapshotStore({}) as never),
    t: (key: string) => key,
  } as unknown as FavoritesPanelProps
  const view = render(<FavoritesPanel {...props} />)
  return view
}

async function openPanel(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'favoritesTitle' }))
  await waitFor(() => { expect(screen.getByText('Saved paper')).toBeDefined() })
}

describe('FavoritesPanel attach toggle', () => {
  it('renders an attach plus per saved-paper row', async () => {
    renderPanel(SessionId('s1'))
    await openPanel()
    expect(screen.getByRole('button', { name: 'attachToConversation' })).toBeDefined()
  })

  it('attaches the paper to the current session through the Remote', async () => {
    renderPanel(SessionId('s1'))
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'attachToConversation' }))
    await waitFor(() => {
      expect(attachedPapersStore.stateOf(SessionId('s1'))?.papers.map(paper => paper.id)).toEqual(['10.1000/f'])
    })
  })

  it('shows the detach label for papers already attached to the current session', async () => {
    const paper: AttachedPaper = {
      id: '10.1000/f', title: 'Saved paper', authors: ['Alice'], year: 2024, venue: 'Journal of Examples',
      abstract: 'abs', url: 'https://example.org/paper', identifiers: { doi: '10.1000/f' },
    }
    renderPanel(SessionId('s1'), [paper])
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'detachFromConversation' }))
    await waitFor(() => {
      expect(attachedPapersStore.stateOf(SessionId('s1'))?.papers).toEqual([])
    })
  })

  it('disables the plus when no conversation is open', async () => {
    renderPanel(undefined)
    await openPanel()
    const plus = screen.getByRole('button', { name: 'attachToConversation' }) as HTMLButtonElement
    expect(plus.disabled).toBe(true)
    expect(plus.title).toBe('attachDisabled')
  })
})
