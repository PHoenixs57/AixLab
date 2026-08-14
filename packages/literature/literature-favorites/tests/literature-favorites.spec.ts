/**
 * Service-level tests for the durable favorites sidecar: add/list/remove
 * round-trips, duplicate and not-found business failures, newest-first
 * ordering, folder create/rename/delete/move semantics, migration of the
 * pre-folder persisted format, and durability across a service restart over
 * the same JSON root.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LiteratureFavoritesService from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Compose the service over the real storage hub/domain/JSON backend + tools. */
async function setupHarness(): Promise<{ ctx: Context; root: string; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-literature-favorites-test-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LiteratureFavoritesService)
  return {
    ctx,
    root,
    async dispose() {
      await ctx.fiber.dispose()
    },
  }
}

const PAPER = {
  id: '10.1000/example.1',
  title: 'Example paper one',
  authors: ['Alice', 'Bob'],
  year: 2024,
  venue: 'Journal of Examples',
  abstract: 'An abstract.',
  url: 'https://example.org/paper',
  folderId: null,
}

describe('literature-favorites service', () => {
  it('lists an empty collection before any bookmark', async () => {
    const harness = await setupHarness()
    const result = await harness.ctx.literatureFavorites.list()
    expect(result).toEqual({ ok: true, value: { folders: [], papers: [] } })
  })

  it('adds, lists newest-first, removes, and rejects unknown ids', async () => {
    const harness = await setupHarness()
    const first = await harness.ctx.literatureFavorites.add(PAPER)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('add failed')
    expect(first.value.addedAt).toBeGreaterThan(0)

    const second = await harness.ctx.literatureFavorites.add({
      ...PAPER,
      id: '10.1000/example.2',
      title: 'Example paper two',
    })
    expect(second.ok).toBe(true)

    const listed = await harness.ctx.literatureFavorites.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    // Newest first.
    expect(listed.value.papers.map(paper => paper.id)).toEqual(['10.1000/example.2', '10.1000/example.1'])
    // Frozen snapshots.
    expect(Object.isFrozen(listed.value.papers)).toBe(true)
    expect(Object.isFrozen(listed.value.papers[0]!.authors)).toBe(true)

    const duplicate = await harness.ctx.literatureFavorites.add(PAPER)
    expect(duplicate).toEqual({ ok: false, error: { code: 'duplicate', id: PAPER.id } })

    const missing = await harness.ctx.literatureFavorites.delete({ id: '10.1000/absent' })
    expect(missing).toEqual({ ok: false, error: { code: 'not-found', id: '10.1000/absent' } })

    const removed = await harness.ctx.literatureFavorites.delete({ id: PAPER.id })
    expect(removed).toEqual({ ok: true, value: { removed: PAPER.id } })

    const after = await harness.ctx.literatureFavorites.list()
    expect(after.ok).toBe(true)
    if (!after.ok) throw new Error('list failed')
    expect(after.value.papers.map(paper => paper.id)).toEqual(['10.1000/example.2'])
    expect(after.value.papers[0]!.title).toBe('Example paper two')
  })

  it('normalizes empty strings to null and trims fields', async () => {
    const harness = await setupHarness()
    const result = await harness.ctx.literatureFavorites.add({
      id: '  arXiv:2509.22542 ',
      title: ' Category Discovery ',
      authors: [' A ', '', 'B'],
      year: null,
      venue: ' ',
      abstract: ' x ',
      url: '',
      folderId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('add failed')
    expect(result.value.id).toBe('arXiv:2509.22542')
    expect(result.value.title).toBe('Category Discovery')
    expect(result.value.authors).toEqual(['A', 'B'])
    expect(result.value.year).toBeNull()
    expect(result.value.venue).toBeNull()
    expect(result.value.abstract).toBe('x')
    expect(result.value.url).toBeNull()
  })

  it('rejects invalid add requests before storage', async () => {
    const harness = await setupHarness()
    await expect(harness.ctx.literatureFavorites.add({ ...PAPER, id: '  ', title: 't' }))
      .rejects.toThrow(/id/)
    await expect(harness.ctx.literatureFavorites.add({ ...PAPER, id: 'x', title: ' ' }))
      .rejects.toThrow(/title/)
  })

  it('is durable across contexts sharing one JSON root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-literature-favorites-durable-'))
    roots.push(root)

    const first = new Context()
    contexts.push(first)
    await first.plugin(Storage)
    await first.plugin(StorageJson, { root })
    await first.plugin(StorageDomain, { backend: 'json' })
    await first.plugin(SystemPrompt)
    await first.plugin(ToolRuntime)
    await first.plugin(LiteratureFavoritesService)
    const added = await first.literatureFavorites.add(PAPER)
    expect(added.ok).toBe(true)
    await first.fiber.dispose()

    // A fresh process-like composition over the same root reopens the domain.
    const second = new Context()
    contexts.push(second)
    await second.plugin(Storage)
    await second.plugin(StorageJson, { root })
    await second.plugin(StorageDomain, { backend: 'json' })
    await second.plugin(SystemPrompt)
    await second.plugin(ToolRuntime)
    await second.plugin(LiteratureFavoritesService)
    const listed = await second.literatureFavorites.list()
    expect(listed).toEqual({
      ok: true,
      value: { folders: [], papers: [expect.objectContaining({ id: PAPER.id })] },
    })
  })

  it('registers the agent tools', async () => {
    const harness = await setupHarness()
    expect(harness.ctx.tools.get('literature_favorites_add')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_remove')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_list')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_folder_create')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_folder_rename')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_folder_delete')).toBeDefined()
    expect(harness.ctx.tools.get('literature_favorites_move')).toBeDefined()
  })

  it('creates folders, rejects duplicate and invalid names', async () => {
    const harness = await setupHarness()
    const created = await harness.ctx.literatureFavorites.folderCreate({ name: ' 综述 ' })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('create failed')
    expect(created.value.name).toBe('综述')
    expect(created.value.id).toBe('folder') // non-Latin name falls back to the base id
    expect(Object.isFrozen(created.value)).toBe(true)

    const duplicate = await harness.ctx.literatureFavorites.folderCreate({ name: '综述' })
    expect(duplicate).toEqual({ ok: false, error: { code: 'duplicate-folder', name: '综述' } })

    const invalid = await harness.ctx.literatureFavorites.folderCreate({ name: '   ' })
    expect(invalid).toEqual({ ok: false, error: { code: 'invalid-name' } })

    const listed = await harness.ctx.literatureFavorites.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    expect(listed.value.folders.map(folder => folder.name)).toEqual(['综述'])
  })

  it('renames folders and rejects clashing names', async () => {
    const harness = await setupHarness()
    const first = await harness.ctx.literatureFavorites.folderCreate({ name: 'Reviews' })
    const second = await harness.ctx.literatureFavorites.folderCreate({ name: 'Methods' })
    if (!first.ok || !second.ok) throw new Error('create failed')

    // Case-insensitive clash: 'reviews' collides with 'Reviews'.
    const clash = await harness.ctx.literatureFavorites.folderRename({ id: second.value.id, name: 'REVIEWS' })
    expect(clash).toEqual({ ok: false, error: { code: 'duplicate-folder', name: 'REVIEWS' } })

    const renamed = await harness.ctx.literatureFavorites.folderRename({ id: second.value.id, name: ' Method ' })
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) throw new Error('rename failed')
    expect(renamed.value.name).toBe('Method')
    expect(renamed.value.id).toBe(second.value.id)

    const missing = await harness.ctx.literatureFavorites.folderRename({ id: 'absent', name: 'X' })
    expect(missing).toEqual({ ok: false, error: { code: 'folder-not-found', id: 'absent' } })
  })

  it('files papers under folders and moves them between folders', async () => {
    const harness = await setupHarness()
    const folder = await harness.ctx.literatureFavorites.folderCreate({ name: '综述' })
    if (!folder.ok) throw new Error('create failed')

    const added = await harness.ctx.literatureFavorites.add({ ...PAPER, folderId: folder.value.id })
    expect(added.ok).toBe(true)
    if (!added.ok) throw new Error('add failed')
    expect(added.value.folderId).toBe(folder.value.id)

    // Unknown folder on add is a business failure.
    const badFolder = await harness.ctx.literatureFavorites.add({ ...PAPER, id: '10.1000/example.2', title: 'T', folderId: 'absent' })
    expect(badFolder).toEqual({ ok: false, error: { code: 'folder-not-found', id: 'absent' } })

    // Move to uncategorized, then to another folder.
    const moved = await harness.ctx.literatureFavorites.move({ id: PAPER.id, folderId: null })
    expect(moved).toEqual({ ok: true, value: { moved: PAPER.id, folderId: null } })
    const other = await harness.ctx.literatureFavorites.folderCreate({ name: 'Methods' })
    if (!other.ok) throw new Error('create failed')
    const refiled = await harness.ctx.literatureFavorites.move({ id: PAPER.id, folderId: other.value.id })
    expect(refiled.ok).toBe(true)
    if (!refiled.ok) throw new Error('move failed')
    expect(refiled.value.folderId).toBe(other.value.id)

    const missingPaper = await harness.ctx.literatureFavorites.move({ id: 'absent', folderId: null })
    expect(missingPaper).toEqual({ ok: false, error: { code: 'not-found', id: 'absent' } })
    const missingFolder = await harness.ctx.literatureFavorites.move({ id: PAPER.id, folderId: 'absent' })
    expect(missingFolder).toEqual({ ok: false, error: { code: 'folder-not-found', id: 'absent' } })

    const listed = await harness.ctx.literatureFavorites.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    expect(listed.value.papers[0]!.folderId).toBe(other.value.id)
  })

  it('deleting a folder moves its papers back to uncategorized', async () => {
    const harness = await setupHarness()
    const folder = await harness.ctx.literatureFavorites.folderCreate({ name: '综述' })
    if (!folder.ok) throw new Error('create failed')
    await harness.ctx.literatureFavorites.add({ ...PAPER, folderId: folder.value.id })

    const removed = await harness.ctx.literatureFavorites.folderDelete({ id: folder.value.id })
    expect(removed).toEqual({ ok: true, value: { removed: folder.value.id } })

    const missing = await harness.ctx.literatureFavorites.folderDelete({ id: folder.value.id })
    expect(missing).toEqual({ ok: false, error: { code: 'folder-not-found', id: folder.value.id } })

    const listed = await harness.ctx.literatureFavorites.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    expect(listed.value.folders).toEqual([])
    expect(listed.value.papers).toHaveLength(1)
    expect(listed.value.papers[0]!.folderId).toBeNull()
  })

  it('normalizes a pre-folder persisted row on read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-literature-favorites-migrate-'))
    roots.push(root)
    // Seed the on-disk medium in the old format: no `folders` key, no
    // per-paper `folderId`.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'literature_favorites.json'), JSON.stringify({
      unit: { name: 'literature_favorites', version: 0 },
      global: null,
      tables: {
        papers: {
          global: {
            papers: [{
              id: PAPER.id,
              title: PAPER.title,
              authors: PAPER.authors,
              year: PAPER.year,
              venue: PAPER.venue,
              abstract: PAPER.abstract,
              url: PAPER.url,
              addedAt: 123,
            }],
          },
        },
      },
    }, null, 2) + '\n')

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LiteratureFavoritesService)

    const listed = await ctx.literatureFavorites.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error('list failed')
    expect(listed.value.folders).toEqual([])
    expect(listed.value.papers).toHaveLength(1)
    expect(listed.value.papers[0]!.folderId).toBeNull()
    expect(listed.value.papers[0]!.title).toBe(PAPER.title)
  })
})
