# deepseek-aix

English | [中文](README.zh.md)

<img src="assets/deepseek-aix.png" width="220" alt="deepseek-aix" />

**deepseek-aix** is an AI research assistant for scholarly literature: describe a research topic in conversation, and the agent collects relevant papers through built-in multi-source search (PubMed, arXiv, Semantic Scholar, Crossref, and more), presenting the results as collapsible, bookmarkable paper cards.

Built as a fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), deepseek-aix keeps the full agent infrastructure — sessions, tools, subagents, workflows, and the Web GUI — and adds a literature capability on top: a multi-source literature-search service, a durable favorites collection with category folders, and a Web UI that renders search results and bookmarks as first-class cards.

## Highlights

- **Conversational literature search**: new sessions start in the deepseek-aix research-assistant mode; describe a topic in natural language (Chinese or English) and the agent searches, deduplicates, and ranks papers.
- **Paper cards in chat**: every search result renders as a card with authors, year, venue, abstract, and DOI/PMID/arXiv identifiers.
- **Favorites with folders**: bookmark papers across sessions into a durable, per-user collection, organized into category folders from the sidebar.
- **Everything is a plugin**: the underlying harness is plugin-based and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

deepseek-aix is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web --port 3090
```

The command starts the Web UI at `http://127.0.0.1:3090` (the port is configurable; the default is `3080`). See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
