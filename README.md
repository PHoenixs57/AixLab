# deepseek-aix

English | [中文](README.zh.md)

<img src="assets/deepseek-aix.png" width="220" alt="deepseek-aix" />

**deepseek-aix** is an AI research assistant for scholarly literature: describe a research topic in conversation, and the agent collects relevant papers through built-in multi-source search (PubMed, arXiv, Semantic Scholar, Crossref, and more), presenting the results as collapsible, bookmarkable paper cards.

Built as a fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), deepseek-aix keeps the full agent infrastructure — sessions, tools, subagents, workflows, sandboxed code execution, and the Web GUI — and adds a literature capability on top: a multi-source literature-search service, a durable favorites collection with category folders, and a Web UI that renders search results and bookmarks as first-class cards.

## Features

### Literature Search

- **Conversational research-topic description**: new sessions start in the deepseek-aix research-assistant mode; describe a topic in natural language (Chinese or English) and the agent searches, deduplicates, and ranks papers.
- **Multi-source search**: simultaneously searches PubMed, Europe PMC, bioRxiv/medRxiv, Crossref, OpenAlex, Semantic Scholar, and arXiv via a built-in MCP service.
- **Automatic deduplication**: cross-round merging of results.
- **Paper cards in chat**: every search result renders as a card with authors, year, venue, abstract, and DOI/PMID/arXiv identifiers.
- **Full-text retrieval**: open-access subset available for detailed reading.
- **Right-side literature panel**: auto-expands after each conversation round to show all collected papers from the current session.

### Literature Favorites

- **Bookmark with folders**: star papers to save them in a durable, per-user collection organized into category folders.
- **Cross-session persistence**: favorites are stored server-side (`$DSH_HOME/storages/literature_favorites.json`) and survive across sessions and browsers.
- **Folder management**: create, rename, delete folders; move papers between folders.
- **Agent tools**: agent can also read/write favorites via `literature_favorites_add/remove/list/folder_create/folder_rename/folder_delete/move` tools.

### Skin Center

- **Multiple themes**: choose from a variety of UI skins including blue-fantasy, dragon-heir, harbor, miku, minecraft, qq98, ths, trading, whale-song, xp, and the classic home skin.
- **Live preview**: try on skins before applying; instant theme switching.
- **Skin management**: new skins can be installed as plugins.

### Aionui Panel (Right-Side Panel)

- **File explorer**: browse the workspace directory tree with search.
- **Multi-tab preview**: preview files (markdown, images, code) in multiple tabs.
- **Drag-and-drop**: drag files from the explorer directly into the conversation input.
- **Workspace-gated**: respects the current workspace root.

### File @-mentions

- **File references**: type `@` in the input bar to reference files from the workspace.
- **Inline file chips**: selected files appear as chips in the input area.

### Underlying Harness Capabilities

- **Workspace and file management**: full file system access with sandboxing.
- **Sandboxed code execution**: bash and PowerShell with permission controls.
- **Subagents and parallel research**: spawn background agents for multi-task research.
- **Goal auto-continuation**: autonomous progress toward defined goals.
- **Plan mode and task breakdown**: structured planning and execution.
- **Durable sessions, replay, and multi-model configuration**: persistent conversation history and flexible model selection.
- **Plugin architecture**: everything is a plugin, powered by [Cordis](https://github.com/cordiverse/cordis).

## Quick Start

### Prerequisites

- Node.js ≥ 22
- pnpm
- DeepSeek API Key (configured in `~/.dsh/.credentials.yaml`)

### Run from source

```sh
git clone https://github.com/PHoenixs57/AixLab.git aixlab
cd aixlab
pnpm install
pnpm run build:lib
pnpm run build:web
pnpm dsh web --patch dev.cordis.yml
```

Open `http://127.0.0.1:3090`, create a new session, and try:

> "Find me the latest papers on IL-6 signaling in rheumatoid arthritis, 3 papers."

### Development

For hot-reload of client plugins:

```sh
pnpm run dev:web
pnpm dsh web --patch dev.cordis.yml
```

## Architecture

```
aixlab/
├── apps/cli/config/agent-presets/aixlab/   # Production "deepseek-aix" preset
│   ├── preset.yml
│   ├── agent.cordis.yml
│   └── skills/literature-search/
├── presets/aixlab/                         # Same content for customization
├── mcp/literature-search-mcp/              # Multi-source literature search MCP (stdio)
├── packages/
│   ├── literature/literature-favorites/    # Host plugin: favorites tools + panel
│   ├── literature/literature-attachments/  # Full-text retrieval service
│   ├── client/ui-literature/               # Client plugin: paper cards + favorites panel
│   ├── client/ui-aionui-panel/             # Right-side panel: explorer + preview + drag
│   ├── client/ui-skin-center/              # Skin management center
│   ├── client/ui-skin-*/                   # Individual theme skins
│   └── client/ui-sidebar/                  # Modified: sidebar.favorites slot
├── packages/api/remotes/                   # literatureFavorites Remote registration
├── packages/bundle/web-app/                # Web app bundle with all integrations
└── dev.cordis.yml                          # Development overlay (port 3090)
```

## Modes & Features

| Feature | Literature Search mode | Research mode |
|---|---|---|
| Conversational research-topic description (Chinese / English) | ✓ | ✓ |
| Multi-source literature search (PubMed, Europe PMC, bioRxiv/medRxiv, Crossref, OpenAlex, Semantic Scholar, arXiv) | ✓ | — |
| Automatic deduplication and cross-round merging | ✓ | — |
| Paper cards (authors, year, venue, abstract, DOI/PMID/arXiv, open-access badge) | ✓ | — |
| Favorites with category folders (durable across sessions) | ✓ | — |
| Full-text retrieval (open-access subset) | ✓ | — |
| Skin center with multiple themes | ✓ | ✓ |
| Right-side panel (file explorer, preview, drag-to-input) | ✓ | ✓ |
| File @-mentions in input | ✓ | ✓ |
| Workspace and file management | ✓ | ✓ |
| Sandboxed code execution (bash / PowerShell) | ✓ | ✓ |
| Subagents and parallel research | ✓ | ✓ |
| Goal auto-continuation | ✓ | ✓ |
| Plan mode and task breakdown | ✓ | ✓ |
| Durable sessions, replay, and multi-model configuration | ✓ | ✓ |

## Configuration

- **MCP server location**: defaults to `mcp/literature-search-mcp/dist/server.js`; override with `AIXLAB_MCP_SERVER` environment variable.
- **MCP working directory**: override with `AIXLAB_MCP_DIR`.
- **Default preset**: `agent-presets.default: aixlab` in `packages/bundle/web-app/cordis.patch.yml`; can be changed to `standard` in settings.
- **Port**: `dev.cordis.yml` uses port 3090; change if needed.

## Testing

```sh
# Literature favorites service
pnpm exec vitest run packages/literature/literature-favorites/tests/literature-favorites.spec.ts

# Paper card model (client)
pnpm exec vitest run packages/client/ui-literature/tests/paper-model.client.spec.ts

# GUI end-to-end smoke test (requires running server on 3090; playwright chromium)
node scripts/e2e-smoke.mjs
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
