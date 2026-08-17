// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DragFileInlay, type DragFileInlayProps } from '../src/client/drag/DragFileInlay.tsx'

/** Minimal dock props: the component only reads input.fileRefs and its two injected verbs. */
function props(removeFile = vi.fn()): DragFileInlayProps {
  return {
    input: {
      draft: '', fileRefs: [
        { path: 'README.md', name: 'README.md' },
        { path: 'docs/a-very-long-filename-that-must-remain-readable.md', name: 'a-very-long-filename-that-must-remain-readable.md' },
      ], imageIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [],
    },
    insertFile: () => true,
    removeFile,
  } as unknown as DragFileInlayProps
}

describe('DragFileInlay', () => {
  it('renders full variable-length filenames and removes the addressed attachment', () => {
    const removeFile = vi.fn()
    render(<DragFileInlay {...props(removeFile)} />)
    expect(screen.getByText('README.md')).toBeTruthy()
    const longName = 'a-very-long-filename-that-must-remain-readable.md'
    expect(screen.getByText(longName)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `移除 ${longName}` }))
    expect(removeFile).toHaveBeenCalledWith('docs/a-very-long-filename-that-must-remain-readable.md')
  })
})
