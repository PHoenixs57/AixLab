/**
 * Single-timer multi-cadence refresher for the trading skin pollers.
 *
 * The skin previously ran three independently-scheduled setInterval loops
 * (quotes/workspaces every 30s, sessions every 60s). This scheduler owns
 * exactly ONE interval and, on each tick, runs only the jobs whose own
 * period has elapsed since their last run — preserving each cadence
 * (30s / 30s / 60s) while holding a single timer to own and dispose.
 *
 * Pure scheduling, no DOM or I/O: jobs are plain callables and the tick
 * clock uses Date.now(), so tests can drive it deterministically with fake
 * timers (advancing Date.now via vi.setSystemTime or real timers).
 */

/** One refresh job with its own cadence. */
export interface RefreshJob {
  /** Minimum elapsed ms before the job runs again. */
  periodMs: number
  /** The work to perform when due. */
  run: () => void
}

/** A started/stopped scheduler handle. */
export interface RefreshScheduler {
  /** Kick off the single interval (no-op when already started). */
  start: () => void
  /** Stop and clear the interval (idempotent). */
  stop: () => void
}

/**
 * Create a scheduler that drives all jobs from one <code>tickMs</code>
 * interval, gating each job by its own <code>periodMs</code>. On start every
 * job's clock begins at the start time, so the first tick runs jobs due
 * since start; <code>stop</code> clears the interval so no work leaks.
 */
export function createRefreshScheduler(jobs: readonly RefreshJob[], tickMs: number): RefreshScheduler {
  const lastRun = new Map<RefreshJob, number>()
  let timer: ReturnType<typeof setInterval> | null = null

  const tick = (): void => {
    const now = Date.now()
    for (const job of jobs) {
      const last = lastRun.get(job) ?? now
      if (now - last >= job.periodMs) {
        lastRun.set(job, now)
        job.run()
      }
    }
  }

  return {
    start: () => {
      if (timer !== null) return
      const now = Date.now()
      for (const job of jobs) lastRun.set(job, now)
      timer = setInterval(tick, tickMs)
    },
    stop: () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
