import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

/**
 * One SVG source, every copy a project actually publishes — plus the social
 * card — rendered from that one source so they cannot drift.
 *
 * ## Why four copies of one drawing exist
 *
 * Dark mode inside an SVG (`@media (prefers-color-scheme: dark)`) does work when
 * the SVG is embedded with `<img>` — but it follows the *operating system*, not
 * the theme toggle of the site showing it. Someone reading GitHub in dark mode
 * on a light OS gets the light drawing on a dark page: transparent artwork
 * disappears, and an opaque white one is a glaring slab. So the colours are not
 * chosen by the SVG:
 *
 * | File | Palette | Background | Consumer |
 * | --- | --- | --- | --- |
 * | `*-light.svg` | light | transparent | GitHub in light mode, via `<picture>` |
 * | `*-dark.svg` | dark | transparent | GitHub in dark mode, via `<picture>` |
 * | `*.svg` | dark | its own card | npm, which strips `<picture>` |
 * | inline in the home page | none | none | a docs site, via CSS variables |
 *
 * `<picture>` is evaluated against the *page's* colour scheme, which is why
 * GitHub gets it right. npm removes `<picture>`/`<source>` when it sanitises a
 * README and keeps the `<img>`, so that fallback has to stand on its own: it
 * carries its own dark card and no media query, which reads as deliberate on a
 * white page and blends into a dark one.
 */

export interface AssetSetOptions {
  /** Project root. Defaults to the current working directory. */
  root?: string;
  /** The one drawing everything is rendered from. */
  source?: string;
  /** Where the standalone copies are written. */
  publicDir?: string;
  /** A page carrying the inline copy between two markers. Empty string to skip. */
  homePage?: string;
  /** Copy for the social card: `{ title?, tagline: string[], badges: string[] }`. */
  card?: string;
  /** The site name printed on the card. Defaults to the contents of `<publicDir>/CNAME`. */
  site?: string;
  /** Base name of the standalone copies. Defaults to the source file's own stem minus `.source`. */
  name?: string;
}

export interface AssetSetReport {
  /** Files written, or — in check mode — files that would have been. */
  changed: string[];
  /** Human-readable complaints. Non-empty means `check` failed. */
  problems: string[];
}

/** GitHub's social preview, and what it rejects. */
const OG_WIDTH = 1280;
const OG_HEIGHT = 640;
const OG_MAX_BYTES = 1024 * 1024;

const START = 'ARCHITECTURE:START';
const END = '<!-- ARCHITECTURE:END -->';

/**
 * Shared by every rendered palette. Only the colours differ; keeping the
 * geometry rules identical is what makes the copies look like one drawing.
 */
const SHAPES = `
    .node { stroke-width: 1.25; }
    .node-accent { stroke-width: 1.5; }
    .edge { stroke-width: 1.5; fill: none; }
    .edge-accent { stroke-width: 1.75; fill: none; }
    .edge-dashed { stroke-dasharray: 5 4; }
    text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif; font-size: 13px; }
    .label-title { font-size: 13.5px; font-weight: 600; }
    .label-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 12px; }
    .label-muted { font-size: 11.5px; }`;

/**
 * `.label-muted` is deliberately darker here than the slate-500 the dark palette
 * uses: on the near-white `.node` fill, slate-500 sits just under the 4.5:1 that
 * small type needs.
 */
const LIGHT = `
    .node { fill: #f8fafc; stroke: #94a3b8; }
    .node-accent { fill: rgba(99, 102, 241, 0.12); stroke: #4f46e5; }
    .edge { stroke: #94a3b8; }
    .edge-accent { stroke: #4f46e5; }
    text { fill: #0f172a; }
    .label-muted { fill: #475569; }
    marker path { fill: #94a3b8; stroke: none; }
    marker.accent path { fill: #4f46e5; }`;

const DARK = `
    .node { fill: rgba(148, 163, 184, 0.10); stroke: #64748b; }
    .node-accent { fill: rgba(129, 140, 248, 0.16); stroke: #a5b4fc; }
    .edge { stroke: #64748b; }
    .edge-accent { stroke: #a5b4fc; }
    text { fill: #e2e8f0; }
    .label-muted { fill: #94a3b8; }
    marker path { fill: #64748b; stroke: none; }
    marker.accent path { fill: #a5b4fc; }`;

/** Padding between the artwork and the edge of the fallback's own card. */
const CARD_PAD = 24;
const CARD_SURFACE = `
    .surface { fill: #0f172a; stroke: #1e293b; stroke-width: 1; }`;

interface Source {
  viewBox: string;
  width: number;
  height: number;
  body: string;
  labelledBy: string | undefined;
}

interface Resolved {
  root: string;
  source: string;
  publicDir: string;
  homePage: string;
  card: string;
  site: string;
  name: string;
}

function resolve(options: AssetSetOptions): Resolved {
  const root = options.root ?? process.cwd();
  const publicDir = join(root, options.publicDir ?? join('docs', 'public'));
  const source = join(
    root,
    options.source ?? join('docs', 'assets', 'architecture.source.svg')
  );
  const stem = (source.split(/[\\/]/).pop() ?? '').replace(
    /\.source\.svg$|\.svg$/,
    ''
  );
  return {
    root,
    source,
    publicDir,
    homePage:
      options.homePage === ''
        ? ''
        : join(root, options.homePage ?? join('docs', 'index.md')),
    card: join(root, options.card ?? join('docs', 'assets', 'og.json')),
    site: options.site ?? readFileSync(join(publicDir, 'CNAME'), 'utf8').trim(),
    name: options.name ?? stem,
  };
}

const banner = (source: string, extra?: string): string =>
  [
    '<!--',
    '  GENERATED FILE — do not edit by hand.',
    `  Source: ${source}`,
    '  Regenerate with: npm run assets',
    ...(extra === undefined ? [] : [`  ${extra}`]),
    '-->',
  ].join('\n');

/** Splits the source into the parts each output recombines differently. */
export function parseSource(svg: string, where = '<source>'): Source {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) throw new Error(`no <svg> element in ${where}`);

  const viewBox = /viewBox="([^"]+)"/.exec(open[0])?.[1];
  if (!viewBox) throw new Error(`no viewBox in ${where}`);

  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`unreadable viewBox "${viewBox}" in ${where}`);
  }

  const body = svg
    .slice(svg.indexOf(open[0]) + open[0].length, svg.lastIndexOf('</svg>'))
    .replace(/^\n/, '')
    .replace(/\s+$/, '');

  // The single rule the source has to follow. Colours in the source would win
  // over the palettes below, so the light copy would come out dark and nobody
  // would know why.
  if (/<style\b/.test(body) || /(fill|stroke)="#/.test(body)) {
    throw new Error(
      `${where} carries its own colours — it must only use the CSS classes; the palette comes from here`
    );
  }

  const labelledBy = /aria-labelledby="([^"]+)"/.exec(open[0])?.[1];
  return { viewBox, width: w as number, height: h as number, body, labelledBy };
}

/** Splits `<title>`/`<desc>` off the body: the card variant keeps them unshifted. */
function splitAccessibleNames(body: string): { names: string; rest: string } {
  const names: string[] = [];
  const rest = body.replace(
    /^\s*<(title|desc)\b[\s\S]*?<\/\1>\n?/gm,
    (match) => {
      names.push(match.trimEnd());
      return '';
    }
  );
  return { names: names.join('\n'), rest: rest.replace(/^\n+/, '') };
}

function standalone(
  source: Source,
  palette: string,
  sourceName: string
): string {
  const { names, rest } = splitAccessibleNames(source.body);
  const labelled =
    source.labelledBy === undefined
      ? ''
      : ` aria-labelledby="${source.labelledBy}"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
${banner(sourceName)}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${source.viewBox}" width="${source.width}" height="${source.height}" role="img"${labelled}>
${names}

  <style>${SHAPES}
${palette}
  </style>

${rest}
</svg>
`;
}

/**
 * The npm fallback. Same drawing as the dark variant, but on a card of its own
 * so it never depends on what colour the surrounding page happens to be.
 */
function carded(source: Source, sourceName: string): string {
  const { names, rest } = splitAccessibleNames(source.body);
  const w = source.width + CARD_PAD * 2;
  const h = source.height + CARD_PAD * 2;
  const indented = rest.replace(/^(?=.)/gm, '  ');
  const labelled =
    source.labelledBy === undefined
      ? ''
      : ` aria-labelledby="${source.labelledBy}"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
${banner(sourceName, 'This copy is what npm shows: it brings its own background on purpose.')}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"${labelled}>
${names}

  <style>${SHAPES}
${DARK}
${CARD_SURFACE}
  </style>

  <rect class="surface" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" />

  <g transform="translate(${CARD_PAD}, ${CARD_PAD})">
${indented}
  </g>
</svg>
`;
}

/** The docs-site copy: no palette at all, the theme's CSS variables drive it. */
function inline(source: Source): string {
  const labelled =
    source.labelledBy === undefined
      ? ''
      : ` aria-labelledby="${source.labelledBy}"`;
  return `<svg viewBox="${source.viewBox}" role="img"${labelled}>
${source.body}
</svg>`;
}

const escapeXml = (value: string): string =>
  value.replace(
    /[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c
  );

/**
 * Rough advance width for the pill sizing. The renderer gives no text metrics,
 * and a badge only has to enclose its label with a bit of air, so an estimate
 * that errs wide is adequate — and it keeps the output deterministic.
 */
const textWidth = (text: string, size: number): number =>
  text.length * size * 0.6;

export interface CardCopy {
  /**
   * Overrides the heading.
   *
   * For a scoped package: `package.json` says `@scope/thing`, but the card
   * should say `thing`.
   */
  title?: string;
  /** Split by hand — the renderer does not wrap text. */
  tagline: string[];
  badges: string[];
}

export function cardSvg(
  copy: CardCopy & { name: string; site: string }
): string {
  const pills: string[] = [];
  let x = 96;
  for (const badge of copy.badges) {
    const w = Math.round(textWidth(badge, 24) + 48);
    pills.push(
      `  <rect class="pill" x="${x}" y="452" width="${w}" height="52" rx="26" />`,
      `  <text class="pill-label" x="${x + w / 2}" y="486" text-anchor="middle">${escapeXml(badge)}</text>`
    );
    x += w + 20;
  }

  const lines = copy.tagline.map(
    (line, i) =>
      `  <text class="tagline" x="96" y="${330 + i * 46}">${escapeXml(line)}</text>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" width="${OG_WIDTH}" height="${OG_HEIGHT}">
  <style>
    text { font-family: Inter, "Fira Sans", "DejaVu Sans", sans-serif; }
    .title { font-size: 72px; font-weight: 700; fill: #e2e8f0; }
    .tagline { font-size: 32px; fill: #94a3b8; }
    .pill { fill: rgba(129, 140, 248, 0.12); stroke: #334155; stroke-width: 1.5; }
    .pill-label { font-size: 24px; fill: #a5b4fc; }
    .site { font-size: 22px; fill: #64748b; }
  </style>

  <rect x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f172a" />
  <rect x="0" y="0" width="${OG_WIDTH}" height="6" fill="#4f46e5" />

  <circle cx="70" cy="224" r="12" fill="#a5b4fc" />
  <text class="title" x="96" y="248">${escapeXml(copy.name)}</text>

${lines.join('\n')}

${pills.join('\n')}

  <text class="site" x="${OG_WIDTH - 96}" y="486" text-anchor="end">${escapeXml(copy.site)}</text>
</svg>
`;
}

/** Everything both modes need to know, computed once. */
function plan(options: AssetSetOptions): {
  paths: Resolved;
  files: Map<string, string>;
  cardMarkup: string;
} {
  const paths = resolve(options);
  const sourceName = relative(paths.root, paths.source);
  const source = parseSource(readFileSync(paths.source, 'utf8'), sourceName);
  const copy = JSON.parse(readFileSync(paths.card, 'utf8')) as CardCopy & {
    title?: string;
  };
  const pkg = JSON.parse(
    readFileSync(join(paths.root, 'package.json'), 'utf8')
  ) as { name?: string };

  const files = new Map<string, string>([
    [
      join(paths.publicDir, `${paths.name}-light.svg`),
      standalone(source, LIGHT, sourceName),
    ],
    [
      join(paths.publicDir, `${paths.name}-dark.svg`),
      standalone(source, DARK, sourceName),
    ],
    [join(paths.publicDir, `${paths.name}.svg`), carded(source, sourceName)],
  ]);

  if (paths.homePage !== '') {
    // The page keeps its own prose; only the block between the markers is ours.
    const home = readFileSync(paths.homePage, 'utf8');
    const from = home.indexOf(START);
    const to = home.indexOf(END);
    if (from === -1 || to === -1) {
      throw new Error(
        `${relative(paths.root, paths.homePage)} is missing the ${START} / ${END} markers`
      );
    }
    const afterStart = home.indexOf('-->', from) + 3;
    files.set(
      paths.homePage,
      `${home.slice(0, afterStart)}\n${inline(source)}\n${home.slice(to)}`
    );
  }

  return {
    paths,
    files,
    cardMarkup: cardSvg({
      ...copy,
      name: copy.title ?? pkg.name ?? paths.name,
      site: paths.site,
    }),
  };
}

/** Writes every copy and renders the card. */
export function generate(options: AssetSetOptions = {}): AssetSetReport {
  const { paths, files, cardMarkup } = plan(options);
  const changed: string[] = [];

  for (const [file, content] of files) {
    let current: string | null = null;
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      /* missing counts as changed */
    }
    if (current === content) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    changed.push(relative(paths.root, file));
  }

  const png = new Resvg(cardMarkup, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  })
    .render()
    .asPng();
  const pngPath = join(paths.publicDir, 'og.png');
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, png);
  changed.push(relative(paths.root, pngPath));

  return { changed, problems: [] };
}

/**
 * Reports what is stale without writing anything.
 *
 * The card is checked by its **dimensions**, not its bytes: text rasterises
 * differently between machines and fonts, so comparing bytes would fail CI for
 * reasons that have nothing to do with the drawing.
 */
export function check(options: AssetSetOptions = {}): AssetSetReport {
  const { paths, files } = plan(options);
  const changed: string[] = [];
  const problems: string[] = [];

  for (const [file, content] of files) {
    let current: string | null = null;
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      /* missing counts as stale */
    }
    if (current === content) continue;
    const shown = relative(paths.root, file);
    changed.push(shown);
    problems.push(`${shown} is out of date — run: npm run assets`);
  }

  const pngPath = join(paths.publicDir, 'og.png');
  const shownPng = relative(paths.root, pngPath);
  let png: Buffer | null = null;
  try {
    png = readFileSync(pngPath);
  } catch {
    problems.push(`${shownPng} is missing — run: npm run assets`);
    return { changed, problems };
  }
  // A zero-length or half-written file would throw a RangeError out of the
  // header read below instead of reaching a message anyone can act on.
  if (png.length < 24) {
    problems.push(
      `${shownPng} is ${png.length} bytes — too short to be a PNG. Run: npm run assets`
    );
    return { changed, problems };
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== OG_WIDTH || height !== OG_HEIGHT) {
    problems.push(
      `${shownPng} is ${width}x${height}, GitHub's social preview wants ${OG_WIDTH}x${OG_HEIGHT}`
    );
  }
  if (png.length >= OG_MAX_BYTES) {
    problems.push(
      `${shownPng} is ${(png.length / 1024 / 1024).toFixed(2)} MB, GitHub rejects 1 MB and above`
    );
  }
  return { changed, problems };
}
