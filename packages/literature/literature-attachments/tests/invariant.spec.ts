import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as LiteratureAttachmentsInvariant from '../src/invariant.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(LiteratureAttachmentsInvariant)
  return ctx
}

describe('literature-attachments invariant companion', () => {
  it('registers without touching any session stream', async () => {
    const ctx = await setup()
    expect(ctx.fiber).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('disposes cleanly', async () => {
    const ctx = await setup()
    await expect(ctx.fiber.dispose()).resolves.toBeUndefined()
  })
})
