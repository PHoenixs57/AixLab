---
name: literature-search
description: Use when the user asks to find, collect, or review scholarly literature — building queries for the literature-search MCP tools (mcp__literature__literature_search / literature_sources / literature_get_fulltext), deduplicating and ranking results, or turning results into the structured paper-card list and managing favorites (literature_favorites_*).
---

# Literature search with the deepseek-aix multi-source MCP

The literature capability rides one MCP server (serverName `literature`) exposed as three tools:

- **`mcp__literature__literature_search`** — parallel search over PubMed, Europe PMC, bioRxiv/medRxiv, Crossref, OpenAlex, Semantic Scholar, and arXiv. Arguments: `query` (required), `limit` (default 10, max 50), `sources` (optional subset), `year_from` / `year_to`, `open_access` (true = keep only open-access evidence), `abstract_max_chars` (default 3000). Returns normalized, deduplicated, fused results as JSON: `results[]` with `title`, `abstract`, `authors[]`, `year`, `venue`, `identifiers {doi, pmid, pmcid, arxiv, ...}`, `url`, `pdf_url`, `open_access`, plus `source_statuses` per source.
- **`mcp__literature__literature_sources`** — list the sources, their capabilities, and credential status. Call it when the user asks which databases are covered.
- **`mcp__literature__literature_get_fulltext`** — full text from the Europe PMC open-access subset by `pmcid`, `pmid`, or `doi`; returns sections + plain `full_text` (capped by `max_chars`), or a structured `not_found` when no OA full text exists.

The Web UI renders `literature_search` results as paper cards automatically — call the tool, and the cards appear in the conversation.

## 1. Query design

- Prefer explicit field terms for biomedicine: `"IL-6 signaling"[Title/Abstract] AND ("rheumatoid arthritis"[MeSH Terms] OR "RA")`.
- For ML/CS topics, arXiv-side phrasing helps: `"novel category discovery" AND (CLIP OR foundation model)`.
- Add `year_from` for recency ("latest"), or narrow `sources` when the user names a database.
- Start with `limit` 10–15; broaden only if results are sparse.

## 2. Deduplication and ranking

- The server already fuses duplicates across sources; rely on `source_evidence` to report multi-source agreement as a quality signal.
- Rank by: (a) direct relevance to the stated question, (b) `year` recency when the user asked for latest, (c) number of agreeing sources, (d) presence of an abstract.
- Drop results whose `title_missing` synthetic titles you cannot verify — do not report a paper you cannot identify.

## 3. Output contract for the chat reply

For each paper you surface in chat, give at least: title, first author + year, venue, and the primary identifier (DOI preferred, else PMID, else arXiv). Keep the abstract in the card; quote only the one sentence in chat that answers the user's question.

## 4. Favorites

- Bookmark: `literature_favorites_add` with `{ id, title, authors, year, venue, abstract, url }`; `id` MUST be the DOI / PMID / arXiv id (DOI preferred) — it is the deduplication key.
- Remove: `literature_favorites_remove` with `{ id }`. List: `literature_favorites_list`.
- When the user says "收藏刚才那几篇" (bookmark those), add every paper they mean, one call each, then confirm the count.

## 5. Failure handling

- A source `rate_limited` / `timeout` in `source_statuses` is not fatal: report it and offer to retry or drop the source.
- If `all_sources_failed` is true or the MCP call errors, tell the user the literature service is unavailable and suggest retrying; never fabricate results.
