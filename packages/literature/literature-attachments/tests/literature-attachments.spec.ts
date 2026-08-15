import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PAPERS,
  LiteratureAttachmentsService,
  MAX_PAPERS,
  MIN_MAX_BYTES,
  resolveConfig,
} from '../src/index.ts'
import type { AttachedPaperInput, LiteratureAttachmentsConfig } from '../src/index.ts'
import { foldAttachedByTurn, foldAttachedPapers, renderAttachedContext } from '../src/context.ts'
import type { AttachedPaper } from '../src/types.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function setup(config: LiteratureAttachmentsConfig = {}): Promise<{ ctx: Context; service: { dispose(): Promise<void> } }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  const service = await ctx.plugin(LiteratureAttachmentsService, config)
  return { ctx, service }
}

function agentWithSession(id = 'agent-1'): { agent: Agent; session: Session } {
  const session = Session.create(SessionId(id))
  const agent = { id: SessionId(id), session, options: {} } as unknown as Agent
  return { agent, session }
}

async function contextText(ctx: Context, agent: Agent): Promise<string> {
  const assembly = await ctx.systemPrompt.assemble({ agent })
  return assembly.contexts.find(entry => entry.name === 'literature:attached')?.text ?? ''
}

function eventOf(session: Session): SessionEvent[] {
  return [...session.events]
}

const PAPER: AttachedPaperInput = {
  id: '10.1000/example.1',
  title: 'Example paper one',
  authors: ['Alice', 'Bob'],
  year: 2024,
  venue: 'Journal of Examples',
  abstract: 'An abstract about examples.',
  url: 'https://example.org/paper',
  identifiers: { doi: '10.1000/example.1', pmid: '123456', pmcid: 'PMC1234567', arxiv: '2001.01234' },
}

const PAPER_TWO: AttachedPaperInput = {
  id: '10.1000/example.2',
  title: 'Example paper two',
  authors: [],
  year: null,
  venue: null,
  abstract: null,
  url: null,
}

describe('foldAttachedPapers', () => {
  it('reduces attach and detach events in order', () => {
    const paper = { id: 'a', title: 'A', authors: [], year: null, venue: null, abstract: null, url: null, identifiers: {} }
    const paperB = { ...paper, id: 'b', title: 'B' }
    const events = [
      { type: 'literature/attach', seq: 0, time: 0, data: { paper } },
      { type: 'literature/attach', seq: 1, time: 0, data: { paper: paperB } },
      { type: 'literature/detach', seq: 2, time: 0, data: { id: 'a' } },
      { type: 'literature/detach', seq: 3, time: 0, data: { id: 'missing' } },
    ] as unknown as SessionEvent[]
    expect(foldAttachedPapers(events).map(entry => entry.id)).toEqual(['b'])
  })

  it('keeps attach order', () => {
    const paper = { id: 'a', title: 'A', authors: [], year: null, venue: null, abstract: null, url: null, identifiers: {} }
    const paperB = { ...paper, id: 'b', title: 'B' }
    const events = [
      { type: 'literature/attach', seq: 0, time: 0, data: { paper: paperB } },
      { type: 'literature/attach', seq: 1, time: 0, data: { paper } },
    ] as unknown as SessionEvent[]
    expect(foldAttachedPapers(events).map(entry => entry.id)).toEqual(['b', 'a'])
  })

  it('returns an empty list for unrelated logs', () => {
    expect(foldAttachedPapers([])).toEqual([])
    expect(foldAttachedPapers([{ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } } as unknown as SessionEvent])).toEqual([])
  })
})

describe('foldAttachedByTurn', () => {
  const paper = { id: 'a', title: 'A', authors: [], year: null, venue: null, abstract: null, url: null, identifiers: {} }
  const paperB = { ...paper, id: 'b', title: 'B' }

  it('snapshots the attached set at each user message that carried papers', () => {
    const events = [
      { type: 'literature/attach', seq: 0, time: 0, data: { paper } },
      { type: 'user/message', seq: 1, time: 0, data: {} },
      { type: 'literature/attach', seq: 2, time: 0, data: { paper: paperB } },
      { type: 'user/message', seq: 3, time: 0, data: {} },
      { type: 'literature/detach', seq: 4, time: 0, data: { id: 'a' } },
      { type: 'user/message', seq: 5, time: 0, data: {} },
    ] as unknown as SessionEvent[]
    const turns = foldAttachedByTurn(events)
    expect(turns.map(turn => [turn.seq, turn.papers.map(p => p.id)])).toEqual([
      [1, ['a']],
      [3, ['a', 'b']],
      [5, ['b']],
    ])
  })

  it('records nothing for user messages sent while no paper is attached', () => {
    const events = [
      { type: 'user/message', seq: 1, time: 0, data: {} },
      { type: 'literature/attach', seq: 2, time: 0, data: { paper } },
    ] as unknown as SessionEvent[]
    expect(foldAttachedByTurn(events).map(turn => turn.seq)).toEqual([])
  })
})

describe('renderAttachedContext', () => {
  const paper: AttachedPaper = {
    id: '10.1000/example.1',
    title: 'Example paper one',
    authors: ['Alice', 'Bob'],
    year: 2024,
    venue: 'Journal of Examples',
    abstract: 'An abstract about examples.',
    url: 'https://example.org/paper',
    identifiers: { doi: '10.1000/example.1', pmid: '123456', pmcid: 'PMC1234567' },
  }
  const budget = { maxPapers: DEFAULT_MAX_PAPERS, maxBytes: DEFAULT_MAX_BYTES }

  it('renders nothing without papers', () => {
    expect(renderAttachedContext([], budget)).toBe('')
  })

  it('renders the pinned header, the deep-reading instruction, and all present fields', () => {
    const text = renderAttachedContext([paper], budget)
    expect(text).toContain('## Attached papers')
    expect(text).toContain('mcp__literature__literature_get_fulltext')
    expect(text).toContain('1. Example paper one — Alice, Bob · 2024 · Journal of Examples')
    expect(text).toContain('id: 10.1000/example.1')
    expect(text).toContain('identifiers: DOI 10.1000/example.1, PMID 123456, PMCID PMC1234567')
    expect(text).toContain('url: https://example.org/paper')
    expect(text).toContain('Abstract: An abstract about examples.')
  })

  it('omits absent identifier, url, and abstract lines', () => {
    const bare: AttachedPaper = { ...paper, identifiers: {}, url: null, abstract: null, venue: null, year: null, authors: [] }
    const text = renderAttachedContext([bare], budget)
    expect(text).toContain('1. Example paper one')
    expect(text).not.toContain('identifiers:')
    expect(text).not.toContain('url:')
    expect(text).not.toContain('Abstract:')
  })

  it('folds papers past maxPapers into the omission note', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ ...paper, id: `id-${index}`, title: `Paper ${index}` }))
    const text = renderAttachedContext(many, { ...budget, maxPapers: 3 })
    expect(text).toContain('1. Paper 0')
    expect(text).toContain('3. Paper 2')
    expect(text).not.toContain('4. Paper 3')
    expect(text).toContain('[+2 more attached papers omitted]')
  })

  it('keeps the complete result under maxBytes, truncating the abstract', () => {
    const long: AttachedPaper = { ...paper, abstract: 'x'.repeat(20000) }
    const text = renderAttachedContext([long], { ...budget, maxBytes: 4096 })
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(4096)
    expect(text).toContain('Abstract: ')
    expect(text).toContain('…')
  })

  it('stops listing once one entry must truncate and notes the remaining papers', () => {
    const long: AttachedPaper = { ...paper, id: 'long', abstract: 'x'.repeat(20000) }
    const second: AttachedPaper = { ...paper, id: 'second', title: 'Second paper' }
    const text = renderAttachedContext([long, second], { ...budget, maxBytes: 2048 })
    expect(text).toContain('1. Example paper one')
    expect(text).not.toContain('Second paper')
    expect(text).toContain('[+1 more attached papers omitted]')
  })

  it('renders nothing when the header alone exceeds the budget', () => {
    expect(renderAttachedContext([paper], { ...budget, maxBytes: 64 })).toBe('')
  })

  it('truncates a title that cannot fit whole', () => {
    const huge: AttachedPaper = { ...paper, id: 'huge', title: 'T'.repeat(1024), authors: [], venue: null, year: null, abstract: null, url: null, identifiers: {} }
    const text = renderAttachedContext([huge], { ...budget, maxBytes: 1024 })
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(1024)
    expect(text).toContain('…')
  })
})

describe('literature-attachments service', () => {
  it('attaches, lists, and detaches papers through session events', async () => {
    const { ctx } = await setup()
    const { agent, session } = agentWithSession()

    const first = await ctx.literatureAttachments.attach(agent, PAPER)
    expect(first).toEqual({ paper: expect.objectContaining({ id: '10.1000/example.1' }), alreadyAttached: false })
    expect(eventOf(session).filter(event => event.type === 'literature/attach')).toHaveLength(1)

    const duplicate = await ctx.literatureAttachments.attach(agent, PAPER)
    expect(duplicate.alreadyAttached).toBe(true)
    expect(eventOf(session).filter(event => event.type === 'literature/attach')).toHaveLength(1)

    await ctx.literatureAttachments.attach(agent, PAPER_TWO)
    const listed = await ctx.literatureAttachments.list(agent)
    expect(listed.map(paper => paper.id)).toEqual(['10.1000/example.1', '10.1000/example.2'])

    const removed = await ctx.literatureAttachments.detach(agent, '10.1000/example.1')
    expect(removed).toEqual({ id: '10.1000/example.1', found: true })
    const after = await ctx.literatureAttachments.list(agent)
    expect(after.map(paper => paper.id)).toEqual(['10.1000/example.2'])

    const missing = await ctx.literatureAttachments.detach(agent, 'missing-id')
    expect(missing).toEqual({ id: 'missing-id', found: false })
    expect(eventOf(session).filter(event => event.type === 'literature/detach')).toHaveLength(1)
  })

  it('normalizes optional fields to null and trims identifiers', async () => {
    const { ctx } = await setup()
    const { agent } = agentWithSession()
    const { paper } = await ctx.literatureAttachments.attach(agent, {
      id: PAPER.id,
      title: '  Padded title  ',
      authors: PAPER.authors,
      venue: '   ',
      abstract: '  ',
      url: '  ',
      identifiers: { doi: ' 10.1000/example.1 ' },
    })
    expect(paper.title).toBe('Padded title')
    expect(paper.year).toBeNull()
    expect(paper.venue).toBeNull()
    expect(paper.abstract).toBeNull()
    expect(paper.url).toBeNull()
    expect(paper.identifiers).toEqual({ doi: '10.1000/example.1' })
  })

  it.each([
    { input: { ...PAPER, id: '   ' }, pattern: /id/ },
    { input: { ...PAPER, title: '' }, pattern: /title/ },
    { input: { ...PAPER, authors: ['ok', 'a'.repeat(300)] }, pattern: /authors/ },
    { input: { ...PAPER, year: -1 }, pattern: /year/ },
  ])('rejects invalid attach input %#', async ({ input, pattern }) => {
    const { ctx } = await setup()
    const { agent, session } = agentWithSession()
    await expect(ctx.literatureAttachments.attach(agent, input)).rejects.toThrow(pattern)
    expect(eventOf(session).filter(event => event.type === 'literature/attach')).toHaveLength(0)
  })

  it('rejects an empty detach id', async () => {
    const { ctx } = await setup()
    const { agent } = agentWithSession()
    await expect(ctx.literatureAttachments.detach(agent, '   ')).rejects.toThrow(/non-empty/)
  })

  it('injects the attached papers into the assembled context', async () => {
    const { ctx } = await setup()
    const { agent } = agentWithSession()
    expect(await contextText(ctx, agent)).toBe('')

    await ctx.literatureAttachments.attach(agent, PAPER)
    const text = await contextText(ctx, agent)
    expect(text).toContain('## Attached papers')
    expect(text).toContain('Example paper one')
    expect(text).toContain('mcp__literature__literature_get_fulltext')

    await ctx.literatureAttachments.detach(agent, '10.1000/example.1')
    expect(await contextText(ctx, agent)).toBe('')
  })

  it('renders no context without an agent (diagnostics assembly)', async () => {
    const { ctx } = await setup()
    const assembly = await ctx.systemPrompt.assemble({})
    expect(assembly.contexts.find(entry => entry.name === 'literature:attached')?.text).toBe('')
  })

  it('removes the context contribution when the plugin fiber is disposed', async () => {
    const { ctx, service } = await setup()
    const { agent } = agentWithSession()
    await ctx.literatureAttachments.attach(agent, PAPER)
    await service.dispose()
    expect(await contextText(ctx, agent)).toBe('')
  })

  it('serializes concurrent mutations for the same session', async () => {
    const { ctx } = await setup()
    const { agent, session } = agentWithSession()
    await Promise.all([
      ctx.literatureAttachments.attach(agent, PAPER),
      ctx.literatureAttachments.attach(agent, PAPER),
      ctx.literatureAttachments.attach(agent, PAPER_TWO),
    ])
    const attached = eventOf(session).filter(event => event.type === 'literature/attach')
    expect(attached).toHaveLength(2)
    const listed = await ctx.literatureAttachments.list(agent)
    expect(listed.map(paper => paper.id)).toEqual(['10.1000/example.1', '10.1000/example.2'])
  })

  it('lists the papers each user message carried through byTurn', async () => {
    const { ctx } = await setup()
    const { agent, session } = agentWithSession()
    await ctx.literatureAttachments.attach(agent, PAPER)
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'one' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await ctx.literatureAttachments.attach(agent, PAPER_TWO)
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'two' }], source: { kind: 'user' } }), { surfaceOp: 'append' })

    const turns = await ctx.literatureAttachments.byTurn(agent)
    expect(turns.map(turn => turn.papers.map(paper => paper.id))).toEqual([
      ['10.1000/example.1'],
      ['10.1000/example.1', '10.1000/example.2'],
    ])
  })

  it('consumes the attached papers when the turn closes', async () => {
    const { ctx } = await setup()
    const { agent, session } = agentWithSession()
    await ctx.literatureAttachments.attach(agent, PAPER)
    await ctx.literatureAttachments.attach(agent, PAPER_TWO)
    expect((await ctx.literatureAttachments.list(agent)).map(paper => paper.id)).toEqual([
      '10.1000/example.1', '10.1000/example.2',
    ])

    await agentEvents(ctx, agent).serial('agent/turn-stopping', {
      turn: 1,
      signal: new AbortController().signal,
    })

    expect(await ctx.literatureAttachments.list(agent)).toEqual([])
    expect(eventOf(session).filter(event => event.type === 'literature/detach')).toHaveLength(2)
  })
})

describe('resolveConfig', () => {
  it('applies defaults', () => {
    expect(resolveConfig({})).toEqual({ maxPapers: DEFAULT_MAX_PAPERS, maxBytes: DEFAULT_MAX_BYTES })
  })

  it.each([
    [{ maxPapers: 0 }, /maxPapers/],
    [{ maxPapers: -1 }, /maxPapers/],
    [{ maxPapers: MAX_PAPERS + 1 }, /maxPapers/],
    [{ maxPapers: 1.5 }, /maxPapers/],
    [{ maxBytes: MIN_MAX_BYTES - 1 }, /maxBytes/],
  ])('rejects invalid bounds %#', (config, pattern) => {
    expect(() => resolveConfig(config)).toThrow(pattern)
  })

  it('rejects invalid bounds at plugin load', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await expect(ctx.plugin(LiteratureAttachmentsService, { maxPapers: 0 })).rejects.toThrow(/maxPapers/)
  })
})
