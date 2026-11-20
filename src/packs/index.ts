/**
 * The registries. To support a new ecosystem or language, add a pack file and
 * list it here; the engines need no change. Order matters only where noted.
 */
import * as path from "path";
import { cargo } from "./ecosystems/cargo";
import { composer } from "./ecosystems/composer";
import { dotnet } from "./ecosystems/dotnet";
import { goModules } from "./ecosystems/go";
import { javascript } from "./ecosystems/javascript";
import { jvm } from "./ecosystems/jvm";
import { markersOnly } from "./ecosystems/markersOnly";
import { python as pythonProjects } from "./ecosystems/python";
import { csharp } from "./languages/csharp";
import { generic } from "./languages/generic";
import { go } from "./languages/go";
import { java } from "./languages/java";
import { php } from "./languages/php";
import { python } from "./languages/python";
import { ruby } from "./languages/ruby";
import { rust } from "./languages/rust";
import { typescript } from "./languages/typescript";
import type { EcosystemPack, LanguagePack, MarkerRule } from "./types";

export * from "./types";

/** Folder view. Order: a project with names in several namespaces is labelled by the first pack's name. */
export const ECOSYSTEM_PACKS: EcosystemPack[] = [javascript, composer, goModules, dotnet, pythonProjects, jvm, cargo, markersOnly];

/** Every marker, in label priority order. */
export const MARKER_RULES: MarkerRule[] = ECOSYSTEM_PACKS.flatMap((p) => p.markers).sort((a, b) => a.priority - b.priority);

/** Class explorer. The generic pack answers for its extensions and is the fallback. */
export const LANGUAGE_PACKS: LanguagePack[] = [typescript, go, csharp, php, python, java, rust, ruby, generic];

export function languagePackFor(file: string): LanguagePack | undefined {
  const ext = path.extname(file).toLowerCase();
  return LANGUAGE_PACKS.find((p) => p.extensions.includes(ext));
}

/** The pack whose rules apply to a file inside the explorer engine (unknown files: the generic rules). */
export function rulesFor(file: string): LanguagePack {
  return languagePackFor(file) ?? generic;
}
