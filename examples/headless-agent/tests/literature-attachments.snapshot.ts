/**
 * Assembled-app regression for the literature-attachments context injection:
 * a session seeded with one `literature/attach` event resumes through the
 * real Loader composition, and the next turn's runtime-context snapshot
 * carries the attached paper's metadata and the deep-reading instruction.
 * @module literature-attachments-snapshot
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { normalizeSessionLog, scrubRequestHeaders, type NormalizeContext } from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, {
  SESSION_FORMAT_VERSION,
  SessionId,
  type SessionEvent,
  type SessionHeader,
} from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { describe, expect, it } from 'vitest'

const replayFixture = join(dirname(fileURLToPath(import.meta.url)), 'literature-attachments-snapshots/basic/replay.jsonl')
const configPath = fileURLToPath(new URL('../literature-attachments.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/headless-driver.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const sessionId = SessionId('literature-attachments')

const ATTACHED_PAPER = {
  id: '10.1000/attach.1',
  title: 'Example attached paper',
  authors: ['Alice', 'Bob'],
  year: 2024,
  venue: 'Journal of Attachments',
  abstract: 'The attached abstract.',
  url: 'https://example.org/attached',
  identifiers: { doi: '10.1000/attach.1', pmid: '987654', pmcid: 'PMC9876543' },
}

/** Seed one persisted session: a closed turn plus one attached paper. */
async function seedSession(root: string, cwd: string): Promise<string> {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    const meta: SessionHeader = {
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt: 1,
      cwd,
      delegationDepth: 0,
    }
    const events: SessionEvent[] = [
      { type: 'turn/start', seq: 0, time: 10, data: { turn: 1 } },
      {
        type: 'user/message',
        seq: 1,
        time: 11,
        data: createUserMessage({ content: [{ type: 'text', text: 'Collect papers about attachment examples.' }], source: { kind: 'user' } }),
        surfaceOp: 'append',
      },
      { type: 'literature/attach', seq: 2, time: 12, data: { paper: ATTACHED_PAPER } },
      { type: 'turn/end', seq: 3, time: 13, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    await ctx.sessionPersistence.create(meta)
    await ctx.sessionPersistence.append(sessionId, events)
    const location = ctx.sessionPersistence.locate(meta)
    if (location === undefined) throw new Error('JSONL backend did not locate the seeded session')
    return location.path
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('literature-attachments snapshot', () => {
  it('injects the attached paper into the resumed turn\'s runtime context', async () => {
    let cwd = ''
    let sessionPath = ''
    const result = await runLoaderSmoke({
      label: 'literature-attachments headless stream-json snapshot',
      tempDirPrefix: 'dsh-literature-attachments-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'Discuss the attached paper.'],
      tsconfigPath,
      env: {
        DSH_SNAPSHOT_FILE: replayFixture,
      },
      prepare: async (runCwd) => {
        cwd = runCwd
        sessionPath = await seedSession(join(runCwd, '.sessions'), runCwd)
      },
      inspect: async () => {
        const normalization: NormalizeContext = { sessionIds: [sessionId], cwd }
        const session = scrubRequestHeaders(normalizeSessionLog(await readFile(sessionPath, 'utf8'), normalization))
        const records = session.trimEnd().split('\n').map(line => JSON.parse(line) as {
          type?: string
          data?: {
            source?: { kind?: string; plugin?: string; form?: string; sections?: Array<{ name?: string; text?: string }> }
          }
        })

        // The attach event survives the resume verbatim.
        const attach = records.filter(record => record.type === 'literature/attach')
        expect(attach).toHaveLength(1)

        // The next turn's runtime-context snapshot names the attached paper.
        const snapshots = records.filter(record => record.type === 'user/message'
          && record.data?.source?.kind === 'plugin'
          && record.data.source.plugin === '@deepseek-ai/dsh-system-prompt'
          && record.data.source.form === 'snapshot')
        const section = snapshots.flatMap(record => record.data?.source?.sections ?? [])
          .find(entry => entry.name === 'literature:attached')
        expect(section?.text).toContain('## Attached papers')
        expect(section?.text).toContain('Example attached paper')
        expect(section?.text).toContain('id: 10.1000/attach.1')
        expect(section?.text).toContain('PMCID PMC9876543')
        expect(section?.text).toContain('mcp__literature__literature_get_fulltext')
        expect(section?.text).toContain('The attached abstract.')
      },
    })

    expect(result.stderr).toBe('')
    const records = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records.at(-1)).toMatchObject({
      type: 'result',
      sessionId,
    })
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
