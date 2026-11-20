/**
 * The rule table for "Explore From Here" on a folder.
 *
 * The landscape is deterministic: every project, label and arrow comes from
 * one of these rules or an ecosystem pack's rules applied to the files on disk, so the same files always
 * give the same picture, and every element can say which rule produced it.
 * Nothing is inferred from script contents or from file/folder naming
 * conventions. Change these tables (and the docs) together.
 */

/** Folders that are never scanned (dependencies, build output, VCS data). */
export const IGNORED_FOLDERS = new Set(["node_modules", ".git", "vendor", "dist", "obj", ".nx", ".angular", "coverage"]);

/**
 * Project markers and reference rules live in the ecosystem packs
 * (src/packs/ecosystems); MARKER_RULES is all of their markers in label
 * priority order.
 */
export { MARKER_RULES } from "../packs";
export type { MarkerRule } from "../packs";

/** TypeScript declaration files (not source). */
export const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/** Presentation rules. */
export const MAX_ARROWS_PER_VIEW = 20;
export const GRID_ROW = 3;
