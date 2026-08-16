/**
 * Incremental cache for the ths skin's code-workload index cell.
 *
 * The index sums, across every workspace, the net line change of that
 * workspace's latest day candle (<code>last.close - last.open</code>). The
 * original 30s refresh always re-derived every per-workspace delta from
 * scratch. This module maintains a per-workspace delta cache keyed by the
 * candle's (close, open) pair: because a delta depends only on those two
 * values, an unchanged pair proves an unchanged delta and the cached value
 * can be reused — making the aggregate incremental instead of a full
 * rescan. Behaviour stays equivalent to a full recompute: <code>net</code>
 * is always the sum of each current workspace's (last.close - last.open),
 * and workspaces absent from a frame simply drop out of the cache.
 *
 * Pure scheduling-free module: no DOM, no I/O — callers own the fetching and
 * rendering, so tests can drive it deterministically.
 */

/** A candle row as consumed by the skin (close/open are the only fields used). */
export interface CandleLike {
  close: number
  open: number
}

/** One workspace's contribution to the current refresh frame. */
export interface WorkspaceDeltaInput {
  workspaceId: string
  /** The latest day candle; undefined means the workspace contributes 0. */
  last?: CandleLike | undefined
}

/** Cached per-workspace delta with the candle pair that produced it. */
export interface CachedDelta {
  close: number
  open: number
  delta: number
}

/** Immutable view of the per-workspace delta cache. */
export type CodeIndexCache = ReadonlyMap<string, CachedDelta>

/** Result of one incremental accumulation frame. */
export interface CodeIndexResult {
  /** Sum of per-workspace deltas (behaviour-equivalent to full recompute). */
  net: number
  /** Incrementally updated cache for the next frame. */
  cache: CodeIndexCache
  /** How many workspaces actually re-derived their delta this frame. */
  changed: number
}

/**
 * Accumulate one refresh frame over the delta cache.
 *
 * For each workspace with a usable last candle: if the cached pair matches
 * (same close and open), the cached delta is reused — the delta provably
 * cannot differ — otherwise the delta is re-derived and the cache entry
 * updated. Workspaces without a usable candle contribute 0 and are not
 * cached; workspaces absent from the frame drop out of the returned cache.
 *
 * @param frame - the current workspaces and their latest candles.
 * @param cache - the cache produced by the previous frame (may be empty).
 */
export function accumulateCodeIndex(
  frame: readonly WorkspaceDeltaInput[],
  cache: CodeIndexCache,
): CodeIndexResult {
  const next = new Map<string, CachedDelta>()
  let net = 0
  let changed = 0
  for (const workspace of frame) {
    const last = workspace.last
    if (last === undefined) continue
    const prior = cache.get(workspace.workspaceId)
    if (prior !== undefined && prior.close === last.close && prior.open === last.open) {
      net += prior.delta
      next.set(workspace.workspaceId, prior)
    } else {
      const delta = last.close - last.open
      net += delta
      changed += 1
      next.set(workspace.workspaceId, { close: last.close, open: last.open, delta })
    }
  }
  return { net, cache: next, changed }
}
