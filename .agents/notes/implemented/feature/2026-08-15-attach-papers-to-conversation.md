# Agent Note: Attach papers to the conversation with deep reading

Status: implemented

English | [中文](2026-08-15-attach-papers-to-conversation.zh.md)

## Problem

The literature surfaces could collect and bookmark papers, but nothing carried a paper into the conversation itself: the agent knew only what a search call happened to return, and there was no product path from "this paper looks right" (on a conversation paper card or a favorites row) to "the agent reads this paper in detail". Deep reading existed as the `mcp__literature__literature_get_fulltext` MCP tool, but the agent had no durable signal of which papers the user selected.

## Decision

A plus icon on conversation paper cards (`PaperCard`) and favorites rows (`FavoriteRow`) toggles attachment for the next message, and turns into a minus while pending. The new host package `@deepseek-ai/dsh-literature-attachments` owns the state: `literature/attach` / `literature/detach` session events (log-only, non-surface, required on read) are the only store, appended by a Typert Remote service (`literatureAttachments.attach/detach/list/byTurn`) behind per-session serialization. The service registers the `literature:attached` prompt context (order 130) that folds the log per request and renders a bounded block — metadata, identifiers, and an instruction to call `literature_get_fulltext` with pmcid (preferred) / pmid / doi when the user asks to 精读 — under `maxPapers` (24) and `maxBytes` (16 KiB, complete-result bound with `…`-truncated abstracts and an omission note). Attachments are per-message: at `agent/turn-stopping` the service appends one `literature/detach` per attached paper, so papers are injected into exactly one turn and the next message starts empty (the plus resets to plus); `byTurn` reports which papers each user message carried. The client mirrors committed replies in a module-level store keyed by session id (the declared-store pattern cannot mount one handle across the `session` and `root` slot scopes, so this follows the package's existing favorites-store style); the favorites panel reads the current session through `useSessions`. `FavoritePaper` gains an optional additive `identifiers` field (schema version stays 0, the `folderId` precedent) so favorites rows attach with the identifiers deep reading needs; `PaperItem` gains `pmcid`. Committed attachments show as compact, horizontally-wrapping tiles with a `已加入对话 · 已注入上下文 · N 篇` head — title plus author-year meta each: the pending papers fill the existing `conversation.input.dock` composer dock (order 30) until a message is sent, and the papers each message carried render below that message through the new `conversation.chat.user-tail` slot (declared by ui-conversation's `user` chat renderer, filled by ui-literature). Both persona copies (`apps/cli/config/agent-presets/aixlab` and `presets/aixlab`) teach the agent about `Attached papers` in the runtime context.

## Testing

Host: `literature-attachments.spec.ts` drives the real service over `SystemPrompt` and `Session.create` with fake agents — attach/list/detach round-trips, idempotent duplicates, zod input rejection, per-session serialization, turn-stopping consumption, `byTurn` per-message records, assembled-context injection and its removal on dispose, plus pure fold/render tests covering the pinned header, absent-field omission, `maxPapers` omission note, exact byte bounds, and header-only budgets. Client: `attached-store.client.spec.ts` (load-once, per-turn map, committed-reply application, serialization, resync), `paper-card.client.spec.tsx` and `favorites-panel.client.spec.tsx` (jsdom) for the plus/minus toggle, attached state, disabled-without-session, and in-flight states; `attached-context-bar.client.spec.tsx` (jsdom) for the pending composer-dock tiles and the per-message tail tiles; `paper-model.client.spec.ts` covers pmcid extraction and the payload builders. Favorites: identifiers round-trip, omitted-when-absent, and pre-identifiers row migration. A keyless headless snapshot scenario (replayed fixture log carrying `literature/attach`) pins the injected context in the assembled transcript.

## Alternatives considered

**Surface (chat-visible) attach events.** Rejected: the panels already render the state; log-only events keep the chat clean and the details column authoritative.

**Durable sidecar like favorites.** Rejected: attachments are per-session and must be reconstructable from the log (model-visible ⟺ logged); a sidecar would duplicate the session log and break replay.

**A dedicated 精读 tool wrapping the MCP.** Rejected: `literature_get_fulltext` already exists and works; the injected block instructs the agent, adding no second tool surface.

**Host command `/attach`.** Rejected: commands appear as chat lines and would need JSON-in-args; the Remote keeps the gesture invisible and typed.

## Consequences

Papers now enter the model's runtime context for exactly the one turn they were attached before, then the service detaches them at turn close; replay, restart, and multi-tab state all re-derive from the session log. Logs written by this build contain required `literature/attach` events, so older builds refuse them (pre-release stance; the persistence catalog regenerates). Favorites rows bookmarked before the `identifiers` field attach with only the composite id, weakening the fastest fulltext lookup for those rows only. The feature is per-message: durable cross-session collection stays with literature-favorites.
