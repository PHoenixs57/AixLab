# Agent Note: Port dsh-web-ui aionui-panel as an in-tree dual-face plugin

Status: implemented

English | [中文](2026-08-16-aionui-panel-port.zh.md)

## Problem

deepseek-aix wants the dsh-web-ui "right-side panel" (AionUi Explorer + Preview): a file tree with filename search, a multi-tab preview of many formats, and drag-a-file-into-the-composer. dsh-web-ui ships this as an external npm bundle (`@linxin666/dsh-client-ui-aionui-panel`) written against the published `@deepseek-ai/*` SDK, mounted by a `cordis.patch.yml` profile layer and doing its own DOM surgery on the shell grid. aixlab is the harness source checkout itself, so the feature must live in-tree under `packages/`.

## Decision

Port aionui-panel as one in-tree dual-face package `@deepseek-ai/dsh-client-ui-aionui-panel` at `packages/client/ui-aionui-panel`. The node half (`src/index.ts`, `inject = ['webServer', 'workspaceRegistry']`) owns a workspace-gated `FsService` and the `/aionui-panel/*` HTTP routes (JSON list/read/write/search/delete + a raw byte route + an fs-change SSE stream). The browser half (`src/client/`, the `dsh.client` manifest) keeps the original self-contained architecture: two `createRoot` trees mounted into frame-grid columns by a `PanelLayoutController` that appends two trailing grid tracks, the four stores reduced to three (`layout`/`explorer`/`preview`), direct same-origin `fetch` + `EventSource`, and a `conversation.input.dock` slot entry for the drag inlay.

The package names and service APIs are identical between dsh-web-ui's npm deps and the in-tree packages, so the host half ports nearly verbatim. The only adaptations are mechanical strictness (below) and the reduced surface (below).

### Scope reduction

SCM (git changes panel) and the `systemPrompt` announcement are deliberately omitted, per the product decision captured at port time. `git-service.ts`, `poll-guard.ts`, the git routes, the `ScmPanel`, the scm store, and the preview diff-tab machinery (`openDiff`/`handleGitChange`/`refreshDiffs`/`gitDiff`) are removed. The `'diff'` content type and `DiffViewer` are retained because `.diff`/`.patch` files still preview as unified diffs through the ordinary read path. The host `inject` drops `subprocess` and `systemPrompt`.

### Security model unchanged

The original loopback-only trust fence (`isLoopbackRequest`: socket address + Host header + same-origin markers) and the workspace gate (`createWorkspaceGate`: realpath the root, require membership in `workspaceRegistry.list()` paths) are retained verbatim. `FsService.resolveInsideRoot` keeps its symlink-escape defense and `.git`-path refusal. The panel still reads/writes raw `node:fs` directly rather than the `ctx.fs` capability — a faithful port choice; adopting `ctx.fs` + `fs.contains` is a possible later enhancement.

### Strictness adaptations

aixlab's `tsconfig.base.json` enables `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, which the dsh-web-ui source did not assume. The port adds non-null assertions on array indexing (`markdown.ts`, `layout.ts`, `probeImageSize`, `handleFsChange`) and conditional spreads for optional `image`/`mtime` fields (`loadContent`/`reloadTab`, `FsService.read`), plus `IconProps.className?: string | undefined`. `layout.ts`'s `findFrame` gains a reliable anchor: the shell `AppFrame` now stamps `data-dsh-frame` on its grid element (the original fallback `[class*="sidebarCol"]` also works but is hash-fragile).

### Drag inlay alignment

The composer drop target registers into the existing `conversation.input.dock` slot. Its `insertPath` verb resolves the session scope via `ctx.sessions.scope(sessionId)` and writes the draft through `conversation.input.for(actx)` → `setDraft(...)`, matching aixlab's `SessionInputResolver` facade (the dsh-web-ui rc.6 shape was `conversation.input.for(actx).state.getSnapshot().draft` + `setDraft`; aixlab is structurally the same).

## Consequences

The right-side panel now appears in `dsh web` sessions with a non-empty cwd: an Explorer column (file tree + filename search, with a collapse chevron) and a Preview column (multi-tab source/preview/split/save/download for markdown/html/code/diff/csv/pdf/image/text/url), plus a drop target above the composer that inserts a workspace-relative path into the draft. Panel widths, collapse state, tabs, and expanded dirs persist per project root in `localStorage` under the original AionUi keys. The host exposes `/aionui-panel/*` (JSON) and `/aionui-panel/events` (SSE) on the shared webserver, loopback-only and workspace-gated. SCM and the system-prompt announcement are absent until explicitly restored.

## Alternatives considered

**Native slot-system rewrite** — rejected. Rewriting ~30 React files onto `ctx.slots.register`/Typert Remote/declared stores and extending `AppFrame` to a fifth grid track is a much larger, riskier change. The faithful port preserves the feature's exact behavior and can be native-ified incrementally later.

**External bundle install** — rejected. aixlab runs from source; the `@linxin666/*` bundle targets the published SDK and is not resolvable in-tree.

**Reuse `ctx.fs` capability for the host service** — deferred. `FsService` would resolve targets and check `fs.contains` instead of `realpath` + prefix comparison; this is a contained follow-up, not required for correctness.
