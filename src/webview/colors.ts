/**
 * Diagram colours: "light" (the colours the diagrams are written with) or
 * "editor" (taken from the VS Code theme, set by
 * `vscode-mermaid-extension.diagramColors`).
 *
 * The extension's own views are written with fixed light colours, so a saved
 * `.mmd` looks the same anywhere. In "editor" mode each of those colours is a
 * role (box, entry point, neighbour, focus...) and is drawn in the theme's
 * colour for that role. Mermaid's own colours (lines, labels, default boxes)
 * come from its base theme with variables from the VS Code theme. A diagram
 * that sets its own theme (`%%{init: {"theme": …}}%%` or front matter
 * `config: theme:`) keeps it.
 */

export type ColorMode = "light" | "editor";

let mode: ColorMode = "light";

export function colorMode(): ColorMode {
  return mode;
}

export function setColorMode(next: string | undefined): boolean {
  const value: ColorMode = next === "editor" ? "editor" : "light";
  const changed = value !== mode;
  mode = value;
  document.body.classList.toggle("colors-editor", mode === "editor");
  return changed;
}

type RGBA = [number, number, number, number];

/** A CSS colour (any syntax the browser knows, including var()) as RGBA, via the browser. */
function resolve(css: string): RGBA | undefined {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = css;
  if (!probe.style.color) {
    return undefined;
  }
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const n = value.match(/[\d.]+/g)?.map(Number);
  if (!n || n.length < 3) {
    return undefined;
  }
  // rgb()/rgba() give 0-255; color(srgb …) gives 0-1.
  const scale = value.startsWith("color(") ? 255 : 1;
  const [r, g, b] = n.slice(0, 3).map((x) => x * scale);
  return [r, g, b, n[3] ?? 1];
}

const varColor = (name: string): RGBA | undefined => {
  const raw = getComputedStyle(document.body).getPropertyValue(name).trim() || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? resolve(raw) : undefined;
};

/** `a` over `b` by `t` (0: b, 1: a), alpha composited first. */
const mix = (a: RGBA, b: RGBA, t: number): RGBA => {
  const over = (c: RGBA): RGBA => [c[0] * c[3] + b[0] * (1 - c[3]), c[1] * c[3] + b[1] * (1 - c[3]), c[2] * c[3] + b[2] * (1 - c[3]), 1];
  const x = over(a);
  return [x[0] * t + b[0] * (1 - t), x[1] * t + b[1] * (1 - t), x[2] * t + b[2] * (1 - t), 1];
};

/** Mermaid style lists are comma-separated, so colours are written as hex. */
const hex = (c: RGBA) => "#" + c.slice(0, 3).map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");

/** Relative luminance (WCAG). */
export function luminance(c: RGBA): number {
  const [r, g, b] = c.slice(0, 3).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two opaque colours. */
export function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or black, whichever reads better on `c`. */
const onColor = (c: RGBA) => (contrast(c, [255, 255, 255, 1]) >= contrast(c, [0, 0, 0, 1]) ? "#ffffff" : "#000000");

export interface Palette {
  dark: boolean;
  background: string;
  text: string;
  muted: string;
  box: string;
  boxBorder: string;
  line: string;
  accent: string;
  green: string;
  amber: string;
  red: string;
  onAccent: string;
  onAmber: string;
  /** The light colour each diagram colour is written with -> its colour in this theme. */
  roles: Record<string, string>;
}

/** The palette for the current VS Code theme (from the webview's --vscode-* variables). */
export function editorPalette(): Palette {
  const white: RGBA = [255, 255, 255, 1];
  const background = varColor("--vscode-editor-background") ?? white;
  const dark = luminance(mix(background, white, 1)) < 0.4;
  const text = varColor("--vscode-editor-foreground") ?? (dark ? [204, 204, 204, 1] : [36, 41, 47, 1]);
  const tint = (t: number) => mix(text, background, t);
  // Any theme: colours it leaves out are mixed from its text and background,
  // and a box or label that would be hard to read falls back to those two.
  const opaque = (c: RGBA) => mix(c, background, 1);
  let box = varColor("--vscode-editorWidget-background") ?? tint(0.04);
  if (contrast(opaque(text), opaque(box)) < 4.5) {
    box = background;
  }
  const highContrast = varColor("--vscode-contrastBorder");
  const boxBorder = highContrast ?? varColor("--vscode-editorWidget-border") ?? tint(0.35);
  const mutedSeen = varColor("--vscode-descriptionForeground");
  const muted = mutedSeen && contrast(opaque(mutedSeen), opaque(tint(0.06))) >= 3 ? mutedSeen : tint(0.75);
  // Marks (rings, badge, entry points, the file's own classes) must stand out from the page:
  // the first candidate the theme defines with enough contrast, else a fixed colour lifted until it does.
  const stands = (candidates: (RGBA | undefined)[], fixed: RGBA): RGBA => {
    const found = candidates.find((c) => c && contrast(opaque(c), opaque(background)) >= 3);
    if (found) {
      return found;
    }
    let c = fixed;
    for (let t = 0.1; contrast(opaque(c), opaque(background)) < 3 && t <= 1; t += 0.1) {
      c = mix(text, fixed, t);
    }
    return c;
  };
  const accent = stands([varColor("--vscode-focusBorder"), varColor("--vscode-textLink-foreground"), varColor("--vscode-charts-blue")], [99, 102, 241, 1]);
  const green = stands([varColor("--vscode-charts-green"), varColor("--vscode-terminal-ansiGreen")], [22, 163, 74, 1]);
  const amber = stands([varColor("--vscode-charts-orange"), varColor("--vscode-editorWarning-foreground")], [245, 158, 11, 1]);
  const red = stands([varColor("--vscode-charts-red"), varColor("--vscode-editorError-foreground")], [225, 29, 72, 1]);
  const solid = (c: RGBA) => hex(mix(c, background, 1));
  const p = {
    dark,
    background: solid(background),
    text: solid(text),
    muted: solid(muted),
    box: solid(box),
    boxBorder: solid(boxBorder),
    line: hex(tint(0.6)),
    accent: solid(accent),
    green: solid(green),
    amber: solid(amber),
    red: solid(red),
    onAccent: onColor(opaque(accent)),
    onAmber: onColor(opaque(amber)),
  };
  return {
    ...p,
    roles: {
      // Boxes (project and repository views)
      "#ffffff": p.box,
      "#94a3b8": p.boxBorder,
      "#0f172a": p.text,
      // Entry points
      "#f0fdf4": hex(mix(green, background, 0.16)),
      "#16a34a": p.green,
      "#14532d": p.text,
      // Faint boxes: other files, markers, "+N more"
      "#fafafa": hex(tint(0.03)),
      "#d4d4d8": hex(tint(0.22)),
      "#52525b": p.muted,
      "#71717a": p.muted,
      // Outside this folder or project
      "#f8fafc": hex(tint(0.02)),
      "#cbd5e1": hex(tint(0.18)),
      "#64748b": p.muted,
      // Class view neighbours (dashed boxes)
      "#f4f4f5": hex(tint(0.06)),
      "#a1a1aa": hex(tint(0.35)),
      // The file's own classes
      "#e11d48": p.red,
    },
  };
}

/** A diagram that chooses its own theme keeps it. */
export function setsOwnTheme(md: string): boolean {
  return /%%\{\s*init\s*:[\s\S]*?["']?theme["']?\s*:/.test(md) || /^---\s*\n[\s\S]*?\n\s*theme\s*:[\s\S]*?\n---/m.test(md);
}

/**
 * The extension's diagram colours in the theme's colours: only in `classDef`
 * and `style` lines, and only the colours the views are written with.
 */
export function recolor(md: string, palette: Palette): string {
  return md.replace(/^(\s*(?:classDef|style)\s.*)$/gm, (line) =>
    line.replace(/#[0-9a-fA-F]{6}\b/g, (c) => palette.roles[c.toLowerCase()] ?? c)
  );
}

/** Mermaid's base theme with variables from the palette. */
export function mermaidTheme(palette: Palette): Record<string, unknown> {
  return {
    theme: "base",
    themeVariables: {
      darkMode: palette.dark,
      background: palette.background,
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      primaryColor: palette.box,
      primaryTextColor: palette.text,
      primaryBorderColor: palette.boxBorder,
      secondaryColor: palette.box,
      tertiaryColor: palette.background,
      mainBkg: palette.box,
      nodeBorder: palette.boxBorder,
      lineColor: palette.line,
      textColor: palette.text,
      titleColor: palette.text,
      edgeLabelBackground: palette.background,
      clusterBkg: palette.background,
      clusterBorder: palette.boxBorder,
      classText: palette.text,
      noteBkgColor: palette.box,
      noteTextColor: palette.text,
      noteBorderColor: palette.boxBorder,
    },
  };
}

const PANEL_VARIABLES = ["--accent", "--accent-soft", "--ink", "--muted", "--line", "--surface", "--page", "--amber", "--green", "--on-accent", "--on-amber", "--track"];

/** Sets the panel's own colours (toolbar, loading scene, rings) for the palette; none restores the light ones. */
export function applyPanelVariables(palette: Palette | undefined) {
  const root = document.documentElement.style;
  if (!palette) {
    PANEL_VARIABLES.forEach((name) => root.removeProperty(name));
    return;
  }
  for (const entry of panelVariables(palette).split("; ")) {
    const at = entry.indexOf(":");
    root.setProperty(entry.slice(0, at), entry.slice(at + 1).trim());
  }
}

/** CSS custom properties for the panel's own chrome in "editor" mode. */
export function panelVariables(palette: Palette): string {
  return [
    `--accent: ${palette.accent}`,
    `--accent-soft: ${palette.accent}33`,
    `--ink: ${palette.text}`,
    `--muted: ${palette.muted}`,
    `--line: ${palette.boxBorder}`,
    `--surface: ${palette.box}`,
    `--page: ${palette.background}`,
    `--amber: ${palette.amber}`,
    `--green: ${palette.green}`,
    `--on-accent: ${palette.onAccent}`,
    `--on-amber: ${palette.onAmber}`,
    `--track: ${palette.boxBorder}55`,
  ].join("; ");
}

/** The page around the diagram in "editor" mode. */
export const EDITOR_PAGE_STYLE = `
body.colors-editor { background: var(--page) !important; color: var(--ink) !important; }
body.colors-editor #content { border-color: var(--line) !important; }
body.colors-editor .svg-pan-zoom-control { fill: var(--ink) !important; fill-opacity: .55 !important; }
body.colors-editor .svg-pan-zoom-control-background { fill: var(--page) !important; fill-opacity: 1 !important; }
`;

