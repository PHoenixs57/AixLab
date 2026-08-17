/**
 * Framework-free state core of the panel system: three small stores (layout,
 * explorer, preview) built on a minimal subscribe/getSnapshot primitive
 * so every decision lives outside React (StrictMode-safe: update reducers are
 * pure; async work — fetches, persistence — runs in the action layer).
 *
 * AionUi's right-panel architecture (Apache-2.0, re-implemented): the width
 * clamps below are the exact ordered pair that keeps the chat area >= 360px
 * at all times (see the research report's section 4.2).
 * @module dsh-aionui-panel/client/store
 */

import type { FileRead, FsEntry, PreviewContentType, SearchHit } from '../core/types.ts'
import type { PanelApi } from './api.ts'
import { detectContentType, isTextType, pdfPreviewUrl, tabIdOf } from './fileType.ts'
import {
  createDebounced, evictPreviewScopes, readJson, readStoredNumber, writeJson, writeStoredNumber,
} from './persist.ts'

// ─── state primitive ────────────────────────────────────────────────────────

/** Internal channel for the stored-layout flush used by pagehide flushing. */
const FLUSH_PERSIST = Symbol('flushPersist')

/** A minimal external store usable with useSyncExternalStore. */
export interface StateHandle<S> {
  getSnapshot: () => S
  subscribe: (listener: () => void) => () => void
  /** Pure update: fn receives the previous state and returns the next. */
  update: (fn: (prev: S) => S) => void
}

/** Create a state handle with an immutable snapshot (new object per update). */
export function createState<S>(initial: S): StateHandle<S> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update(fn) {
      const next = fn(state)
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
  }
}

// ─── layout: constants, clamps, store ───────────────────────────────────────

/** Chat-area floor the two clamps guarantee (never below this). */
export const MIN_CHAT_PANEL_PX = 360
/** Preview region width contract. */
export const MIN_PREVIEW_PANEL_PX = 340
export const DEFAULT_PREVIEW_REGION_PX = 480
export const MAX_PREVIEW_REGION_PX = 1200
/** Explorer (workspace) width contract. */
export const MIN_WORKSPACE_PANEL_PX = 220
export const MAX_WORKSPACE_PANEL_PX = 500
export const DEFAULT_WORKSPACE_PANEL_PX = 260
/** Preview region horizontal chrome (margins + borders) the clamps subtract. */
export const PREVIEW_REGION_CHROME_PX = 24

/** Storage keys (AionUi contract, verbatim). */
export const KEY_EXPLORER_WIDTH = 'chat-workspace-width-px'
export const KEY_PREVIEW_WIDTH = 'chat-preview-width-px'
export const KEY_COLLAPSE = 'project-panel-collapse:'
export const KEY_EXPLORER_UI = 'explorer-ui:'

/**
 * Explorer clamp (runs first): reserve chat's floor plus the preview region
 * (min + chrome) when open, so the explorer never grows into the preview's
 * space; floor at the explorer minimum so a narrow container cannot squeeze
 * it to nothing.
 */
export function clampExplorerWidth(requested: number, available: number, previewOpen: boolean): number {
  const reserve = MIN_CHAT_PANEL_PX + (previewOpen ? MIN_PREVIEW_PANEL_PX + PREVIEW_REGION_CHROME_PX : 0)
  const maxByContainer = Math.max(MIN_WORKSPACE_PANEL_PX, available - reserve)
  return Math.min(requested, maxByContainer)
}

/**
 * Preview clamp (runs after the explorer clamp): reserve chat's floor plus
 * the already-clamped explorer width plus the region chrome. The ordered pair
 * guarantees chat = available - explorer - preview >= 360.
 */
export function clampPreviewWidth(requested: number, available: number, explorerWidth: number): number {
  const maxByContainer = Math.max(
    MIN_PREVIEW_PANEL_PX,
    available - MIN_CHAT_PANEL_PX - explorerWidth - PREVIEW_REGION_CHROME_PX,
  )
  return Math.min(requested, maxByContainer)
}

/** Layout panel state (project-scoped). */
export interface LayoutState {
  /** The project root ('' when no project is bound). */
  root: string
  /** Requested explorer width (persisted; clamped on render). */
  explorerWidth: number
  /** Requested preview width (persisted; clamped on render). */
  previewWidth: number
  /** Explorer collapsed (width 0, kept mounted). */
  explorerCollapsed: boolean
  /** Preview region visible. */
  previewOpen: boolean
  /** Measured available width of the [content | panels] row. */
  availableWidth: number
  /** True while a panel drag is in flight (disables transitions). */
  dragging: boolean
}

/** The layout store plus its pure width math. */
export interface LayoutStore extends StateHandle<LayoutState> {
  /** Effective explorer width after the ordered clamp. */
  explorerWidthPx: (state: LayoutState) => number
  /** Effective preview width after the ordered clamp. */
  previewWidthPx: (state: LayoutState) => number
  /** Persist a clamped shrink when the stored width no longer fits. */
  shrinkToFit: (state: LayoutState) => void
}

/** Storage key of the collapse preference for one root. */
export const collapseKey = (root: string): string => `${KEY_COLLAPSE}${root}`

/** Create the layout store (reads persisted widths on init). */
export function createLayoutStore(): LayoutStore {
  const handle = createState<LayoutState>({
    root: '',
    explorerWidth: readStoredNumber(KEY_EXPLORER_WIDTH, MIN_WORKSPACE_PANEL_PX, MAX_WORKSPACE_PANEL_PX, DEFAULT_WORKSPACE_PANEL_PX),
    previewWidth: readStoredNumber(KEY_PREVIEW_WIDTH, MIN_PREVIEW_PANEL_PX, MAX_PREVIEW_REGION_PX, DEFAULT_PREVIEW_REGION_PX),
    explorerCollapsed: false,
    previewOpen: false,
    availableWidth: 0,
    dragging: false,
  })
  const store: LayoutStore = Object.assign(handle, {
    explorerWidthPx(state: LayoutState): number {
      return state.explorerCollapsed ? 0 : clampExplorerWidth(state.explorerWidth, state.availableWidth, state.previewOpen)
    },
    previewWidthPx(state: LayoutState): number {
      if (!state.previewOpen) return 0
      const explorer = state.explorerCollapsed ? 0 : clampExplorerWidth(state.explorerWidth, state.availableWidth, true)
      return clampPreviewWidth(state.previewWidth, state.availableWidth, explorer)
    },
    shrinkToFit(state: LayoutState): void {
      if (state.availableWidth <= 0) return
      const explorer = clampExplorerWidth(state.explorerWidth, state.availableWidth, state.previewOpen)
      if (state.explorerWidth > explorer && !state.explorerCollapsed) {
        writeStoredNumber(KEY_EXPLORER_WIDTH, explorer)
        handle.update(prev => ({ ...prev, explorerWidth: explorer }))
      }
      const preview = clampPreviewWidth(state.previewWidth, state.availableWidth, explorer)
      if (state.previewOpen && state.previewWidth > preview) {
        writeStoredNumber(KEY_PREVIEW_WIDTH, preview)
        handle.update(prev => ({ ...prev, previewWidth: preview }))
      }
    },
  })
  return store
}

/** Switch the layout to a project root (restores collapse + widths). */
export function layoutSetRoot(store: LayoutStore, root: string, previewOpen: boolean): void {
  store.update((prev) => {
    if (prev.root === root && prev.previewOpen === previewOpen) return prev
    let collapsed = prev.explorerCollapsed
    if (prev.root !== root) {
      try {
        collapsed = localStorage.getItem(collapseKey(root)) === 'collapsed'
      } catch {
        collapsed = false
      }
    }
    return { ...prev, root, explorerCollapsed: collapsed, previewOpen }
  })
}

// ─── explorer store ─────────────────────────────────────────────────────────

/** Explorer panel state. */
export interface ExplorerState {
  root: string
  /** rel path -> listing cache ('' = root). */
  dirs: Record<string, FsEntry[]>
  /** Expanded dir rel paths (order = display order). */
  expanded: string[]
  /** Selected node rel path (null = none). */
  selected: string | null
  /** Dirs currently fetching. */
  loading: string[]
  /** Filename search state. */
  search: {
    query: string
    status: 'idle' | 'searching' | 'done' | 'error'
    hits: SearchHit[]
    truncated: boolean
  }
  /** Bumped on every fs change event (drives refetch + re-render). */
  version: number
}

/** The explorer store with its async actions. */
export interface ExplorerStore extends StateHandle<ExplorerState> {
  setRoot: (root: string) => void
  toggleDir: (rel: string) => void
  select: (rel: string | null) => void
  reveal: (rel: string) => void
  setSearchQuery: (query: string) => void
  cancelSearch: () => void
  /** Refetch every expanded dir + active search after a host change event. */
  handleFsChange: () => void
}

/** Read the persisted explorer UI state for a root (range-guarded). */
export function readExplorerUi(root: string): { expanded: string[]; selected: string | null } {
  const stored = readJson<{ expanded?: unknown; selected?: unknown }>(`${KEY_EXPLORER_UI}${root}`, {})
  const expanded = Array.isArray(stored.expanded)
    ? stored.expanded.filter((item): item is string => typeof item === 'string')
    : []
  const selected = typeof stored.selected === 'string' ? stored.selected : null
  return { expanded, selected }
}

const EMPTY_SEARCH = { query: '', status: 'idle' as const, hits: [], truncated: false }

/** Create the explorer store (per-root persistence, debounced writes). */
export function createExplorerStore(api: PanelApi): ExplorerStore {
  const handle = createState<ExplorerState>({
    root: '',
    dirs: {},
    expanded: [],
    selected: null,
    loading: [],
    search: { ...EMPTY_SEARCH },
    version: 0,
  })

  const persistDebounced = createDebounced()
  const searchDebounced = createDebounced()
  let fsVersion = 0
  let persistRoot = ''
  let persistExpanded: string[] = []
  let persistSelected: string | null = null
  // The debounced write (schedulePersist queues this; flushNow runs it now).
  const persistWrite = (): void => {
    if (persistRoot !== '') writeJson(`${KEY_EXPLORER_UI}${persistRoot}`, { expanded: persistExpanded, selected: persistSelected })
  }
  const flushPersist = (): void => { persistDebounced.flush() }
  const schedulePersist = (root: string, expanded: string[], selected: string | null): void => {
    if (root === '') return
    persistRoot = root
    persistExpanded = expanded
    persistSelected = selected
    persistDebounced.schedule(persistWrite)
  }

  /** Load one dir's listing into the cache (no-op when already present). */
  const ensureDir = async (root: string, rel: string): Promise<void> => {
    const state = handle.getSnapshot()
    if (state.root !== root || state.dirs[rel] !== undefined || state.loading.includes(rel)) return
    handle.update(prev => ({ ...prev, loading: [...prev.loading, rel] }))
    const result = await api.list(root, rel)
    handle.update((prev) => {
      if (prev.root !== root) return prev
      // A listing that landed after its dir collapsed must not re-populate
      // the cache (the expand/collapse race would resurrect stale children).
      if (rel !== '' && !prev.expanded.includes(rel)) {
        return { ...prev, loading: prev.loading.filter(item => item !== rel) }
      }
      const dirs = result.ok
        ? { ...prev.dirs, [rel]: result.value.entries }
        : Object.fromEntries(Object.entries(prev.dirs).filter(([key]) => key !== rel))
      return { ...prev, dirs, loading: prev.loading.filter(item => item !== rel) }
    })
  }

  /** Drop cached subtrees under a collapsed dir (its own key included). */
  const dropSubtree = (dirs: Record<string, FsEntry[]>, rel: string): Record<string, FsEntry[]> => {
    const prefix = rel === '' ? '' : `${rel}/`
    const next: Record<string, FsEntry[]> = {}
    for (const key of Object.keys(dirs)) {
      if (rel !== '' && (key === rel || key.startsWith(prefix))) continue
      const entry = dirs[key]
      if (entry !== undefined) next[key] = entry
    }
    return next
  }

  /** A dir's ancestor chain ('' .. parent). */
  const ancestors = (rel: string): string[] => {
    const out: string[] = []
    const parts = rel.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc = acc === '' ? part : `${acc}/${part}`
      out.push(acc)
    }
    return out
  }

  const store: ExplorerStore = Object.assign(handle, {
    setRoot(root: string) {
      handle.update((prev) => {
        if (prev.root === root) return prev
        const ui = readExplorerUi(root)
        return {
          ...prev,
          root,
          dirs: {},
          expanded: ui.expanded,
          selected: ui.selected,
          loading: [],
          search: { ...EMPTY_SEARCH },
        }
      })
      void ensureDir(root, '')
    },
    toggleDir(rel: string) {
      const state = handle.getSnapshot()
      const isExpanded = state.expanded.includes(rel)
      if (isExpanded) {
        handle.update(prev => ({
          ...prev,
          expanded: prev.expanded.filter(item => item !== rel),
          dirs: dropSubtree(prev.dirs, rel),
        }))
      } else {
        handle.update(prev => ({ ...prev, expanded: [...prev.expanded, rel] }))
        void ensureDir(state.root, rel)
      }
      schedulePersist(state.root, isExpanded ? state.expanded.filter(item => item !== rel) : [...state.expanded, rel], state.selected)
    },
    select(rel: string | null) {
      handle.update(prev => (prev.selected === rel ? prev : { ...prev, selected: rel }))
      const state = handle.getSnapshot()
      schedulePersist(state.root, state.expanded, rel)
    },
    reveal(rel: string) {
      const state = handle.getSnapshot()
      const chain = ancestors(rel)
      const missing = chain.filter(item => !state.expanded.includes(item))
      handle.update((prev) => {
        const expanded = [...prev.expanded]
        for (const item of missing) {
          if (!expanded.includes(item)) expanded.push(item)
        }
        return { ...prev, expanded, selected: rel, search: { ...EMPTY_SEARCH } }
      })
      for (const item of missing) void ensureDir(state.root, item)
      schedulePersist(state.root, [...state.expanded, ...missing], rel)
    },
    setSearchQuery(query: string) {
      const trimmed = query.trim()
      handle.update((prev) => {
        if (trimmed === '' && prev.search.query === '') return prev
        return {
          ...prev,
          search: trimmed === ''
            ? { ...EMPTY_SEARCH }
            : { ...prev.search, query: trimmed, status: 'searching' },
        }
      })
      searchDebounced.dispose()
      if (trimmed === '') return
      const root = handle.getSnapshot().root
      searchDebounced.schedule(() => {
        void api.search(root, trimmed).then((result) => {
          handle.update((prev) => {
            if (prev.root !== root || prev.search.query !== trimmed) return prev
            return {
              ...prev,
              search: result.ok
                ? { query: trimmed, status: 'done', hits: result.value.hits, truncated: result.value.truncated }
                : { ...prev.search, status: 'error', hits: [] },
            }
          })
        })
      })
    },
    cancelSearch() {
      searchDebounced.dispose()
      handle.update(prev => (prev.search.query === '' ? prev : { ...prev, search: { ...EMPTY_SEARCH } }))
    },
    async handleFsChange() {
      const state = handle.getSnapshot()
      const root = state.root
      if (root === '') return
      const dirs = [...new Set(['', ...state.expanded])]
      const seq = ++fsVersion
      const results = await Promise.allSettled(dirs.map(rel => api.list(root, rel)))
      handle.update((prev) => {
        if (prev.root !== root || seq !== fsVersion) return prev
        const nextDirs = { ...prev.dirs }
        results.forEach((result, index) => {
          const rel = dirs[index]
          if (rel === undefined) return
          if (result.status !== 'fulfilled' || !result.value.ok) return
          // A dir folded while the event burst was in flight must not be
          // re-populated (the collapse would revive from a stale snapshot).
          if (rel !== '' && !prev.expanded.includes(rel)) return
          nextDirs[rel] = result.value.value.entries
        })
        return { ...prev, dirs: nextDirs, version: prev.version + 1 }
      })
      if (state.search.query !== '') {
        void api.search(root, state.search.query).then((result) => {
          handle.update((prev) => {
            if (prev.root !== root || prev.search.query !== state.search.query) return prev
            return {
              ...prev,
              search: result.ok
                ? { query: state.search.query, status: 'done', hits: result.value.hits, truncated: result.value.truncated }
                : prev.search,
            }
          })
        })
      }
    },
  })
  ;(store as unknown as Record<symbol, unknown>)[FLUSH_PERSIST] = flushPersist
  return store
}

// ─── preview store ──────────────────────────────────────────────────────────

/** One preview tab. */
export interface PreviewTabState {
  id: string
  title: string
  root: string
  path: string
  contentType: PreviewContentType
  /** URL tabs: bumped by reloadTab to re-navigate the preview frame. */
  reloadNonce?: number
  /** null: content not loaded yet. */
  content: string | null
  /** Image dimensions for image tabs. */
  image?: { width: number; height: number }
  dirty: boolean
  /** mtime the loaded/saved content is based on (write-conflict base). */
  mtime?: number
  /** Disk is newer than the loaded content (refresh affordance). */
  updated: boolean
  loading: boolean
  truncated: boolean
  error: string | null
  savedAt: number
}

/** Preview panel state. */
export interface PreviewState {
  root: string
  open: boolean
  tabs: PreviewTabState[]
  activeTabId: string | null
  /** Bumped on every fs change event (drives staleness checks). */
  version: number
}

/** The preview store with its async actions. */
export interface PreviewStore extends StateHandle<PreviewState> {
  setRoot: (root: string) => void
  openFile: (root: string, path: string) => void
  switchTab: (id: string) => void
  closeTabs: (ids: string[]) => void
  updateContent: (id: string, content: string) => void
  saveTab: (id: string) => Promise<void>
  reloadTab: (id: string) => Promise<void>
  setOpen: (open: boolean) => void
  handleFsChange: () => void
}

/** Persisted tab meta (content is re-fetched on restore). */
interface PersistedTab {
  id: string
  title: string
  root: string
  path: string
  contentType: PreviewContentType
  savedAt: number
}

/** Read persisted tabs for a root (guarded, content-less). */
export function readPreviewTabs(root: string): PersistedTab[] {
  const stored = readJson<{ savedAt?: unknown; tabs?: unknown }>(`preview-ui:${root}`, {})
  if (!Array.isArray(stored.tabs)) return []
  const out: PersistedTab[] = []
  for (const item of stored.tabs) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.path !== 'string') continue
    out.push({
      id: record.id,
      title: typeof record.title === 'string' ? record.title : record.path,
      root: typeof record.root === 'string' ? record.root : root,
      path: record.path,
      contentType: typeof record.contentType === 'string' ? record.contentType as PreviewContentType : 'text',
      savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
    })
  }
  return out
}

/** Create the preview store (per-root tab persistence with LRU scopes). */
export function createPreviewStore(api: PanelApi): PreviewStore {
  const handle = createState<PreviewState>({
    root: '',
    open: false,
    tabs: [],
    activeTabId: null,
    version: 0,
  })

  const persistDebounced = createDebounced()
  const persistWrite = (): void => {
    const current = handle.getSnapshot()
    if (current.root === '') return
    const meta: PersistedTab[] = current.tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      root: tab.root,
      path: tab.path,
      contentType: tab.contentType,
      savedAt: tab.savedAt,
    }))
    writeJson(`preview-ui:${current.root}`, { savedAt: Date.now(), tabs: meta })
    evictPreviewScopes(current.root)
  }
  const flushPersist = (): void => { persistDebounced.flush() }
  const schedulePersist = (state: PreviewState): void => {
    if (state.root === '') return
    persistDebounced.schedule(persistWrite)
  }

  /** Load content for one tab (text or image data URL). */
  const loadContent = async (root: string, id: string): Promise<void> => {
    const tab = handle.getSnapshot().tabs.find(item => item.id === id)
    if (tab === undefined || tab.content !== null || tab.loading) return
    handle.update(prev => ({
      ...prev,
      tabs: prev.tabs.map(item => (item.id === id ? { ...item, loading: true, error: null } : item)),
    }))
    // Pdf tabs never fetch through /read: the raw route streams the bytes
    // straight into the preview iframe, so the tab content is the route URL.
    if (tab.contentType === 'pdf') {
      handle.update((prev) => {
        if (prev.root !== root) return prev
        return {
          ...prev,
          tabs: prev.tabs.map(item => (item.id === id
            ? { ...item, loading: false, content: pdfPreviewUrl(root, item.path, Date.now()), updated: false }
            : item)),
        }
      })
      return
    }
    const asImage = tab.contentType === 'image'
    const result = await api.read(root, tab.path, asImage)
    handle.update((prev) => {
      if (prev.root !== root) return prev
      return {
        ...prev,
        tabs: prev.tabs.map((item) => {
          if (item.id !== id) return item
          if (!result.ok) {
            return { ...item, loading: false, error: result.error.message }
          }
          // The user started typing while the fetch was in flight: their newer
          // content must not be overwritten by this (already stale) disk read.
          if (item.dirty) return { ...item, loading: false }
          const loaded = result.value as { content: string; image?: FileRead['image']; mtime?: number; truncated?: boolean }
          return {
            ...item,
            loading: false,
            content: loaded.content,
            ...(loaded.image !== undefined ? { image: loaded.image } : {}),
            ...(loaded.mtime !== undefined ? { mtime: loaded.mtime } : {}),
            truncated: loaded.truncated ?? false,
            updated: false,
          }
        }),
      }
    })
  }

  /** Touch a tab's savedAt (LRU order within the scope). */
  const touch = (id: string): void => {
    handle.update(prev => ({
      ...prev,
      tabs: prev.tabs.map(item => (item.id === id ? { ...item, savedAt: Date.now() } : item)),
    }))
  }

  const store: PreviewStore = Object.assign(handle, {
    setRoot(root: string) {
      handle.update((prev) => {
        if (prev.root === root) return prev
        const persisted = readPreviewTabs(root)
        const tabs: PreviewTabState[] = persisted.map(meta => ({
          id: meta.id,
          title: meta.title,
          root: meta.root,
          path: meta.path,
          contentType: meta.contentType,
          content: null,
          dirty: false,
          updated: false,
          loading: false,
          truncated: false,
          error: null,
          savedAt: meta.savedAt,
        }))
        const activeTabId = tabs.at(-1)?.id ?? null
        return { ...prev, root, tabs, activeTabId, open: tabs.length > 0 }
      })
      const state = handle.getSnapshot()
      if (state.activeTabId !== null) void loadContent(root, state.activeTabId)
    },
    openFile(root: string, path: string) {
      const type = detectContentType(path)
      const id = tabIdOf(root, path, type)
      const existing = handle.getSnapshot().tabs.find(tab => tab.id === id)
      if (existing !== undefined) {
        handle.update(prev => ({
          ...prev,
          root,
          open: true,
          activeTabId: id,
          tabs: prev.tabs.map(tab => (tab.id === id ? { ...tab, savedAt: Date.now() } : tab)),
        }))
        void loadContent(root, id)
        schedulePersist(handle.getSnapshot())
        return
      }
      handle.update((prev) => {
        if (prev.root !== root) return prev
        const tab: PreviewTabState = {
          id,
          title: path.split('/').pop() ?? path,
          root,
          path,
          contentType: type,
          content: null,
          dirty: false,
          updated: false,
          loading: false,
          truncated: false,
          error: null,
          savedAt: Date.now(),
        }
        return { ...prev, open: true, tabs: [...prev.tabs, tab], activeTabId: id }
      })
      void loadContent(root, id)
      schedulePersist(handle.getSnapshot())
    },
    switchTab(id: string) {
      const state = handle.getSnapshot()
      if (state.activeTabId === id) return
      handle.update(prev => ({ ...prev, activeTabId: id }))
      touch(id)
      const tab = handle.getSnapshot().tabs.find(item => item.id === id)
      if (tab !== undefined && tab.content === null) void loadContent(state.root, id)
      schedulePersist(handle.getSnapshot())
    },
    closeTabs(ids: string[]) {
      const state = handle.getSnapshot()
      const remaining = state.tabs.filter(tab => !ids.includes(tab.id))
      const active = remaining.some(tab => tab.id === state.activeTabId)
      const fallbackIndex = Math.min(
        state.tabs.findIndex(tab => tab.id === state.activeTabId),
        remaining.length - 1,
      )
      const activeTabId = active
        ? state.activeTabId
        : remaining.length > 0
          ? remaining[fallbackIndex]?.id ?? remaining.at(-1)?.id ?? null
          : null
      handle.update(prev => ({
        ...prev,
        tabs: remaining,
        activeTabId,
        open: remaining.length > 0 ? prev.open : false,
      }))
      schedulePersist(handle.getSnapshot())
    },
    updateContent(id: string, content: string) {
      handle.update(prev => ({
        ...prev,
        tabs: prev.tabs.map(tab => (tab.id === id ? { ...tab, content, dirty: true, updated: false } : tab)),
      }))
    },
    async saveTab(id: string) {
      const state = handle.getSnapshot()
      const tab = state.tabs.find(item => item.id === id)
      if (tab === undefined || tab.content === null || !isTextType(tab.contentType)) return
      const sentContent = tab.content
      handle.update(prev => ({
        ...prev,
        tabs: prev.tabs.map(item => (item.id === id ? { ...item, loading: true, error: null } : item)),
      }))
      const result = await api.write(state.root, tab.path, tab.content, tab.mtime)
      handle.update((prev) => {
        if (prev.root !== state.root) return prev
        return {
          ...prev,
          tabs: prev.tabs.map((item) => {
            if (item.id !== id) return item
            if (!result.ok) {
              return {
                ...item,
                loading: false,
                error: result.error.code === 'write-conflict'
                  ? '文件已在磁盘上被修改，保存冲突：请刷新后重试'
                  : result.error.message,
              }
            }
            if (item.content !== sentContent) {
              // The user kept typing while the save was in flight: the disk now
              // holds the sent snapshot, but the tab's newer edits are unsaved.
              // Refresh the write base so the next save is conflict-safe and
              // keep the dirty flag so the UI still shows an unsaved edit.
              return { ...item, loading: false, mtime: result.value.mtime, error: null }
            }
            return { ...item, loading: false, dirty: false, mtime: result.value.mtime, error: null }
          }),
        }
      })
    },
    async reloadTab(id: string) {
      const state = handle.getSnapshot()
      const tab = state.tabs.find(item => item.id === id)
      if (tab === undefined) return
      if (tab.contentType === 'url') {
        // URL tabs own a live document inside the frame; reload bumps the
        // nonce so UrlViewer re-navigates the frame to its address.
        handle.update(prev => ({
          ...prev,
          tabs: prev.tabs.map(item =>
            item.id === id ? { ...item, reloadNonce: (item.reloadNonce ?? 0) + 1 } : item,
          ),
        }))
        return
      }
      if (tab.contentType === 'pdf') {
        // Streamed tab: re-point the iframe at the raw route with a fresh
        // nonce so the browser re-fetches the bytes (no /read round-trip).
        handle.update(prev => ({
          ...prev,
          tabs: prev.tabs.map(item => (item.id === id
            ? { ...item, content: pdfPreviewUrl(state.root, item.path, Date.now()), updated: false, error: null }
            : item)),
        }))
        return
      }
      handle.update(prev => ({
        ...prev,
        tabs: prev.tabs.map(item => (item.id === id ? { ...item, loading: true } : item)),
      }))
      const result = await api.read(state.root, tab.path, tab.contentType === 'image')
      handle.update((prev) => {
        if (prev.root !== state.root) return prev
        return {
          ...prev,
          tabs: prev.tabs.map((item) => {
            if (item.id !== id) return item
            if (!result.ok) return { ...item, loading: false, error: result.error.message }
            const loaded = result.value as { content: string; image?: FileRead['image']; mtime?: number; truncated?: boolean }
            return {
              ...item,
              loading: false,
              content: loaded.content,
              ...(loaded.image !== undefined ? { image: loaded.image } : {}),
              ...(loaded.mtime !== undefined ? { mtime: loaded.mtime } : {}),
              truncated: loaded.truncated ?? false,
              updated: false,
              dirty: false,
              error: null,
            }
          }),
        }
      })
    },
    setOpen(open: boolean) {
      handle.update(prev => (prev.open === open ? prev : { ...prev, open }))
    },
    async handleFsChange() {
      const state = handle.getSnapshot()
      if (state.root === '') return
      handle.update(prev => ({ ...prev, version: prev.version + 1 }))
      // Staleness probe for the ACTIVE file tab only (cheap; the fs watcher
      // debounces bursts). A newer disk mtime flips the tab to "updated".
      const active = handle.getSnapshot().tabs.find(tab => tab.id === handle.getSnapshot().activeTabId)
      if (active === undefined || active.content === null || active.dirty || !isTextType(active.contentType)) return
      const result = await api.read(state.root, active.path, false)
      handle.update((prev) => {
        if (prev.root !== state.root) return prev
        return {
          ...prev,
          tabs: prev.tabs.map((tab) => {
            if (tab.id !== active.id || tab.dirty) return tab
            if (!result.ok) return tab
            return { ...tab, updated: tab.mtime !== undefined && result.value.mtime > tab.mtime + 1 }
          }),
        }
      })
    },
  })
  ;(store as unknown as Record<symbol, unknown>)[FLUSH_PERSIST] = flushPersist
  return store
}

/** Convenience bundle: the three stores wired to one api. */
export interface PanelStores {
  layout: LayoutStore
  explorer: ExplorerStore
  preview: PreviewStore
}

/** PanelStores plus a pagehide flush hook. */
export interface PanelStoresWithFlush extends PanelStores {
  /** Flush every pending debounced persist immediately (pagehide/beforeunload). */
  flushNow: () => void
}

/** Create the full store bundle. */
export function createPanelStores(api: PanelApi): PanelStoresWithFlush {
  const layout = createLayoutStore()
  const explorer = createExplorerStore(api)
  const preview = createPreviewStore(api)
  const flushNow = (): void => {
    for (const store of [explorer, preview]) {
      const flush = (store as unknown as Record<symbol, unknown>)[FLUSH_PERSIST]
      if (typeof flush === 'function') (flush as () => void)()
    }
  }
  const stores: PanelStoresWithFlush = { layout, explorer, preview, flushNow }
  return stores
}
