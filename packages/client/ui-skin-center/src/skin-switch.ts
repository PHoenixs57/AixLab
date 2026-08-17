/**
 * In-process skin switching for the deepseek-aix skin center.
 *
 * The active skin is represented by ONE inserted `dsh.client` row in the
 * running profile's `cordis.patch.yml`:
 *
 *     # --- dsh-skin managed (auto-generated; do not edit) ---
 *     - insert:
 *         - id: ui-skin-home
 *           name: '@deepseek-ai/dsh-client-ui-skin-home'
 *     # --- end dsh-skin managed ---
 *
 * The section is rewritten atomically on every apply. The skin packages
 * themselves stay in-box under `packages/client/ui-skin-*`; the web-app
 * bundle depends on every one of them, so the launcher's installation
 * fallback (`$DSH_HOME/profiles/node_modules`) already resolves them for the
 * profile. The DSH config watcher hot-reloads the profile patch, and the
 * browser refreshes once the boot manifest catches up.
 */

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MANAGED_START = '# --- dsh-skin managed (auto-generated; do not edit) ---'
export const MANAGED_END = '# --- end dsh-skin managed ---'

/** Sibling directory holding every ui-skin-* package. */
export const SKINS_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const SKIN_PACKAGE_RE = /^@deepseek-ai\/dsh-client-ui-skin-[a-z0-9-]+$/
const SKIN_ID_RE = /^[a-z0-9-]+$/

export interface SkinSwitchEntry {
  /** Skin id (packages/client/ui-skin-<id>/skin.json). */
  id: string
  /** Plugin package name. */
  package: string
  /** Absolute package directory. */
  dir: string
  /** Loader entry id used by the inserted patch row. */
  wiringId: string
}

/** Enumerate installed in-box skins from packages/client/ui-skin-<id>. */
export function listSkinDirs(skinsRoot: string = SKINS_ROOT): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(skinsRoot)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.startsWith('ui-skin-') || entry === 'ui-skin-center') continue
    const dir = joinPath(skinsRoot, entry)
    if (statSync(joinPath(dir, 'skin.json'), { throwIfNoEntry: false })) out.push(dir)
  }
  return out.sort()
}

/** Read the switch-relevant fields from one skin.json. */
export function loadRegistry(skinsRoot: string = SKINS_ROOT): Record<string, SkinSwitchEntry> {
  const out: Record<string, SkinSwitchEntry> = {}
  for (const dir of listSkinDirs(skinsRoot)) {
    let meta: { id?: unknown; package?: unknown; wiring?: { id?: unknown } }
    try {
      meta = JSON.parse(readFileSync(joinPath(dir, 'skin.json'), 'utf8')) as { id?: unknown; package?: unknown; wiring?: { id?: unknown } }
    } catch {
      continue
    }
    if (typeof meta.id !== 'string' || !SKIN_ID_RE.test(meta.id)) continue
    if (typeof meta.package !== 'string' || !SKIN_PACKAGE_RE.test(meta.package)) continue
    const wiringId = meta.wiring?.id
    if (typeof wiringId !== 'string' || !wiringId.startsWith('ui-skin-')) continue
    out[meta.id] = { id: meta.id, package: meta.package, dir, wiringId }
  }
  return out
}

/** Resolve the DSH harness home exactly like the launcher. */
function resolveHarnessHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DSH_HOME?.trim()
  if (explicit !== undefined && explicit !== '') return explicit
  return joinPath(homedir(), '.dsh')
}

/** The running profile name (the launcher defaults to `web`). */
function resolveProfile(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DSH_SKIN_PROFILE?.trim() || env.DSH_PROFILE?.trim() || env.DSH_PROFILE_NAME?.trim()
  if (explicit !== undefined && explicit !== '') return explicit
  return 'web'
}

/** Paths the skin switch owns. */
export interface SkinSwitchPaths {
  /** `<harnessHome>/profiles/<profile>/cordis.patch.yml`. */
  patchPath: string
  /** `<harnessHome>/profiles/node_modules` (the launcher's flat fallback). */
  fallbackModulesDir: string
  /** `<harnessHome>/profiles/<profile>/node_modules`. */
  profileModulesDir: string
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): SkinSwitchPaths {
  const home = resolveHarnessHome(env)
  const profile = resolveProfile(env)
  return {
    patchPath: joinPath(home, 'profiles', profile, 'cordis.patch.yml'),
    fallbackModulesDir: joinPath(home, 'profiles', 'node_modules'),
    profileModulesDir: joinPath(home, 'profiles', profile, 'node_modules'),
  }
}

function readPatch(patchPath: string): string {
  try {
    return readFileSync(patchPath, 'utf8')
  } catch {
    return ''
  }
}

/** Remove the managed skin section (both delimiter lines and everything between). */
export function stripManaged(patch: string): string {
  const lines = patch.split(/\r?\n/)
  const kept: string[] = []
  let inManaged = false
  for (const line of lines) {
    if (line.trim() === MANAGED_START) {
      inManaged = true
      continue
    }
    if (line.trim() === MANAGED_END) {
      inManaged = false
      continue
    }
    if (!inManaged) kept.push(line)
  }
  if (inManaged) throw new Error('managed skin section is unterminated; fix the profile cordis.patch.yml')
  return kept.join('\n')
}

/** Return the managed section lines (may be empty for the official look). */
function managedLines(active: string | null, registry: Record<string, SkinSwitchEntry>): string[] {
  if (active === null) return []
  const entry = registry[active]
  if (entry === undefined) throw new Error(`unknown skin "${active}"`)
  return [MANAGED_START, '- insert:', `    - id: ${entry.wiringId}`, `      name: ${yamlSingleQuote(entry.package)}`, MANAGED_END]
}

/**
 * Insert the managed lines into a top-level YAML sequence. The profile patch
 * is an ARRAY document (commonly `[]` or a block sequence), so the managed
 * lines must become sequence items, never a second document after a flow `[]`.
 */
function hasSequenceEntry(text: string): boolean {
  return text.split('\n').some((line) => {
    const trimmed = line.trim()
    return /^\s*-\s/.test(line) || trimmed === '[]' || trimmed === '[' || trimmed === ']'
  })
}

function patchWithManaged(patch: string, managed: string[]): string {
  const stripped = stripManaged(patch)
  if (managed.length === 0) {
    // An empty array document still needs the `[]` placeholder (comments
    // alone parse as null, not as an array).
    return hasSequenceEntry(stripped)
      ? stripped
      : `${stripped.replace(/\s+$/, '')}\n[]\n`
  }

  const lines = stripped.split('\n')
  // Case 1: the shipped placeholder `[]` on a line by itself (comments around
  // it allowed). The managed lines are top-level sequence items, so they
  // replace the flow placeholder directly — a flow sequence cannot contain
  // `- item` entries.
  for (let i = 0; i < lines.length; i += 1) {
    const candidate = lines[i]
    if (candidate !== undefined && candidate.trim() === '[]') {
      lines.splice(i, 1, ...managed)
      return lines.join('\n')
    }
  }
  // Case 2: a block sequence already wrapped in `[ ... ]`. Convert it to the
  // equivalent bare top-level sequence and prepend the managed entries.
  const firstSignificant = lines.findIndex(line => line.trim() !== '' && !line.trim().startsWith('#'))
  const opener = firstSignificant < 0 ? undefined : lines[firstSignificant]
  if (opener !== undefined && opener.trim() === '[') {
    let close = -1
    for (let i = lines.length - 1; i > firstSignificant; i -= 1) {
      const candidate = lines[i]
      if (candidate !== undefined && candidate.trim() === ']') { close = i; break }
    }
    if (close >= 0) {
      const inner = lines.slice(firstSignificant + 1, close)
        .map(line => line.startsWith('  ') ? line.slice(2) : line)
      lines.splice(firstSignificant, close - firstSignificant + 1, ...managed, ...inner)
      return lines.join('\n')
    }
  }
  // Case 3: a bare top-level sequence (`- id: ...` entries without brackets).
  let firstEntry = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line !== undefined && /^\s*-\s/.test(line)) { firstEntry = i; break }
  }
  if (firstEntry >= 0) {
    lines.splice(firstEntry, 0, ...managed)
    return lines.join('\n')
  }
  // Case 4: empty/unrecognized patch — the managed lines themselves form a
  // valid bare top-level YAML sequence.
  return `${managed.join('\n')}\n`
}

/** YAML single-quoted scalar. */
function yamlSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Render the managed section for one active skin (null = official stock look). */
export function renderManaged(active: string | null, registry: Record<string, SkinSwitchEntry>): string {
  return managedLines(active, registry).join('\n')
}

/** The currently active skin id, read from the managed section. */
export function currentActive(patch: string, registry: Record<string, SkinSwitchEntry>): string | null {
  const start = patch.indexOf(MANAGED_START)
  if (start === -1) return null
  const end = patch.indexOf(MANAGED_END, start)
  if (end === -1) return null
  const section = patch.slice(start, end)
  for (const entry of Object.values(registry)) {
    if (section.includes(`name: ${yamlSingleQuote(entry.package)}`) || section.includes(`name: '${entry.package}'`)) {
      return entry.id
    }
  }
  return null
}

/** Atomic patch write: sibling temp file + rename, preserving mode. */
function writePatchAtomic(patchPath: string, next: string): void {
  const dir = dirname(patchPath)
  mkdirSync(dir, { recursive: true })
  const temp = joinPath(dir, `${basename(patchPath)}.tmp-${process.pid}-${Date.now()}`)
  writeFileSync(temp, next, { mode: 0o600 })
  try {
    renameSync(temp, patchPath)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

/** Ensure the flat fallback symlink makes the skin package resolvable now. */
function ensureResolvable(entry: SkinSwitchEntry, paths: SkinSwitchPaths): void {
  const linkParent = joinPath(paths.fallbackModulesDir, '@deepseek-ai')
  mkdirSync(linkParent, { recursive: true })
  const link = joinPath(linkParent, basename(entry.package))
  try {
    const stat = statSync(link, { throwIfNoEntry: false })
    if (stat?.isDirectory()) return // an already-resolvable real directory wins
  } catch {
    // fall through and (re)create the link
  }
  try {
    symlinkSync(entry.dir, link, 'junction')
  } catch (error) {
    // Concurrent launchers may heal the same fallback; an identical link is success.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const profileLinkParent = joinPath(paths.profileModulesDir, '@deepseek-ai')
  mkdirSync(profileLinkParent, { recursive: true })
  const profileLink = joinPath(profileLinkParent, basename(entry.package))
  try {
    statSync(profileLink)
  } catch {
    try { symlinkSync(entry.dir, profileLink, 'junction') } catch { /* fallback already resolves */ }
  }
}

/**
 * Switch the active skin. Equivalent to `dsh-skin use <name>` for in-box
 * skins: rewrites the managed section of the profile patch atomically.
 * @param name - skin id, or `official` for the stock look.
 */
export function useSkin(name: string, opts: { env?: NodeJS.ProcessEnv; registry?: Record<string, SkinSwitchEntry> } = {}): string {
  const official = name === 'official'
  const registry = opts.registry ?? loadRegistry()
  if (!official && registry[name] === undefined) {
    throw new Error(`unknown skin "${name}". Known: ${Object.keys(registry).sort().join(', ')} (or "official" for the stock look)`)
  }
  const paths = resolvePaths(opts.env)
  if (!official) {
    const entry = registry[name]
    if (entry === undefined) throw new Error(`unknown skin "${name}"`)
    ensureResolvable(entry, paths)
  }
  const patch = readPatch(paths.patchPath)
  const next = patchWithManaged(patch, managedLines(official ? null : name, registry))
  writePatchAtomic(paths.patchPath, next.endsWith('\n') ? next : `${next}\n`)
  return official
    ? 'restored the official stock look — the config watcher applies it within seconds; refresh the page to see it.'
    : `skin switched to "${name}" — the config watcher applies it within seconds; refresh the page to see it.`
}

/** Return the active skin id (`none` when official). */
export function currentSkin(): string {
  const registry = loadRegistry()
  const paths = resolvePaths()
  return currentActive(readPatch(paths.patchPath), registry) ?? 'none'
}
