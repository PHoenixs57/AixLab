// @vitest-environment jsdom
/**
 * PaperCard plus-button behavior: the add-to-conversation toggle renders
 * beside the star, shows the attached state, disables while a mutation is
 * in flight, and reports failures through the card error line.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaperCard } from '../src/client/components/PaperCard.tsx'
import type { PaperItem } from '../src/client/paper-model.ts'

afterEach(cleanup)

const PAPER: PaperItem = {
  rank: 1,
  title: 'Example paper',
  abstract: 'An abstract.',
  authors: ['Alice', 'Bob'],
  year: 2024,
  venue: 'Journal of Examples',
  url: 'https://example.org/paper',
  pdfUrl: null,
  openAccess: true,
  id: '10.1000/example.1',
  doi: '10.1000/example.1',
  pmid: '123456',
  pmcid: 'PMC1234567',
  arxiv: null,
  sourceCount: 2,
}

const t = (key: string): string => key

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('PaperCard attach toggle', () => {
  it('renders the add-to-conversation plus beside the star when not attached', () => {
    render(<PaperCard paper={PAPER} t={t} attached={false} onAttach={() => Promise.resolve()} onDetach={() => Promise.resolve()} />)
    const plus = screen.getByRole('button', { name: 'attachToConversation' })
    expect(plus).toBeDefined()
    expect(screen.getByRole('button', { name: 'addFavorite' })).toBeDefined()
  })

  it('calls onAttach when the plus is clicked', async () => {
    const onAttach = vi.fn(() => Promise.resolve())
    render(<PaperCard paper={PAPER} t={t} attached={false} onAttach={onAttach} onDetach={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('button', { name: 'attachToConversation' }))
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it('shows the attached state and calls onDetach', async () => {
    const onDetach = vi.fn(() => Promise.resolve())
    render(<PaperCard paper={PAPER} t={t} attached onAttach={() => Promise.resolve()} onDetach={onDetach} />)
    const plus = screen.getByRole('button', { name: 'detachFromConversation' })
    fireEvent.click(plus)
    expect(onDetach).toHaveBeenCalledTimes(1)
  })

  it('disables the plus while the mutation is in flight', async () => {
    const pending = deferred<undefined>()
    render(<PaperCard paper={PAPER} t={t} attached={false} onAttach={() => pending.promise} onDetach={() => Promise.resolve()} />)
    const plus = screen.getByRole('button', { name: 'attachToConversation' }) as HTMLButtonElement
    fireEvent.click(plus)
    expect(plus.disabled).toBe(true)
    await act(async () => { pending.resolve(undefined) })
    expect(plus.disabled).toBe(false)
  })

  it('surfaces an attach failure on the card error line', async () => {
    const pending = deferred<undefined>()
    render(<PaperCard paper={PAPER} t={t} attached={false} onAttach={() => pending.promise} onDetach={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('button', { name: 'attachToConversation' }))
    await act(async () => { pending.reject(new Error('boom')) })
    expect(screen.getByText('Error: boom')).toBeDefined()
  })
})
