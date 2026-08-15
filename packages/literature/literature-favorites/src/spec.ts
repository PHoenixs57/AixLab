/**
 * Durable storage-domain declaration for the literature favorites sidecar:
 * ONE global row (a per-user collection, not per-session) under the key
 * `global`, so bookmarks survive every session and workspace.
 * @module @deepseek-ai/dsh-literature-favorites/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { FavoriteFolder, FavoritePaper, FavoritePaperIdentifiers } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for one category folder entry. */
export const favoriteFolderSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1),
  createdAt: nonNegativeSafeInteger,
}) as unknown as z.ZodType<FavoriteFolder>

/** Runtime schema for the optional stable identifiers of one bookmark entry. */
export const favoritePaperIdentifiersSchema = z.object({
  doi: z.string().min(1).max(128).optional(),
  pmid: z.string().min(1).max(128).optional(),
  pmcid: z.string().min(1).max(128).optional(),
  arxiv: z.string().min(1).max(128).optional(),
}) as unknown as z.ZodType<FavoritePaperIdentifiers>

/** Runtime schema for one bookmark entry. */
export const favoritePaperSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1),
  authors: z.array(z.string().max(256)),
  year: nonNegativeSafeInteger.nullable(),
  venue: z.string().max(512).nullable(),
  abstract: z.string().nullable(),
  url: z.string().max(2048).nullable(),
  // Optional: rows persisted before the identifiers field lack this key; the
  // service passes it through verbatim (undefined = no identifiers recorded).
  identifiers: favoritePaperIdentifiersSchema.optional(),
  // Optional: rows persisted before the folder format lack this key; the
  // service normalizes `folderId ?? null` on read and writes the full shape.
  folderId: z.string().max(128).nullable().optional(),
  addedAt: nonNegativeSafeInteger,
}) as unknown as z.ZodType<FavoritePaper>

/**
 * The whole collection. Duplicate ids would make unbookmark ambiguous, so
 * the persisted shape rejects them outright.
 */
export const favoritesRowSchema = z.object({
  // Optional for the same migration reason as `folderId`: pre-folder rows
  // carry only `papers`.
  folders: z.array(favoriteFolderSchema).optional(),
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
