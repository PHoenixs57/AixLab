/**
 * Pure drag-to-composer helpers shared by the explorer rows (the drag source)
 * and the composer dock inlay (the drop target): the custom MIME type and the
 * drag-state detector. Deliberately framework-free so the drop detection is
 * unit-testable in isolation.
 *
 * The composer host only accepts OS image drops (its document-level drop
 * handler checks `dataTransfer.types` for `Files` and routes through the
 * image pipeline), so a workspace file needs its own MIME. The payload is a
 * workspace-relative path; on drop the dock inlay turns it into a reference
 * chip (see file-source.ts) rather than splicing raw text into the draft.
 * @module dsh-aionui-panel/client/drag/file-drag
 */

/** Custom MIME carrying a workspace-relative file path. */
export const FILE_DRAG_MIME = 'application/x-dsh-file'

/**
 * Whether a drag event carries our file payload.
 * @param types - the live `dataTransfer.types` list (read-only during drag).
 * @returns true when our MIME is present.
 */
export function hasFileDrag(types: readonly string[] | undefined): boolean {
  return types !== undefined && types.includes(FILE_DRAG_MIME)
}
