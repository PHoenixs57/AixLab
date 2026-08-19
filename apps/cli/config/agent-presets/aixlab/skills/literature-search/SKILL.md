---
name: literature-search
description: Use when the user asks to find, collect, or review scholarly literature — building queries for the literature-search MCP tools (mcp__literature__literature_search / literature_sources / literature_get_fulltext), deduplicating and ranking results, or turning results into the structured paper-card list and managing favorites (literature_favorites_*).
---

# Literature search with the deepseek-aix multi-source MCP

The literature capability rides one MCP server (serverName `literature`) exposed as four tools:

- **`mcp__literature__literature_search`** — parallel search over PubMed, Europe PMC, bioRxiv/medRxiv, Crossref, OpenAlex, Semantic Scholar, and arXiv. Arguments: `query` (required), `limit` (default 10, max 50), `sources` (optional subset), `year_from` / `year_to`, `open_access` (true = keep only open-access evidence), `abstract_max_chars` (default 3000). Returns normalized, deduplicated, fused results as JSON: `results[]` with `title`, `abstract`, `authors[]`, `year`, `first_public_at`, `identifiers {doi, pmid, pmcid, arxiv, ...}`, `url`, `pdf_url`, `open_access`, plus `source_statuses` per source.
- **`mcp__literature__literature_sources`** — list the sources, their capabilities, and credential status. Call it when the user asks which databases are covered.
- **`mcp__literature__literature_get_fulltext`** — full text from the Europe PMC open-access subset by `pmcid`, `pmid`, or `doi`; returns sections + plain `full_text` (capped by `max_chars`), or a structured `not_found` when no OA full text exists.
- **`mcp__literature__literature_resolve_paper`** — resolve a paper's exact first-public date (ISO 8601, day-level precision) and full metadata by scraping original source pages. Input at least one of `doi`, `arxiv_id`, `pmid`, `pmcid`, or `biorxiv_doi`. Returns `status` ("resolved" | "not_found"), `first_public_at`, `latest_version_at`, `dates` (with `date_evidence[]` showing where each date came from), `authors`, `abstract`, `versions[]`, and `identifiers`. Use this when the user needs precise day-level dates (e.g. "papers from the last week") or when `literature_search` results only carry a `year` without a `first_public_at`.

The Web UI renders `literature_search` results as paper cards automatically — call the tool, and the cards appear in the conversation.

## 1. Query design

- Prefer explicit field terms for biomedicine: `"IL-6 signaling"[Title/Abstract] AND ("rheumatoid arthritis"[MeSH Terms] OR "RA")`.
- For ML/CS topics, arXiv-side phrasing helps: `"novel category discovery" AND (CLIP OR foundation model)`.
- Add `year_from` for recency ("latest"), or narrow `sources` when the user names a database.
- Start with `limit` 10–15; broaden only if results are sparse.

## 2. Date resolution (when the user needs precise dates)

When the user asks for papers from a specific date range (e.g. "last week", "2026-08-01 to 2026-08-19"):

1. **Search first** — use `literature_search` with the appropriate `year_from`/`year_to` to get a candidate pool.
2. **Resolve dates** — for candidates that lack a `first_public_at` field, call `literature_resolve_paper` with the paper's `arxiv` ID, `doi`, or `pmid`. This scrapes the original source (arXiv abstract page, bioRxiv, or DOI content negotiation) and returns the exact day-level date with `date_evidence` showing where it came from.
3. **Filter** — keep only papers whose `first_public_at` falls within the user's date range.
4. **Sort** — by `first_public_at` descending.

Never trust the `year` field alone for day-level recency questions. If `first_public_at` is missing from search results and `resolve_paper` cannot find it, report the date as `UNKNOWN` rather than guessing.

## 3. Deduplication and ranking

- The server already fuses duplicates across sources; rely on `source_evidence` to report multi-source agreement as a quality signal.
- Rank by: (a) direct relevance to the stated question, (b) `first_public_at` or `year` recency when the user asked for latest, (c) number of agreeing sources, (d) presence of an abstract.
- Drop results whose `title_missing` synthetic titles you cannot verify — do not report a paper you cannot identify.

## 4. Output contract for the chat reply

For each paper you surface in chat, give at least: title, first author + year, venue, and the primary identifier (DOI preferred, else PMID, else arXiv). When the user asked for a precise date, include `first_public_at`. Keep the abstract in the card; quote only the one sentence in chat that answers the user's question.

## 5. Favorites

- Bookmark: `literature_favorites_add` with `{ id, title, authors, year, venue, abstract, url }`; `id` MUST be the DOI / PMID / arXiv id (DOI preferred) — it is the deduplication key.
- Remove: `literature_favorites_remove` with `{ id }`. List: `literature_favorites_list`.
- When the user says "收藏刚才那几篇" (bookmark those), add every paper they mean, one call each, then confirm the count.

## 6. Failure handling

- A source `rate_limited` / `timeout` in `source_statuses` is not fatal: report it and offer to retry or drop the source.
- If `all_sources_failed` is true or the MCP call errors, tell the user the literature service is unavailable and suggest retrying; never fabricate results.
- If `literature_resolve_paper` returns `status: "not_found"`, that date is genuinely unavailable — report it as `UNKNOWN` rather than calling resolve again.
