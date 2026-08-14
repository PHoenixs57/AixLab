/**
 * Durable storage-domain declaration for the literature favorites sidecar:
 * ONE global row (a per-user collection, not per-session) under the key
 * `global`, so bookmarks survive every session and workspace.
 * @module @deepseek-ai/dsh-literature-favorites/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { FavoritePaper } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for one bookmark entry. */
export const favoritePaperSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1),
  authors: z.array(z.string().max(256)),
  year: nonNegativeSafeInteger.nullable(),
  venue: z.string().max(512).nullable(),
  abstract: z.string().nullable(),
  url: z.string().max(2048).nullable(),
  addedAt: nonNegativeSafeInteger,
}) as unknown as z.ZodType<FavoritePaper>

/**
 * The whole collection. Duplicate ids would make unbookmark ambiguous, so
 * the persisted shape rejects them outright.
 */
export const favoritesRowSchema = z.object({
  papers: z.array(favoritePaperSchema),
}).superRefine((row, ctx) => {
  const ids = new Set<string>()
  row.papers.forEach((paper, index) => {
    if (ids.has(paper.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['papers', index, 'id'],
        message: `duplicate favorite id '${paper.id}'`,
      })
    }
    ids.add(paper.id)
  })
})

/** Durable row inferred from {@link favoritesRowSchema}. */
export type FavoritesRow = z.infer<typeof favoritesRowSchema>

/** Global per-user domain: one table, one row under the `global` key. */
export const literatureFavoritesDomainSpec = defineDomain({
  name: 'literature_favorites',
  version: 0,
  tables: {
    papers: domainTable<string, FavoritesRow>(favoritesRowSchema),
  },
})

/** The single key every collection operation reads and writes. */
export const GLOBAL_ROW_KEY = 'global'
