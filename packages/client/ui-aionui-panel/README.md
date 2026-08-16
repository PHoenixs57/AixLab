# @deepseek-ai/dsh-client-ui-aionui-panel

English | [中文](README.zh.md)

Right-side panel system for `dsh web`, a faithful in-tree port of the dsh-web-ui aionui-panel (AionUi Explorer + Preview, re-implemented). It is one dual-face package: the node half registers a workspace-gated filesystem service and the `/aionui-panel/*` HTTP routes, and the browser half mounts the panel columns.

The node half (`src/index.ts`, `inject = ['webServer', 'workspaceRegistry']`) owns a `FsService` and the routes: JSON `list` / `read` / `write` / `search` / `delete`, a `raw` byte route for streamed pdf/markdown-image bytes, and an `events` SSE stream that pushes `{ kind: 'fs' }` on file changes. Every operation runs the workspace gate (`createWorkspaceGate`: the root must realpath inside a `workspaceRegistry.list()` path) and the loopback trust fence; the service refuses `.git` paths and re-checks symlink escapes.

The browser half (`src/client/`, the `dsh.client` manifest) keeps the original self-contained architecture: a `PanelLayoutController` appends two trailing grid tracks to the shell frame (anchored by `data-dsh-frame`) and two React roots render into them. Three stores — `layout`, `explorer`, `preview` — drive the Explorer file tree with debounced filename search, the multi-tab Preview (markdown/html/code/diff/csv/pdf/image/text/url with source/preview toggle, split edit, save, download), and the drag-a-file-into-the-composer dock. Both dropping a file from the Explorer and typing `@` in the composer insert a workspace file as an inline reference chip (labeled with the file basename) through the conversation input facade: the `@` source (`file-source.ts`) lists files via the fs `list`/`search` routes and its codec serializes the chip back to the relative path at submit. Widths, collapse, tabs, and expanded dirs persist per project root in `localStorage` under the original AionUi keys.

## Model Experience

None directly: the panel is presentation-only and adds no prompt content. Its only model-visible effect is indirect — when the user drops a file onto the composer dock or mentions one via `@`, an inline file chip is inserted into the draft and serializes back to a plain workspace-relative path at submit, which becomes part of the user message when sent (the agent then reads the file through its own tools).

#### KV Cache effect

None beyond the ordinary effect of a user message that happens to contain an inserted path.

## Known Limitations and Deferred Work

- **SCM deferred** — the git-changes panel and the system-prompt announcement are intentionally omitted (per the port-scope decision). The host `inject` drops `subprocess` and `systemPrompt`; re-adding SCM means restoring `git-service.ts`, `poll-guard.ts`, the git routes, and the scm store.
- **Faithful-port layering divergence** — the browser half uses its own React roots, its own stores, direct `fetch`/`EventSource`, and DOM grid surgery rather than `ctx.slots.register`/Typert Remote/declared stores. This is a deliberate port of an existing self-contained feature; it can be native-ified incrementally.
- **Host service uses raw `node:fs`** — `FsService` gates via `realpath` + prefix comparison rather than the `ctx.fs` capability (`fs.contains`). A contained follow-up could re-home it onto `ctx.fs`.
- **No package-level tests yet** — the port shipped without porting the dsh-web-ui vitest suites; the source is covered by typecheck and `test:gui` composition only.
