# @deepseek-ai/dsh-literature-attachments

English | [中文](README.zh.md)

Per-session literature attachments for deepseek-aix: papers the user adds to a conversation from the literature UI (the plus on paper cards and favorites rows). Each attach/detach is a durable session event, and every model request folds the events into a bounded runtime-context block the agent uses for detailed reading (精读) through the bundled literature-search MCP.

## Config

```yaml
- id: literature-attachments
  name: '@deepseek-ai/dsh-literature-attachments'
  config:
    maxPapers: 24    # optional; longest number of papers listed in the injected context
    maxBytes: 16384  # optional; complete byte bound of the injected context (header included)
```

`maxPapers` must be an integer in `1..1000`; `maxBytes` must be an integer `>= 1024`. Invalid values fail at plugin load.

## Event store

The session log is the only store. `literature/attach` carries one frozen `AttachedPaper` (`id`, `title`, `authors`, `year`, `venue`, `abstract`, `url`, `identifiers` with any subset of `doi` / `pmid` / `pmcid` / `arxiv`); `literature/detach` carries the stable id. Both are log-only, non-surface events (required on read — a build that does not know the types refuses the log). Attaching an already-attached id and detaching an unattached id are idempotent no-ops.

The Typert Remote namespace `literatureAttachments` exposes `attach(sessionId, paper)`, `detach(sessionId, id)`, `list(sessionId)`, and `byTurn(sessionId)`; the web client mirrors the committed replies through a browser cache keyed by session id. Attachments are per-message: papers are injected into the next request and consumed (detached) when that turn closes, so each message starts with an empty attached set; `byTurn` still reports which papers each message carried.

## Injected context

The service registers the `literature:attached` prompt context (order 130). For each assembly with an agent, it folds the session log and renders a pinned header naming the currently-attached papers and instructing the agent to call `mcp__literature__literature_get_fulltext` with pmcid (preferred), pmid, or doi when the user asks for detailed reading. Papers are listed newest-first with identifiers and abstracts; `maxPapers` folds later papers into an omission note, and `maxBytes` bounds the complete rendered block (an overflowing abstract is truncated with `…`). No attached papers render nothing. At `agent/turn-stopping` the service appends one `literature/detach` per attached paper, so the context is present for exactly one turn (per-message) and disappears from the next request.

## Model Experience

### Attached-papers runtime context

#### What the model sees

A `## Attached papers` block inside the current runtime-context snapshot, only while at least one paper is attached:

##### Attached-papers block

```markdown
## Attached papers

The user attached these papers to this conversation from the literature UI.
Treat them as reading material for this conversation. When the user asks for
detailed reading (精读) or more information about one of them, call
`mcp__literature__literature_get_fulltext` with its pmcid (preferred), pmid,
or doi; papers without open-access full text return a structured status of
"not_found" — report that honestly instead of inventing content.

1. Example paper one (2024) — Alice, Bob · Journal of Examples
   id: 10.1000/example.1
   identifiers: DOI 10.1000/example.1, PMID 123456, PMCID PMC1234567
   url: https://example.org/paper
   Abstract: An abstract about examples.
```

#### Token effect

The block is rendered per request from the session log (no history accumulation): its size is bounded by `maxBytes`, and detaching the last paper removes it from the next request entirely.

#### KV Cache effect

The runtime-context snapshot is driver-appended after the claimed batch; attaching or detaching papers changes only the trailing context, leaving the reusable request prefix intact.

## Known Limitations and Deferred Work

- **Open-access subset only** — detailed reading reaches whatever `literature_get_fulltext` can fetch (Europe PMC open-access); papers without open-access full text return `not_found` and the instruction tells the agent to report it honestly.
- **Current session only** — the UI attaches to the conversation that is open; the service itself accepts any resolved session id.
- **Per-session scope** — attached papers do not follow the user across conversations; durable cross-session collection is the literature-favorites sidecar.
- **Favorites rows without identifiers** — papers bookmarked before the favorites `identifiers` field existed attach with only their composite id, so deep reading may lack the pmcid needed for the fastest lookup.
